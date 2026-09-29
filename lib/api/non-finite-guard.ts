/**
 * 계산 응답 본문에서 **유한하지 않은 숫자(NaN·±Infinity)** 의 경로를 찾는다 (2026-09-29 E-14l).
 *
 * `NextResponse.json`은 NaN·Infinity를 `null`로 직렬화한다. 그래서 엔진이 NaN을 만들어도
 * 응답은 **200**이고, `status === 200`만 보는 테스트와 화면은 그것을 알아채지 못한다
 * (E-14l — 일반건물 건물 카드 전 필드 NaN이 200으로 통과했다).
 *
 * route는 반환 직전에 이 함수를 불러 결과가 비어 있지 않으면 **오류로 끊는다** — 값을 고치거나
 * 0으로 메우지 않는다. 원인은 그 경로에서 찾는다.
 */
export function findNonFiniteNumbers(value: unknown, path = "", out: string[] = []): string[] {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) out.push(path || "(root)");
  } else if (value !== null && typeof value === "object" && !(value instanceof Date)) {
    for (const [k, v] of Object.entries(value)) findNonFiniteNumbers(v, `${path}.${k}`, out);
  }
  return out;
}

/**
 * NaN·Infinity가 있으면 던진다 — route의 `catch`가 500으로 응답한다.
 * 메시지에는 첫 경로 몇 개만 싣는다(원인 추적용).
 */
export function assertFiniteResponse(body: unknown): void {
  const bad = findNonFiniteNumbers(body);
  if (bad.length === 0) return;
  throw new Error(
    `계산 결과에 유효하지 않은 숫자(NaN·Infinity)가 ${bad.length}곳 있어 결과를 반환하지 않습니다: ${bad.slice(0, 3).join(", ")}`,
  );
}
