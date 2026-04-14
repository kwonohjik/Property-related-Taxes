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
  const { limit = 30, windowMs = 60_000 } = options;
  const now = Date.now();
  const cutoff = now - windowMs;

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
