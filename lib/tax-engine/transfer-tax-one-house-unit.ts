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
import type { TransferTaxInput, TransferTaxResult } from "./types/transfer.types";
import type { TransferTaxItemInput } from "./types/transfer-aggregate.types";

export interface OneHouseUnit {
  houseIdx: number;
  landIdxs: number[];
  /** §89①3호 괄호 — 주택 + 배율 이내 부수토지 양도가액 합계 */
  combinedTransferPrice: number;
}

/** 단위를 찾는다. 성립하지 않으면 undefined(현행 카드별 계산). */
export function resolveOneHouseUnit(
  items: TransferTaxItemInput[],
  warnings: string[],
): OneHouseUnit | undefined {
  const houseIdxs = items.flatMap((it, i) => (it.oneHouseUnitRole === "house" ? [i] : []));
  const landIdxs = items.flatMap((it, i) => (it.oneHouseUnitRole === "appurtenant_land" ? [i] : []));
  /**
   * 부수토지로 선언됐으나 배율 이내인지 **판정하지 못한** 카드(토지 면적·정착면적 미입력) — 단위에 넣지 않는다
   * (초과분이 비과세로 새지 않게). 조용히 일반 토지로 계산하지 않고 알린다.
   * 배율 초과 카드는 route가 일체과세 컨텍스트를 떼어 내므로(`primaryContextForCompanionRate: undefined`) 여기 걸리지 않는다.
   */
  const unverified = items.filter(
    (it) =>
      it.oneHouseUnitRole === undefined &&
      it.propertyType === "land" &&
      it.landNature === "appurtenant_to_housing" &&
      it.primaryContextForCompanionRate !== undefined,
  );
  if (houseIdxs.length === 1 && items[houseIdxs[0]].isOneHousehold && unverified.length > 0) {
    warnings.push(
      "주택부수토지로 선언한 토지의 면적(토지 면적·건물 정착면적)이 없어 배율 이내인지 판정하지 못했습니다 — 1세대1주택 비과세(소득세법 §89①3호)를 적용하지 않고 일반 토지로 계산했습니다.",
    );
  }
  if (houseIdxs.length !== 1 || landIdxs.length === 0) return undefined;
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
  const combinedTransferPrice = members.reduce((s, i) => s + items[i].transferPrice, 0);
  return { houseIdx: houseIdxs[0], landIdxs, combinedTransferPrice };
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
  };
}
