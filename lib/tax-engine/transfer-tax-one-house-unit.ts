/**
 * F-13 — 일괄양도의 「1세대1주택 단위」(주택 카드 + 배율 이내 주택부수토지 카드) 묶기.
 *
 * 「소득세법」 §89①3호: 비과세 대상은 「각 목의 주택」과 「주택부수토지(배율 이내)」이고, 12억 고가주택 판정은
 * 「주택 및 이에 딸린 토지의 양도 당시 실지거래가액의 **합계액**」이다. 두 자산을 카드로 나눠 받으면 카드마다
 * 따로 판정해 ① 부수토지가 비과세에서 빠지고 ② 12억이 주택 가액만으로 판정됐다(계획서
 * `docs/00-pm/transfer-companion-appurtenant-land-exemption.plan.md`).
 *
 * 여기서는 route가 붙인 역할(`oneHouseUnitRole`)로 단위를 찾아
 * - 단위 카드 전부의 12억 판정·안분 분모(`totalPropertyTransferPrice`)를 합계액으로 두고,
 * - 주택 카드를 **먼저** 계산해 그 판정을 부수토지 카드에 넘긴다(`appurtenantHouseVerdict`).
 */
import { expropriationProvisoLandCutoff } from "./transfer-tax-appurtenant-land";
import type { TransferTaxInput, TransferTaxResult } from "./types/transfer.types";
import type { TransferTaxItemInput } from "./types/transfer-aggregate.types";

export interface OneHouseUnit {
  houseIdx: number;
  /** 배율 이내로 확인된 부수토지 카드 — 비과세·표2 대상 */
  landIdxs: number[];
  /**
   * 12억 판정·안분 분모의 합계액에만 드는 카드 — 배율 **초과**분(`appurtenant_excess`)과 면적이 없어 배율 이내인지 판정하지 못한
   * 부수토지 선언 카드(#18). 비과세·표2 대상은 아니다(초과분은 비사업용 토지, 판정 불가는 «모름 = 혜택 불성립»).
   */
  valuationOnlyIdxs: number[];
  /** §89①3호 괄호 — 주택 + 부수토지(배율 초과분·판정 불가 카드 포함) 양도가액 합계 */
  combinedTransferPrice: number;
}

