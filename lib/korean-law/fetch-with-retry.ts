/**
 * 법제처 API fetch with retry + URL 마스킹
 *
 * upstream: chrisryugj/korean-law-mcp src/lib/fetch-with-retry.ts
 *
 * 제공:
 *   - fetchWithRetry: AbortController 타임아웃 + Retry-After 헤더 우선 + 지수 백오프
 *   - maskSensitiveUrl: ?OC=KEY 등을 ***로 치환해 에러 로그에 API 키 누출 방지
 *   - checkHtmlError: 응답이 HTML 오류 페이지인지 감지
 */

export interface FetchRetryOptions {
  /** 개별 요청 타임아웃 (ms). 기본 30s */
  timeout?: number;
  /** 재시도 횟수. 기본 3 */
  retries?: number;
  /** 최초 백오프 딜레이 (ms). 기본 1000 */
  baseDelay?: number;
  /** 재시도 대상 상태 코드. 기본 [429, 503, 504] */
  retryOn?: number[];
  /** RequestInit 추가 옵션 */
  init?: RequestInit;
}

/**
 * URL에서 민감한 쿼리 파라미터 값을 마스킹.
 * 법제처 OC 키, 일반적인 apikey/authKey, 토큰 파라미터 모두 처리.
 */
export function maskSensitiveUrl(url: string): string {
  if (!url) return url;
  return url.replace(
    /([?&])(OC|oc|apikey|apiKey|api_key|authKey|auth_key|token|access_token|Authorization)=([^&]+)/gi,
    "$1$2=***"
  );
}

/**
 * 응답 Body 가 HTML 오류 페이지인지 감지.
 *
 * 법제처 Open API는 파라미터 오류 시 404 대신 웹 HTML 페이지를 돌려주는 경우가 있어
 * JSON/XML 파싱 실패로 나타난다. 사전 감지해 명확한 에러 메시지 제공.
 */
export function checkHtmlError(body: string): boolean {
  if (!body) return false;
  const trimmed = body.trimStart();
  return (
    trimmed.startsWith("<!DOCTYPE html") ||
    trimmed.startsWith("<html") ||
    trimmed.startsWith("<!doctype html")
  );
}

/**
 * 재시도 + 타임아웃을 포함한 fetch 래퍼.
 *
 * 동작:
 *   1. AbortController 로 timeout 후 abort
 *   2. 응답 상태코드가 retryOn 에 있으면:
 *      - Retry-After 헤더가 있으면 그 값만큼 대기
 *      - 없으면 baseDelay * 2^attempt + jitter(0~50%) 대기
 *   3. 네트워크 에러도 동일하게 재시도
 *   4. retries 초과 시 마지막 에러 throw (URL은 masked)
 */
export async function fetchWithRetry(
  url: string,
  options: FetchRetryOptions = {}
): Promise<Response> {
  const {
    timeout = 30_000,
    retries = 3,
    baseDelay = 1_000,
    retryOn = [429, 503, 504],
    init = {},
  } = options;

  const maskedUrl = maskSensitiveUrl(url);
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);

      // 2xx/3xx 또는 retryOn 아닌 상태코드는 그대로 반환
      if (res.ok || !retryOn.includes(res.status)) {
        return res;
      }

      // 재시도 대상 — 남은 attempt 가 있으면 대기 후 재시도
      if (attempt < retries) {
        const retryAfterHeader = res.headers.get("Retry-After");
        const delayMs = retryAfterHeader
          ? parseRetryAfter(retryAfterHeader)
          : computeBackoff(baseDelay, attempt);
        await sleep(delayMs);
        lastError = new Error(
          `HTTP ${res.status} — ${maskedUrl} (${attempt + 1}/${retries} 재시도)`
        );
        continue;
      }

      // 재시도 초과 — 최종 실패
      throw new Error(`HTTP ${res.status} — ${maskedUrl} (재시도 ${retries}회 소진)`);
    } catch (err) {
      clearTimeout(timer);

      if (err instanceof Error && err.name === "AbortError") {
        lastError = new Error(`요청 타임아웃 (${timeout}ms) — ${maskedUrl}`);
      } else if (err instanceof Error) {
        lastError = new Error(`${err.message} — ${maskedUrl}`);
      } else {
        lastError = new Error(`알 수 없는 에러 — ${maskedUrl}`);
      }

      // 네트워크 에러도 재시도 대상
      if (attempt < retries) {
        await sleep(computeBackoff(baseDelay, attempt));
        continue;
      }
      throw lastError;
    }
  }

  // 이론적으로 도달 불가 (loop 내에서 return 또는 throw)
  throw lastError ?? new Error(`fetchWithRetry 실패 — ${maskedUrl}`);
}

/**
 * Retry-After 헤더 파싱.
 * - 숫자면 초 단위 → ms
 * - 날짜 문자열(RFC 7231)이면 지금부터 delta
 */
function parseRetryAfter(raw: string): number {
  const n = Number(raw);
  if (!Number.isNaN(n)) return Math.max(0, n * 1000);
  const d = Date.parse(raw);
  if (!Number.isNaN(d)) return Math.max(0, d - Date.now());
  return 1000; // fallback 1s
}

/** 지수 백오프 + 0~50% jitter */
function computeBackoff(baseDelay: number, attempt: number): number {
  const exp = baseDelay * Math.pow(2, attempt);
  const jitter = 1 + Math.random() * 0.5;
  return Math.floor(exp * jitter);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
