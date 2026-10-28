/**
 * 함께 양도 × 토지만 본인 · 건물(주택) 소유자 다른 세대 — 부수토지 카드가 표1인 이유 고지.
 *
 * 주 카드의 고지(`LAND_ONLY_OTHER_HOUSEHOLD_NOTICE`)는 합산 경고에서 `[주 자산(주택)]` 라벨로만 나와, 같은 묶음 부수토지 카드가
 * 왜 표2가 아닌지 카드에서 보이지 않는다. 값은 바꾸지 않는 고지다(계획서 `bundled-other-household-appurtenant-table2.plan.md` Q-2 a).
 */
import { calculateHoldingPeriod } from "./tax-utils";
import { LAND_ONLY_OTHER_HOUSEHOLD_RATE_NOTICE } from "./land-only-owner-household";
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

/**
 * 합가일을 반영했다는 부수토지 카드 고지 — 합가일이 부수토지 카드의 두 기준일(카드 취득일 · 짝 주택 취득일)보다 늦어 계산이 달라졌을 때만.
 * 세율 기산에 합가일을 반영한 것은 정면 해석이 없는 유추라 「확인 필요」를 병기한다(주 카드 고지 `landOnlyMergeDateAppliedNotice`와 같다 — 계획서 Q-1 a · Q-2 a).
 */
export function landOnlyMergeDateAppurtenantCardNotice(input: TransferTaxInput): string | undefined {
  const v = input.appurtenantHouseVerdict;
  const merge = v?.houseMergeDate;
  if (input.oneHouseUnitRole !== "appurtenant_land" || !v || merge === undefined) return undefined;
  if (merge.getTime() <= Math.max(input.acquisitionDate.getTime(), v.houseAcquisitionDate.getTime())) return undefined;
  return (
    `함께 양도한 부수토지 카드 — 짝 주택이 토지만 본인 소유이고 건물(주택) 소유자와 같은 세대라, 입력하신 세대 합가일(${merge.toISOString().slice(0, 10)})부터를 이 부수토지의 주택부수토지 ` +
    "보유기간으로 보아 1세대1주택 비과세 보유요건·장기보유특별공제 표2 보유연수·단기세율 보유기간을 판정했습니다(재산46014-610 · 부동산거래관리과-515). " +
    "단기세율 보유기간에 합가일을 반영한 것은 정면 해석이 없는 유추라 확인이 필요합니다."
  );
}

/**
 * 다른 세대 토지만 본인 주택의 부수토지 카드 — 단기세율(보유 2년 미만)이 일반 토지 기준으로 판정됐다는 고지. 주 카드 고지(`landOnlyOtherHouseholdRateNotice`)와 같은 문안·같은 규칙:
 * 2년 이상이면 세율 종류가 값에 닿지 않아 말하지 않는다(계획서 `bundled-other-household-appurtenant-short-rate.plan.md` Q-3 a).
 */
export function landOnlyOtherHouseholdAppurtenantCardRateNotice(input: TransferTaxInput): string | undefined {
  if (input.oneHouseUnitRole !== "appurtenant_land" || input.appurtenantHouseVerdict?.houseLandOnlyOtherHousehold !== true) return undefined;
  return calculateHoldingPeriod(input.acquisitionDate, input.transferDate).years < 2 ? LAND_ONLY_OTHER_HOUSEHOLD_RATE_NOTICE : undefined;
}
