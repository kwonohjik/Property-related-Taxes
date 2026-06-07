/**
 * IP 기반 API Rate Limiter
 *
 * 슬라이딩 윈도우 방식 인-메모리 구현.
 * 프로덕션 멀티 인스턴스 환경에서는 Upstash Redis로 교체 권장:
 *   npm install @upstash/ratelimit @upstash/redis
 *
 * 사용법:
 *   const { allowed, remaining, resetAt } = checkRateLimit(ip, { limit: 30, windowMs: 60_000 });
 */

interface RateLimitOptions {
  /** 윈도우 내 최대 요청 수 (default: 30) */
  limit?: number;
  /** 윈도우 크기 ms (default: 60_000 = 1분) */
  windowMs?: number;
  /**
   * true면 카운트 없이 즉시 허용한다 (E2E 테스트 전용 우회).
   * 호출부는 반드시 `shouldBypassRateLimit(req)`로만 이 값을 채우며,
   * 그 함수는 프로덕션에서 항상 false를 반환한다(보안 불변식).
   */
  bypass?: boolean;
}

interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** 윈도우 리셋 시각 (Unix ms) */
  resetAt: number;
}

// 메모리 슬롯: key → 윈도우 내 요청 타임스탬프 배열
const store = new Map<string, number[]>();

// 너무 많은 키가 쌓이지 않도록 주기적으로 만료 항목 정리 (서버리스 환경 대비)
let lastCleanup = Date.now();
function maybeCleanup(windowMs: number) {
  const now = Date.now();
  if (now - lastCleanup > windowMs * 10) {
    lastCleanup = now;
    const cutoff = now - windowMs;
    for (const [key, timestamps] of store) {
      const fresh = timestamps.filter((t) => t > cutoff);
      if (fresh.length === 0) {
        store.delete(key);
      } else {
        store.set(key, fresh);
      }
    }
  }
}

export function checkRateLimit(
  key: string,
  options: RateLimitOptions = {},
): RateLimitResult {
  const { limit = 30, windowMs = 60_000, bypass = false } = options;
  const now = Date.now();
  const cutoff = now - windowMs;

  // E2E 테스트 우회 — 카운트·store 미접촉으로 즉시 허용.
  // bypass는 shouldBypassRateLimit()(프로덕션 항상 false)로만 채워진다.
  if (bypass) {
    return { allowed: true, limit, remaining: limit, resetAt: now + windowMs };
  }

  maybeCleanup(windowMs);

  const timestamps = (store.get(key) ?? []).filter((t) => t > cutoff);

  const resetAt = timestamps.length > 0 ? timestamps[0] + windowMs : now + windowMs;

  if (timestamps.length >= limit) {
    store.set(key, timestamps);
    return { allowed: false, limit, remaining: 0, resetAt };
  }

  timestamps.push(now);
  store.set(key, timestamps);

  return {
    allowed: true,
    limit,
    remaining: limit - timestamps.length,
    resetAt,
  };
}

/**
 * NextRequest에서 클라이언트 IP 추출
 * Vercel / Nginx / 직접 연결 순으로 시도
 */
export function getClientIp(request: { headers: { get: (key: string) => string | null } }): string {
  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

/** E2E 테스트 우회 헤더 — Playwright `use.extraHTTPHeaders`로 전송 */
export const RATE_LIMIT_BYPASS_HEADER = "x-e2e-rate-limit-bypass";

/**
 * 요청이 rate limit을 우회해야 하는지 판정.
 *
 * 병렬 E2E는 클라이언트 IP 헤더가 없어 전 요청이 단일 키("unknown")로 묶이고,
 * 30회/분 버킷을 스위트 전체가 공유해 429가 발생한다. 이를 풀기 위한 테스트 전용 우회.
 *
 * **보안 불변식**: 프로덕션(NODE_ENV==="production")에서는 헤더가 있어도 항상 false.
 * 일반 브라우저/사용자는 이 헤더를 보내지 않으므로 개발·운영 수동 사용에는 영향이 없다.
 */
export function shouldBypassRateLimit(request: {
  headers: { get: (key: string) => string | null };
}): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return request.headers.get(RATE_LIMIT_BYPASS_HEADER) === "1";
}
