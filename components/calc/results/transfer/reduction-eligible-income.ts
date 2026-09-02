/**
 * 별지 제84호서식 부표 1 ⑲ 세액감면대상금액 = 감면대상 양도소득금액
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
/**
 * §90①의 **`(B − C) × E`** 표시명 — 결과뷰·상세카드 **단일 소스**.
 *
 * 🔴 종전에는 이 값을 「감면대상소득금액」이라 불렀다. 그런데 §90①의 **B**가
 * 「감면대상 양도소득금액」이고 별지84호 부표1 **⑲ 세액감면대상금액**도 그 B다 —
 * 즉 **같은 낱말이 한 화면에서 두 뜻**으로 쓰였다(§77 공익수용 6억: 카드 28,550,000 ↔
 * ⑲ 288,000,000). 기본공제·감면율이 이미 반영됐음을 이름에 박아 충돌을 없앤다.
 *
 * 다건 감면 재계산 카드(`MultiTransferTaxResultView`)와 **같은 문구**여야 한다 —
 * 두 화면이 같은 값을 다르게 부르면 이 정정이 무의미해진다.
 */
export const RATED_REDUCIBLE_INCOME_LABEL = "감면대상소득 (기본공제 차감·감면율 반영)";

/**
 * 위 값과 신고서 ⑲가 **다른 수**임을 밝히는 안내 문구 — §77·§77의2·§77의3 상세카드 공용.
 * 침묵하면 사용자가 같은 화면의 두 숫자를 두고 어느 쪽이 틀렸는지 알 수 없다.
 */
export const ELIGIBLE_INCOME_VS_FORM_NOTE =
  "※ 신고서 ⑲ 「세액감면대상금액」은 기본공제·감면율을 반영하기 前 금액(「소득세법」 §90①의 B)이라 위 값과 다릅니다.";

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

/**
 * 결과탭 농어촌특별세 **표시 단일 소스**.
 *
 * 우선순위: 집계 override → 엔진 총액 echo(`result.ruralSurtax`) → 소득금액차감 detail 합산.
 *
 * 마지막 폴백은 **옛 저장 결과 전용**이다. 결과는 IndexedDB에 저장·복원되므로 총액 echo가
 * 없는 result가 도달할 수 있다. 그 폴백은 세액감면형(§77·§77의2·§77의3·§97 계열)을 담지
 * 못하지만, 그것이 종전 동작이므로 회귀는 없다.
 *
 * anchor: `__tests__/components/transfer-rural-surtax-display.anchor.test.tsx`
 */
export function resolveRuralSurtax(
  result: import("@/lib/tax-engine/transfer-tax").TransferTaxResult,
  aggregateOverride?: number,
): number {
  if (aggregateOverride !== undefined) return aggregateOverride;
  return result.ruralSurtax ?? incomeDeductionRuralSurtax(result);
}

/** 조문 표시명 — 3단계 상세명세 산식 꼬리표 */
const INCOME_DEDUCTION_LABELS = [
  "§99의3", "§99", "§98의8", "§98의7", "§99의2",
  "§98의3", "§98의5", "§98의6", "§98의2", "§98의4", "§98",
] as const;

/**
 * 3단계 상세명세 「소득금액 감면대상」 행이 쓸 **산식 소스 1건**을 고른다.
 *
 * §127⑦로 실제 적용은 1건이므로 첫 번째 존재하는 detail을 쓴다
 * (`incomeDeductionDetails`와 **같은 순서**를 공유해 라벨이 어긋나지 않는다).
 * 감면액이 0이어도 고른다 — 0인 이유를 산식으로 보여주기 위해서다.
 */
export function pickIncomeDeductionFormulaSource(
  result: import("@/lib/tax-engine/transfer-tax").TransferTaxResult,
):
  | (import("./DetailedStatementFormulaBuilders").IncomeDeductionFormulaSource)
  | undefined {
  const details = incomeDeductionDetails(result);
  for (let i = 0; i < details.length; i++) {
    const d = details[i];
    if (!d) continue;
    return { ...d, articleLabel: INCOME_DEDUCTION_LABELS[i] };
  }
  return undefined;
}

/**
 * ⑲ 세액감면대상금액의 **산출 근거 문구** — 조문별로 기준이 다르므로 그 이유를 밝힌다.
 *
 * 값은 `reductionEligibleIncome`이 낸다. 여기서는 「왜 그 값인가」만 설명한다
 * (dual-truth 회피 — 산식을 다시 계산하지 않는다).
 */
export function eligibleIncomeBasisText(
  reductionTypeApplied: string | undefined,
  value: number,
): string {
  const v = value.toLocaleString();
  switch (reductionTypeApplied) {
    case "public_expropriation":
      return `양도소득금액 전액 ${v} (자산 전부가 감면 대상 — 조세특례제한법 §77)`;
    case "gb_designated_land":
      return `양도소득금액 전액 ${v} (자산 전부가 감면 대상 — 조세특례제한법 §77의3)`;
    case "replacement_land_comp":
      return `대토보상분 감면 대상 양도소득금액 ${v} (조세특례제한법 §77의2)`;
    case "self_farming":
    case "self_farming_incorp":
    case "self_farming_inherited":
      return `자경 감면 대상 양도소득금액 ${v} (조세특례제한법 §69 — 편입 부분감면 시 감면비율 반영)`;
    case "rental_97_main":
    case "rental_97_proviso":
    case "rental_97_2":
    case "rental_97_5":
      return `임대기간 중 발생한 양도소득 ${v} (조세특례제한법 §97 계열 — 임대기간 분 안분)`;
    default:
      return value > 0
        ? `감면 적용 대상 양도소득금액 ${v}`
        : "감면 대상 없음";
  }
}
