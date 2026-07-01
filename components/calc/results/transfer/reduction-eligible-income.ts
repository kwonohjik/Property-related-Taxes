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
