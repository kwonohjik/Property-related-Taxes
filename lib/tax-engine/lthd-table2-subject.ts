/**
 * 「소득세법」 §95② **단서**(표2) 대상 판정의 **자산 축**과 **1주택 축** — L-1b(부수토지)·L-3(일반)·표시가 함께 쓰는 정본 leaf.
 *
 * 표2는 「대통령령으로 정하는 1세대 1주택(**이에 딸린 토지를 포함한다**)에 해당하는 **자산**」 전용이다
 * (현행 MST 280405 · 2015.5.13. 시행본 MST 170924 원문 확인). 대상은 두 축의 곱이다.
 *
 *   ① **자산 축** — 주택(이에 딸린 토지). 순수 토지·건물·상가는 1세대1주택 세대에서 팔아도 표2 대상이 아니다.
 *      부수토지는 **배율 이내로 확인된** 카드(`oneHouseUnitRole === "appurtenant_land"`)만이다 —
 *      배율 초과분은 §104의3①5호 비사업용 토지(재산세과-791)이고, 면적이 없어 배율 이내인지 **판정하지 못한** 카드는
 *      「모름 = 혜택 불성립」이라 표1이다(`transfer-tax-one-house-unit.ts`가 단위에서 빼는 카드와 같다).
 *   ② **1주택 축** — 「소득세법 시행령」 §159의4 「1세대가 양도일 현재 국내에 1주택(제155조·제155조의2·제156조의2·
 *      제156조의3 및 그 밖의 규정에 따라 1세대 1주택으로 보는 주택을 포함한다)을 보유」: 주택 수 제외 반영 후 1주택
 *      ∨ `checkExemption`이 내린 의제.
 *
 * (거주 2년 요건은 연언(AND)으로 별개다 — `meetsTable2ResidenceRequirement`.)
 *
 * ⚠️ 사본 금지 — 두 축을 L-1b·L-3·표시 계층이 각자 쓰면 「공제율은 표1인데 문구는 표2」 드리프트가 난다
 *    (memory `feedback_shared_predicate_argument_parity`).
 */
import type { TransferTaxInput } from "./types/transfer.types";

/** ① 자산 축 — 표2 「대상 자산」인가 (주택·주택부수토지). */
export function isLthdTable2SubjectAsset(
  input: Pick<TransferTaxInput, "propertyType" | "oneHouseUnitRole">,
): boolean {
  switch (input.propertyType) {
    // 토지는 짝 주택과 1세대1주택 단위를 이룬 부수토지(배율 이내 확인)만 — 순수 토지·배율 초과분·판정 불가 카드는 표1.
    case "land":
      return input.oneHouseUnitRole === "appurtenant_land";
    // 주택이 아닌 건물·상가는 이에 딸린 토지도 없는 자산이다.
    case "building":
    case "commercial_building":
    case "general_building":
    case "general_building_unit":
      return false;
    // housing 외(조합원입주권·겸용 등)는 종전 판정을 그대로 둔다 — 입주권의 표2 «1주택 축»은 §89①4호 가·나목이다(#14 · `redevelopment-right-table2.ts`).
    default:
      return true;
  }
}

/** ② 1주택 축 — 주택 수 제외 반영 후 1주택 ∨ 의제(§159의4 괄호). 호출부가 `checkExemption`의 `deemedOneHouseBy155`를 넘긴다. */
export function resolveLthdTable2OneHouseAxis(
  input: Pick<TransferTaxInput, "isOneHousehold" | "householdHousingCount">,
  deemedOneHouseBy155: boolean | undefined,
): boolean {
  return input.isOneHousehold && (input.householdHousingCount === 1 || deemedOneHouseBy155 === true);
}
