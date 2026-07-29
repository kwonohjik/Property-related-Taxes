/**
 * PHD 3-시점 환산(§164⑦) 적용가능 게이트 — 단일 소스.
 *
 * 소령 §164⑦은 "양도 당시에는 개별주택가격·공동주택가격이 고시되어 있으나
 * 취득 당시에는 고시되지 아니한 경우" 한정. 취득 당시 이미 고시분이 존재하면
 * 3-시점 역산 대상이 아니며, 취득일 현재 고시된 주택가격(직전 고시분)으로
 * 일반 환산(§176의2③)해야 한다. (재일01254-1962 — 기준시가 적용은 결정공시일 기준)
 *
 * 의제취득일: 1984-12-31 이전 취득은 1985-01-01 취득 의제(소득세법 부칙,
 * TRANSFER.DEEMED_ACQUISITION_DATE_BASIS). 국세청 기준시가 해설 —
 * "1985.1.1. 이후 취득한 경우에는 1985.1.1. 현재 고시되어 있는 기준시가를 적용".
 *
 * 소비처(재정의 금지): PreHousingDisclosureSection(UI 경고) ·
 * transfer-tax-validate-asset(⑧ 차단) · transfer-tax-schema-refines(⑩ Zod refine) ·
 * CompanionAcqPurchaseBlock(자동 ON 억제).
 */

/** 의제취득일 (소득세법 부칙 — 1984.12.31. 이전 취득은 1985.1.1. 취득 의제) */
export const DEEMED_ACQUISITION_DATE = "1985-01-01";

/**
 * §164⑦ 3-시점 환산 적용가능 여부.
 * 유효취득일(의제취득일 반영) < 최초고시일 이면 취득당시 미고시 → 적용가능.
 * 유효취득일 ≥ 최초고시일(고시일 당일 포함)이면 고시 존재 → 적용 불가.
 *
 * 날짜는 폼 문자열(YYYY-MM-DD). 어느 한쪽이 비어 있으면 판정 불능 → true(게이트 미발동,
 * 필수입력 검증이 별도 차단).
 */
export function isPhdEligible(acquisitionDate: string, firstDisclosureDate: string): boolean {
  if (!acquisitionDate || !firstDisclosureDate) return true;
  const effective =
    acquisitionDate < DEEMED_ACQUISITION_DATE ? DEEMED_ACQUISITION_DATE : acquisitionDate;
  return effective < firstDisclosureDate;
}
