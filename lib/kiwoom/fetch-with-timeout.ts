/**
 * fetchKiwoomWithTimeout — 키움 자동조회 fetch의 단일 timeout·abort 소스.
 *
 * 배경: 자동조회 호출부 5곳이 `await fetch(...)`를 AbortSignal 없이 썼다. dev 서버가 죽거나
 * 응답이 지연되면 Promise가 **영구 pending**이 되어 `finally { setLoading(false) }`에
 * 도달하지 못하고, 사용자에게는 「🔄 조회 중...」 스피너만 무한히 남는다.
 * (계획서 `docs/00-pm/dev-server-oom-kiwoom-spinner.plan.md` D-2)
 *
 * 이 규칙은 새로 만든 것이 아니다 — 자동완성 2곳(`KiwoomStockNameAutocomplete`·
 * `InheritanceStockNameAutocomplete`)이 이미 5초 timeout+abort를 구현하고 있었고,
 * 버튼 계열만 빠져 있었다. 여기로 단일화한다.
 *
 * 타임아웃 값 근거 — 서버 메모리 캐시(`cache.ts`의 Map, 재기동 시 소멸)를 비우고 실측한
 * 순수 키움 API 왕복:
 *   valuation-2month 3.84s (최악 · D±2개월 다중 TR) · daily-close 0.55s
 *   transfer-1month 0.31s · post-listing-1month 0.22s · search 0.05s
 * dev cold compile이 최대 약 4.7초를 더한다.
 * ⇒ 15초 = 최악 API의 약 4배, cold compile 포함 최악(4.93s)의 약 3배.
 */

/**
 * 자동조회 버튼·자동채움 — 위 실측 기준.
 *
 * ⚠️ 이 값을 자동완성(typeahead)에 그대로 쓰지 말 것. 자동완성은 타이핑 중 반복 호출되므로
 * 짧게 끊는 것이 맞고, `KiwoomStockNameAutocomplete`·`InheritanceStockNameAutocomplete`이
 * 각자 5초를 쓴다. 그 둘을 이 헬퍼로 옮길 때 `timeoutMs` 인자로 5초를 넘기면 된다.
 */
export const KIWOOM_FETCH_TIMEOUT_MS = 15_000;

/**
 * 타임아웃으로 끊긴 요청.
 *
 * 호출부 5곳의 catch가 전부 `(e as Error).message`를 그대로 사용자에게 보여주므로
 * (`SecurityMetadataBlock`은 배지 `detail`로), message 자체가 사용자 문구다.
 */
export class KiwoomTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(
      `조회 시간 초과 (${Math.round(timeoutMs / 1000)}초) — 다시 시도하거나 수동 입력하세요.`,
    );
    this.name = "KiwoomTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

/**
 * `fetch`에 timeout+abort를 입힌다.
 *
 * - 타임아웃 경과 시 요청을 abort하고 `KiwoomTimeoutError`로 reject한다
 *   (호출부가 네트워크 오류와 구분할 수 있도록 AbortError를 그대로 던지지 않는다).
 * - 성공·실패 어느 쪽이든 타이머를 해제한다 — 타이머 누수 시 테스트가 끝나지 않는다.
 * - 호출부가 자체 signal을 넘기면 그것도 존중한다(둘 중 먼저 발생한 abort가 이긴다).
 */
export async function fetchKiwoomWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs: number = KIWOOM_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const external = init?.signal;
  const onExternalAbort = () => controller.abort();
  // 이미 abort된 signal은 "abort" 이벤트를 다시 발생시키지 않는다 — 리스너만 걸면
  // 그 요청은 호출부의 취소 의사를 무시하고 그대로 나간다.
  if (external?.aborted) controller.abort();
  else external?.addEventListener("abort", onExternalAbort);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (e) {
    if (timedOut) throw new KiwoomTimeoutError(timeoutMs);
    throw e;
  } finally {
    clearTimeout(timer);
    external?.removeEventListener("abort", onExternalAbort);
  }
}
