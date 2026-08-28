/**
 * 키움 OpenAPI OAuth2 토큰 발급·갱신 (서버 측 전용).
 *
 * - client_credentials 그랜트
 * - access_token 24h 유효 (서버 측 메모리 캐시)
 * - 만료 5분 전 자동 재발급 — `getAccessToken()` 1진입점에서 처리
 *
 * 환경변수 (.env.local — 절대 커밋 금지):
 *   KIWOOM_APP_KEY=...
 *   KIWOOM_APP_SECRET=...
 *   KIWOOM_ENV=mock | prod
 *
 * 정책: secret 클라이언트 노출 금지. 본 모듈은 process.env 직접 접근 → "use server"·route handler에서만 호출 가능.
 */

import { KiwoomError, type KiwoomEnv, type KiwoomTokenCacheEntry } from "./types";

const KIWOOM_BASE_URLS: Record<KiwoomEnv, string> = {
  mock: "https://mockapi.kiwoom.com",
  prod: "https://api.kiwoom.com",
};

const TOKEN_PATH = "/oauth2/token";
/** 만료 5분 전 자동 재발급 안전 마진 */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/** 모듈 메모리 캐시 (서버 프로세스 단일 인스턴스). 환경별 분리. */
const tokenCache = new Map<KiwoomEnv, KiwoomTokenCacheEntry>();

/** test/리셋용 */
export function __resetKiwoomTokenCache() {
  tokenCache.clear();
}

export function resolveKiwoomEnv(): KiwoomEnv {
  const raw = (process.env.KIWOOM_ENV ?? "mock").toLowerCase();
  return raw === "prod" ? "prod" : "mock";
}

export function resolveKiwoomBaseUrl(env: KiwoomEnv = resolveKiwoomEnv()): string {
  return KIWOOM_BASE_URLS[env];
}

function readCredentials(): { appKey: string; appSecret: string } {
  const appKey = process.env.KIWOOM_APP_KEY;
  const appSecret = process.env.KIWOOM_APP_SECRET;
  if (!appKey || !appSecret) {
    throw new KiwoomError(
      "키움 OpenAPI 자격증명이 설정되지 않았습니다. .env.local 에 KIWOOM_APP_KEY / KIWOOM_APP_SECRET 을 설정하세요.",
      "missing_env",
    );
  }
  return { appKey, appSecret };
}

interface TokenResponse {
  /** 키움 OpenAPI 신규 REST 스펙 */
  token?: string;
  access_token?: string;
  /** 초 단위 만료 또는 만료시각(yyyyMMddHHmmss) — 응답 변형 대응 */
  expires_in?: number | string;
  expires_dt?: string;
  return_code?: number;
  return_msg?: string;
}

/**
 * 키움 OpenAPI access token 발급/조회.
 *
 * - 캐시 hit + 만료까지 5분 이상 → 캐시 반환
 * - 그 외 → POST /oauth2/token 발급
 *
 * @throws KiwoomError("auth_failed" | "missing_env")
 */
export async function getAccessToken(opts?: { env?: KiwoomEnv; force?: boolean }): Promise<string> {
  const env = opts?.env ?? resolveKiwoomEnv();
  const now = Date.now();

  if (!opts?.force) {
    const cached = tokenCache.get(env);
    if (cached && cached.expiresAt - now > REFRESH_MARGIN_MS) {
      return cached.accessToken;
    }
  }

  const { appKey, appSecret } = readCredentials();
  const baseUrl = resolveKiwoomBaseUrl(env);

  let res: Response;
  try {
    res = await fetch(`${baseUrl}${TOKEN_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json;charset=UTF-8" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        appkey: appKey,
        secretkey: appSecret,
      }),
      cache: "no-store",
    });
  } catch (e) {
    throw new KiwoomError(
      `키움 인증 요청 실패: ${(e as Error).message ?? "network error"}`,
      "auth_failed",
    );
  }

  if (!res.ok) {
    throw new KiwoomError(`키움 인증 실패 (HTTP ${res.status})`, "auth_failed");
  }

  const json = (await res.json()) as TokenResponse;
  const token = json.token ?? json.access_token;
  if (!token) {
    // return_msg를 버리지 않는다 — 원인이 여기에만 있다.
    // 예: return_code=3 · "인증에 실패했습니다[8001:App Key와 Secret Key 검증에 실패했습니다]"
    const reason = json.return_msg ? ` ${json.return_msg}` : "";
    throw new KiwoomError(
      `키움 인증 응답 형식이 예상과 다릅니다. (return_code=${json.return_code ?? "?"})${reason}`,
      "auth_failed",
    );
  }

  // 만료 산정 — expires_in(초) 우선, 없으면 expires_dt(yyyyMMddHHmmss), 둘 다 없으면 24h
  let expiresAt = now + 24 * 60 * 60 * 1000;
  if (typeof json.expires_in === "number") {
    expiresAt = now + json.expires_in * 1000;
  } else if (typeof json.expires_in === "string" && /^\d+$/.test(json.expires_in)) {
    expiresAt = now + Number(json.expires_in) * 1000;
  } else if (json.expires_dt && /^\d{14}$/.test(json.expires_dt)) {
    const s = json.expires_dt;
    const dt = new Date(
      Date.UTC(
        Number(s.slice(0, 4)),
        Number(s.slice(4, 6)) - 1,
        Number(s.slice(6, 8)),
        Number(s.slice(8, 10)),
        Number(s.slice(10, 12)),
        Number(s.slice(12, 14)),
      ),
    );
    if (!Number.isNaN(dt.getTime())) expiresAt = dt.getTime();
  }

  tokenCache.set(env, { accessToken: token, expiresAt });
  return token;
}

/**
 * 테스트 헬퍼 — 캐시에 강제로 토큰을 주입.
 */
export function __setKiwoomTokenForTest(env: KiwoomEnv, accessToken: string, expiresAt: number) {
  tokenCache.set(env, { accessToken, expiresAt });
}

export function __getKiwoomTokenCacheSnapshot(): Record<string, KiwoomTokenCacheEntry> {
  const out: Record<string, KiwoomTokenCacheEntry> = {};
  for (const [k, v] of tokenCache.entries()) out[k] = v;
  return out;
}
