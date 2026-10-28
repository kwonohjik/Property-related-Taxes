/**
 * 함께 양도 × 토지만 본인 · 건물(주택) 소유자 다른 세대 — 부수토지 카드가 표1인 이유 고지.
 *
 * 주 카드의 고지(`LAND_ONLY_OTHER_HOUSEHOLD_NOTICE`)는 합산 경고에서 `[주 자산(주택)]` 라벨로만 나와, 같은 묶음 부수토지 카드가
 * 왜 표2가 아닌지 카드에서 보이지 않는다. 값은 바꾸지 않는 고지다(계획서 `bundled-other-household-appurtenant-table2.plan.md` Q-2 a).
 */
import { resolveExemptionRequirementResidenceMonths } from "./one-house/residence-months";
import { meetsTable2ResidenceRequirement } from "./transfer-tax-exemption-residence-waivers";
import type { TransferTaxInput } from "./types/transfer.types";

export const LAND_ONLY_OTHER_HOUSEHOLD_APPURTENANT_CARD_NOTICE =
  "함께 양도한 부수토지 카드 — 짝 주택이 토지만 본인 소유이고 건물(주택) 소유자가 양도일 현재 본인과 다른 세대라, 이 부수토지에는 1세대1주택 " +
  "장기보유특별공제 표2를 적용하지 않고 표1로 계산했습니다(「소득세법」 §95② 단서 · 「소득세법 시행령」 §154① · 조심 2008중3554).";

/** 표2가 원래 걸렸을 조합(짝 주택의 1주택 축 ∧ 거주 2년 요건)에만 말한다 — 그 밖에는 표1이라 값에 닿지 않는다. */
export function landOnlyOtherHouseholdAppurtenantCardNotice(input: TransferTaxInput): string | undefined {
  const v = input.appurtenantHouseVerdict;
  if (input.oneHouseUnitRole !== "appurtenant_land" || v?.houseTable2Subject !== false || v.oneHouseForTable2 !== true) return undefined;
  const residenceYears = Math.floor(resolveExemptionRequirementResidenceMonths(input) / 12);
  return meetsTable2ResidenceRequirement(input, residenceYears) ? LAND_ONLY_OTHER_HOUSEHOLD_APPURTENANT_CARD_NOTICE : undefined;
}
