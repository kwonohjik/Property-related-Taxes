/**
 * 장기임대 감면 폼의 「임대료 증액 위반 이력」 라벨 — UI(`RentalCommonFields`)와 validate(⑧)가 같은 문구를 쓴다.
 *
 * §97의3·§97의4·§97의5는 5% 한도 외에 **1년 이내 재증액 금지**도 요건이다
 * (조특령 §97의3③1호 후단 · 소득세법 시행령 §167의3①2호 가·다목 괄호). 엔진은 「있음」을 고른 경우에만
 * 계약 이력을 받아 두 규정을 판정하므로(`lib/calc/transfer-tax-api-reductions.ts`), 라벨이 「5% 증액 위반」뿐이면
 * 5% 이내로 1년 안에 올린 사용자가 「없음」을 골라 1년 규정이 판정되지 않는다(리뷰 게이트 2026-11-01 결함 2).
 */
export function hasRentIntervalRule(type: string): boolean {
  return type === "rental_97_3" || type === "rental_97_4" || type === "rental_97_5";
}

export function rentIncreaseViolationLabel(type: string): string {
  return hasRentIntervalRule(type)
    ? "임대료 증액 위반 이력(5% 초과 또는 1년 이내 재증액)"
    : "임대료 5% 증액 위반 이력";
}
