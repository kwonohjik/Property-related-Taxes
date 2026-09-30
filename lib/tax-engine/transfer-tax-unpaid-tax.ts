/**
 * 지연납부가산세(「국세기본법」 §47의4) 미납세액 — 「자동」과 「직접 입력」의 구별 (PEN-C, 2026-09-30 결정).
 *
 * 종전에는 `unpaidTax === 0`이 「결정세액 전액 미납(자동)」과 「완납(0)」을 **겸했다** — 「가산세
 * 계산하기」가 완납을 `0`으로 실으면 그것도 전액 미납이 되어 가산세가 붙었다.
 *
 *   - `manual` → 값을 그대로 쓴다(**0 = 완납** 포함).
 *   - `auto`   → 결정세액 전액 미납.
 *   - 부재     → 종전 의미 그대로(0 → 결정세액 전액 · 그 밖의 값 → 그 값). 저장된 이력·API 호출자의
 *               의미를 뒤집지 않기 위해서다(memory `feedback_flipping_enum_default_rewrites_absent_records`).
 *
 * 결정세액을 주입하는 모든 지점(단건 route 2-pass · 다건 route 자산별 · 집계 신고 단위 · 겸용 합산)이
 * **이 함수 하나**를 쓴다 — 한 곳만 `=== 0`으로 남으면 그 경로에서만 완납이 전액 미납이 된다.
 */
export type UnpaidTaxMode = "auto" | "manual";

export function resolveUnpaidTax(
  details: { unpaidTax: number; unpaidTaxMode?: UnpaidTaxMode },
  determinedTax: number,
): number {
  if (details.unpaidTaxMode === "manual") return details.unpaidTax;
  return details.unpaidTax === 0 ? determinedTax : details.unpaidTax;
}
