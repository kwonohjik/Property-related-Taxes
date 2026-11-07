/**
 * 리뷰 US-19 — 양도 주택의 「조특법 감면주택(5호)」 자기 선언이 다주택 중과를 뺐는데, 같은 주택에 입력한 §98 계열 감면은 엔진이 부적격으로 판정한 경우의 고지.
 *
 * 소득세법 시행령 §167의3①5호는 「「조세특례제한법」 제77조, 제98조의2, 제98조의3, 제98조의5부터 제98조의8까지, 제99조, 제99조의2 및 제99조의3에 따라
 * 양도소득세가 감면되는 주택」이다 — 감면이 성립해야 해당한다. 그렇다고 선언을 엔진 판정으로 덮으면 다른 조문 근거(§77 수용 · 비수도권 §98의2 등)가 있는
 * 정당한 선언까지 막는다(§77은 자동 배제 대상 목록에 없어 선언이 유일한 경로다). 그래서 계산은 그대로 두고 알린다(사용자 결정 2026-11-07 「결과 고지」).
 */
import { SURCHARGE_EXCLUDED_INCOME_DEDUCTION_IDS, exclusionArticleLabel } from "./transfer-reductions/income-deduction-router";
import type { SurchargeExclusionByReduction } from "./transfer-reductions/income-deduction-router";
import type { IncomeDeductionId } from "./transfer-reductions/income-deduction-router";
import type { HouseInfo, MultiHouseSurchargeResult } from "./types/multi-house-surcharge.types";
import { MULTI_HOUSE } from "./legal-codes";

export function selfDeclaredReductionHouseNotice(
  /** 감면 표지 주입 **전** 명부 — 양도 주택 행의 선언이 사용자 것인지 본다 */
  houses: readonly HouseInfo[],
  sellingId: string,
  reductions: ReadonlyArray<{ type: string }> | undefined,
  exclusion: SurchargeExclusionByReduction,
  result: Pick<MultiHouseSurchargeResult, "exclusionReasons">,
): string | undefined {
  if (exclusion.excluded) return undefined;
  if (houses.find((h) => h.id === sellingId)?.isTaxSpecialExemption !== true) return undefined;
  if (!result.exclusionReasons.some((r) => r.type === "tax_special_exemption")) return undefined;
  const entered = (reductions ?? [])
    .map((r) => r.type)
    .filter((t): t is IncomeDeductionId => (SURCHARGE_EXCLUDED_INCOME_DEDUCTION_IDS as readonly string[]).includes(t));
  if (entered.length === 0) return undefined;
  const articles = [...new Set(entered.map(exclusionArticleLabel))].join("·");
  return (
    `양도 주택을 「조특법 감면주택」으로 선언해 다주택 중과에서 뺐지만, 입력한 ${articles} 감면은 요건을 충족하지 않아 적용되지 않습니다. ` +
    `이 선언은 그 주택이 다른 조문(조세특례제한법 §77·§98의2 등)에 따라 양도소득세가 감면되는 주택일 때만 유효합니다 ` +
    `(${MULTI_HOUSE.TAX_INCENTIVE_HOUSE_5_BASIS}) — 해당하지 않으면 선언을 끄세요(확인 필요).`
  );
}
