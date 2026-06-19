/**
 * 키움 OpenAPI fetch wrapper.
 *
 * 책임:
 * 1. access token 자동 attach
 * 2. token bucket rate limit (초당 3건 보수적 안전치, 공식 5건의 60%)
 * 3. 재시도 (429 / 5xx 지수 백오프 3회 — 250ms / 500ms / 1s)
 *
 * 사용처: TR 호출 (`tr/ka10001.ts`·`tr/ka10081.ts`) 만. UI/클라이언트는 본 모듈 직접 import 금지.
 */

import { getAccessToken, resolveKiwoomBaseUrl, resolveKiwoomEnv } from "./auth";
import { deduplicate } from "./dedup";
import { KiwoomError, type KiwoomEnv } from "./types";

/** 키움 본문 응답 코드 (HTTP 200 이어도 에러를 코드로 전달) */
const RC_TOKEN_INVALID = 3; // "인증에 실패했습니다[8005:Token이 유효하지 않습니다]"
const RC_RATE_EXCEEDED = 5; // "허용된 요청 개수를 초과하였습니다[1700]"

// ──────────────────────────────────────────────────────────
// Token Bucket Rate Limiter
// ──────────────────────────────────────────────────────────

interface TokenBucketState {
  /** 현재 잔여 토큰 수 (실수) */
  tokens: number;
  /** 마지막 갱신 시각 (ms) */
  lastRefillAt: number;
}

const DEFAULT_RATE_PER_SEC = 3;
const DEFAULT_BUCKET_CAPACITY = 3;

const bucket: TokenBucketState = {
  tokens: DEFAULT_BUCKET_CAPACITY,
  lastRefillAt: Date.now(),
};

interface RateLimiterOptions {
  ratePerSec: number;
  capacity: number;
  /** 시각 주입 (테스트용) */
  now: () => number;
}

const DEFAULT_OPTS: RateLimiterOptions = {
  ratePerSec: DEFAULT_RATE_PER_SEC,
  capacity: DEFAULT_BUCKET_CAPACITY,
  now: () => Date.now(),
};

let opts: RateLimiterOptions = { ...DEFAULT_OPTS };

export function __configureRateLimiter(next: Partial<RateLimiterOptions>) {
  opts = { ...opts, ...next };
}

export function __resetRateLimiter() {
  opts = { ...DEFAULT_OPTS };
  bucket.tokens = opts.capacity;
  bucket.lastRefillAt = opts.now();
}

function refill() {
  const now = opts.now();
  const elapsed = (now - bucket.lastRefillAt) / 1000;
  if (elapsed <= 0) return;
  const added = elapsed * opts.ratePerSec;
  bucket.tokens = Math.min(opts.capacity, bucket.tokens + added);
  bucket.lastRefillAt = now;
}

/**
 * 토큰 1개 소비. 부족하면 다음 토큰 발생 시각까지 대기.
 *
 * 동시 호출 직렬화: in-flight 동안 다른 호출은 큐에서 순차 처리.
 */
let chain: Promise<void> = Promise.resolve();

export function acquireRateToken(sleep: (ms: number) => Promise<void> = defaultSleep): Promise<void> {
  const run = async () => {
    refill();
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return;
    }
    // 0.x 토큰만 남아있다면 1.0이 될 때까지 추가 대기
    const need = 1 - bucket.tokens;
    const waitMs = Math.ceil((need / opts.ratePerSec) * 1000);
    await sleep(waitMs);
    refill();
    bucket.tokens = Math.max(0, bucket.tokens - 1);
  };
  const next = chain.then(run, run);
  chain = next.catch(() => undefined);
  return next;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ──────────────────────────────────────────────────────────
// Retry with exponential backoff
// ──────────────────────────────────────────────────────────

const RETRY_DELAYS_MS = [250, 500, 1000] as const;

function shouldRetry(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

// ──────────────────────────────────────────────────────────
// kiwoomFetch — 메인 wrapper
// ──────────────────────────────────────────────────────────

export interface KiwoomRequestOptions {
  /** TR ID (api-id 헤더) */
  apiId: string;
  /** 요청 경로 (예: "/api/dostk/stkinfo") */
  path: string;
  /** body — POST JSON */
  body: Record<string, unknown>;
  /** 연속조회 다음키 */
  contYn?: "Y" | "N";
  nextKey?: string;
  env?: KiwoomEnv;
  /** 테스트용 fetch 주입 */
  fetchImpl?: typeof fetch;
  /** 테스트용 sleep 주입 (rate limit + retry 백오프) */
  sleepImpl?: (ms: number) => Promise<void>;
}

export async function kiwoomFetch<T>(req: KiwoomRequestOptions): Promise<T> {
  const env = req.env ?? resolveKiwoomEnv();
  const baseUrl = resolveKiwoomBaseUrl(env);
  const fetchImpl = req.fetchImpl ?? fetch;
  const sleep = req.sleepImpl ?? defaultSleep;

  let lastErr: unknown;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    await acquireRateToken(sleep);

    const token = await getAccessToken({ env });

    let res: Response;
    try {
      res = await fetchImpl(`${baseUrl}${req.path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json;charset=UTF-8",
          authorization: `Bearer ${token}`,
          "api-id": req.apiId,
          "cont-yn": req.contYn ?? "N",
          "next-key": req.nextKey ?? "",
        },
        body: JSON.stringify(req.body),
        cache: "no-store",
      });
    } catch (e) {
      lastErr = e;
      if (attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }
      throw new KiwoomError(
        `키움 API 요청 실패 (${req.apiId}): ${(e as Error).message ?? "network"}`,
        "upstream_error",
      );
    }

    if (res.ok) {
      let json: T;
      try {
        json = (await res.json()) as T;
      } catch {
        throw new KiwoomError(`키움 API 응답 파싱 실패 (${req.apiId})`, "invalid_response");
      }
      // 키움은 에러도 HTTP 200 + return_code≠0 으로 응답 → 본문 코드 검사 필수.
      // (return_code 미존재 TR은 통과 — 각 TR 파서가 처리)
      const rc = (json as { return_code?: number } | null)?.return_code;
      if (rc === RC_TOKEN_INVALID && attempt < RETRY_DELAYS_MS.length) {
        // 만료시각 기반 캐시는 조기 무효화를 감지 못함 → 강제 재발급 후 재시도. dedup으로 동시 재발급 1회화.
        await deduplicate(`kiwoom-token-refresh:${env}`, () => getAccessToken({ env, force: true }));
        continue;
      }
      if (rc === RC_RATE_EXCEEDED && attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }
      return json;
    }

    if (shouldRetry(res.status) && attempt < RETRY_DELAYS_MS.length) {
      await sleep(RETRY_DELAYS_MS[attempt]);
      continue;
    }

    throw new KiwoomError(
      `키움 API 응답 오류 (${req.apiId}, HTTP ${res.status})`,
      res.status === 429 ? "rate_limited" : "upstream_error",
    );
  }

  throw new KiwoomError(
    `키움 API 재시도 한도 초과 (${req.apiId}): ${(lastErr as Error)?.message ?? "unknown"}`,
    "upstream_error",
  );
}

export function __getRateBucketSnapshot(): TokenBucketState {
  refill();
  return { ...bucket };
}
