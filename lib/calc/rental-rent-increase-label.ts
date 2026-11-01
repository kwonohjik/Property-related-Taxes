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

/**
 * 「임대료 증액 제한」 섹션 제목의 근거 조문 — 종전에는 다섯 조문 폼이 모두 「§97의3①2호」를 달았다(리뷰 게이트 2026-11-01).
 *   · §97의3: 법 §97의3①2호 → 령 §97의3③1호
 *   · §97의5: 법 §97의5①3호가 §97의3①2호 요건 준수를 요구
 *   · §97의4: 조특령 §97의4① → 소득세법 시행령 §167의3①2호 가·다목
 *   · §97 본문·§97의2: 평가기가 임대료 이력을 판정하지 않는다 — 근거 조문을 확인하지 않아 인용하지 않는다(확인 필요).
 */
export function rentIncreaseSectionTitle(type: string): string {
  switch (type) {
    case "rental_97_3":
      return "임대료 증액 제한 (§97의3①2호)";
    case "rental_97_5":
      return "임대료 증액 제한 (§97의5①3호 → §97의3①2호)";
    case "rental_97_4":
      return "임대료 증액 제한 (소득세법 시행령 §167의3①2호)";
    default:
      return "임대료 증액 제한";
  }
}