/** 단위를 찾는다. 성립하지 않으면 undefined(현행 카드별 계산). */
export function resolveOneHouseUnit(
  items: TransferTaxItemInput[],
  warnings: string[],
): OneHouseUnit | undefined {
  const houseIdxs = items.flatMap((it, i) => (it.oneHouseUnitRole === "house" ? [i] : []));
  const landIdxs = items.flatMap((it, i) => (it.oneHouseUnitRole === "appurtenant_land" ? [i] : []));
  const excessIdxs = items.flatMap((it, i) => (it.oneHouseUnitRole === "appurtenant_excess" ? [i] : []));
  /**
   * 부수토지로 선언됐으나 배율 이내인지 **판정하지 못한** 카드(토지 면적·정착면적 미입력) — 비과세·표2 단위에는 넣지 않는다
   * (초과분이 비과세로 새지 않게). 조용히 일반 토지로 계산하지 않고 알린다. 다만 12억 판정·안분 분모의 합계액에는 넣는다(#18 —
   * 가액을 모르는 것이 아니라 면적을 몰라 비과세 대상인지만 모른다. 빼면 주택이 토지 없이 홀로 판정돼 고가주택이 비과세로 샌다).
   * 배율 초과 카드는 route가 일체과세 컨텍스트를 떼어 내므로(`primaryContextForCompanionRate: undefined`) 여기 걸리지 않고
   * `appurtenant_excess`로 따로 들어온다.
   */
  const unverifiedIdxs = items.flatMap((it, i) =>
    it.oneHouseUnitRole === undefined &&
    it.propertyType === "land" &&
    it.landNature === "appurtenant_to_housing" &&
    it.primaryContextForCompanionRate !== undefined
      ? [i]
      : [],
  );
  if (houseIdxs.length === 1 && items[houseIdxs[0]].isOneHousehold && unverifiedIdxs.length > 0) {
    warnings.push(
      "주택부수토지로 선언한 토지의 면적(토지 면적·건물 정착면적)이 없어 배율 이내인지 판정하지 못했습니다 — 1세대1주택 비과세(소득세법 §89①3호)를 적용하지 않고 일반 토지로 계산했습니다. 고가주택(12억 초과) 판정에는 그 토지 가액을 합산했습니다.",
    );
  }
  /**
   * 사례 28 역방향 — 주 자산이 주택부수토지이고 주택은 함께 양도 자산인 구성. route는 짝 주택을 정할 수 있으면(함께 양도 주택 계열이 일반 주택
   * 1건 · 그 주택의 건물 정착면적 있음) 그 주택 카드에 `house` 역할을 붙이고 첫 자산 토지를 배율 이내·초과로 나눈다(G1 —
   * `bundled-reverse-appurtenant.ts`). 짝 주택을 정하지 못해 역할이 없는 채로 들어온 구성만 여기 걸린다 — 조용히 계산하지 않고 알린다.
   */
  if (
    houseIdxs.length === 0 &&
    items.some((it) => it.propertyType === "housing") &&
    items.some((it) => it.oneHouseUnitRole === undefined && it.propertyType === "land" && it.landNature === "appurtenant_to_housing")
  ) {
    warnings.push(
      "주택부수토지를 첫 자산으로 입력한 구성에서 짝 주택을 정하지 못해(함께 양도하는 주택이 일반 주택 1건이고 그 주택의 건물 정착면적이 입력돼 있어야 합니다) 배율 이내·초과 구분과 1세대1주택 합산 판정(소득세법 §89①3호)을 하지 않았습니다 — 주택부수토지는 주택과 따로 일반 토지로 계산했습니다. 주택을 첫 자산으로 입력하면 이 판정을 합니다.",
    );
  }
  const valuationOnlyIdxs = [...excessIdxs, ...unverifiedIdxs];
  if (houseIdxs.length !== 1 || (landIdxs.length === 0 && valuationOnlyIdxs.length === 0)) return undefined;
  const members = [houseIdxs[0], ...landIdxs];
  /**
   * 지분(`totalPropertyTransferPrice`)·부담부증여(§159 분모)는 12억 분모가 이미 다른 의미로 쓰인다 —
   * 합계액으로 덮으면 두 축이 섞인다. 합산하지 않고 알린다(조용한 현행 유지 금지).
   */
  const conflicted = members.some(
    (i) =>
      items[i].totalPropertyTransferPrice !== undefined ||
      items[i].burdenedGiftDenominator !== undefined ||
      items[i].transferType === "burdened_gift" ||
      items[i].acquisitionCause === "burdened_gift",
  );
  if (conflicted) {
    warnings.push(
      "주택과 부수토지를 나눠 입력한 일괄양도에 지분·부담부증여가 함께 있어 1세대1주택 합산 판정(소득세법 §89①3호)을 하지 않았습니다 — 부수토지는 일반 토지로 계산됩니다.",
    );
    return undefined;
  }
  const combinedTransferPrice = [...members, ...valuationOnlyIdxs].reduce((sum, i) => sum + items[i].transferPrice, 0);
  return { houseIdx: houseIdxs[0], landIdxs, valuationOnlyIdxs, combinedTransferPrice };
}

/** 단위 카드의 12억 판정·안분 분모를 합계액으로 둔다. */
export function applyOneHouseUnitPrice(
  items: TransferTaxItemInput[],
  unit: OneHouseUnit | undefined,
): TransferTaxItemInput[] {
  if (!unit) return items;
  const members = new Set([unit.houseIdx, ...unit.landIdxs]);
  return items.map((it, i) =>
    members.has(i) ? { ...it, totalPropertyTransferPrice: unit.combinedTransferPrice } : it,
  );
}

/** 계산 순서 — 주택 카드를 먼저(부수토지 카드가 그 판정을 받는다). */
export function oneHouseUnitOrder(length: number, unit: OneHouseUnit | undefined): number[] {
  const all = Array.from({ length }, (_, i) => i);
  return unit ? [unit.houseIdx, ...all.filter((i) => i !== unit.houseIdx)] : all;
}

/** 주택 카드 결과 → 부수토지 카드에 넘길 판정 */
export function toHouseVerdict(
  house: TransferTaxItemInput,
  result: TransferTaxResult,
): NonNullable<TransferTaxInput["appurtenantHouseVerdict"]> {
  return {
    isExempt: result.isExempt === true,
    isPartialExempt: result.isPartialExempt === true,
    houseAcquisitionDate: house.acquisitionDate,
    carryoverOneHouseExcluded: result.carryoverTaxationDetail?.exclusionReason === "one_house_exemption",
    oneHouseForTable2: result.lthdTable2OneHouseAxis === true,
    expropriationLandCutoff: expropriationProvisoLandCutoff(house),
  };
}
