/**
 * 별지 제84호서식 부표2 ⑲ 세액감면대상금액 = 감면대상 양도소득금액
 * (소득세법 §90① 세액감면방식 — 감면율·기본공제 적용 前).
 *
 * 기재요령: ⑲ = 「양도자산의 감면소득금액」. §90①은 세액을 감면(소득금액 미차감).
 * ┌ §77 공익수용(public_expropriation) · §77의3 개발제한(gb_designated_land): 자산 전액이 감면대상 → 양도소득금액 전액.
 * ├ §77의2 대토보상(replacement_land_comp): 대토보상분만 감면대상 → 엔진 echo(eligibleTransferIncome).
 * └ 그 외(자경 §69 등): reducibleIncome이 이미 감면대상 소득(감면율 미곱) → 그대로.
 *
 * ⚠️ §77·§77의2·§77의3의 result.reducibleIncome은 감면율(15/20/40/25%)을 곱한 값이므로 ⑲에 직접 쓰면 안 됨.
 *    exact-match 라우팅(부분일치 .includes 금지).
 */
export function reductionEligibleIncome(
  reductionTypeApplied: string | undefined,
  fullTransferIncome: number,
  reducibleIncome: number,
  replacementEligibleIncome: number | undefined,
): number {
  switch (reductionTypeApplied) {
    case "public_expropriation":
    case "gb_designated_land":
      return fullTransferIncome;
    case "replacement_land_comp":
      return replacementEligibleIncome ?? reducibleIncome;
    default:
      return reducibleIncome;
  }
}

/**
 * 소득금액차감방식(§90② — 5년 안분) 감면 detail 목록.
 * §99의3·§99(IMF 1차)·§98의8·하이브리드(§98의7·§99의2·§98의3/5/6·§98의2/4·§98) 공용.
 * 조특법 §127⑦로 실제 적용은 1건이나, 부적격 detail의 값은 0이므로 합산해도 안전(과다집계 없음).
 */
function incomeDeductionDetails(result: import("@/lib/tax-engine/transfer-tax").TransferTaxResult) {
  return [
    result.new993Detail,
    result.new99Detail,
    result.unsold988Detail,
    result.unsold987Detail,
    result.unsold992Detail,
    result.unsold983Detail,
    result.unsold985Detail,
    result.unsold986Detail,
    result.unsold982Detail,
    result.unsold984Detail,
    result.unsold98Detail,
  ];
}

/**
 * 소득금액 감면대상 = 소득금액차감방식 감면의 감면 양도소득금액 합계 (§90②).
 * 종전 `new993Detail`만 참조하던 신고서·상세명세서·요약을 전 소득금액차감 조문으로 일반화.
 */
export function incomeDeductionReducible(
  result: import("@/lib/tax-engine/transfer-tax").TransferTaxResult,
): number {
  return incomeDeductionDetails(result).reduce((s, d) => s + (d?.reducibleTransferIncome ?? 0), 0);
}

/** 소득금액차감방식 감면의 농어촌특별세 합계 (감면세액 × 20%, 농특세법 §5). */
export function incomeDeductionRuralSurtax(
  result: import("@/lib/tax-engine/transfer-tax").TransferTaxResult,
): number {
  return incomeDeductionDetails(result).reduce((s, d) => s + (d?.ruralSurtax ?? 0), 0);
}
