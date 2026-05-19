/**
 * In-flight 요청 dedup — key별 동시 호출을 단일 Promise로 공유.
 *
 * Route Handler 중복 호출(UI 더블 클릭 / 종목코드 + 양도일 onChange 동시 발생 등) 방지.
 *
 * 정책: `feedback_no_silent_apportion_fallback` — dedup은 동일 키 요청 통합만 수행하며
 *      서로 다른 입력에 대해 결과 공유 금지.
 */

const inFlight = new Map<string, Promise<unknown>>();

export async function deduplicate<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;
  const promise = fn().finally(() => {
    if (inFlight.get(key) === promise) inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
}

export function __resetDedup() {
  inFlight.clear();
}

export function __getInFlightCount(): number {
  return inFlight.size;
}
