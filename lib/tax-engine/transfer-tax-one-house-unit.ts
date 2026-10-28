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
import {
  allocateUnitExcessShares,
  expropriationProvisoLandCutoff,
  isLaterAcquiredLandExemptExcluded,
} from "./transfer-tax-appurtenant-land";
import { isLthdTable2SubjectAsset } from "./lthd-table2-subject";
import {
  landOnlyBuildingOwnerOtherHousehold,
  landOnlyHouseholdMergeDate,
} from "./land-only-owner-household";
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
  /** `valuationOnlyIdxs` 중 **배율 초과분 카드**(`appurtenant_excess`) — 재산세제과-915 회신 방식의 «초과분 양도차익» 합계(X)가 되는 카드(#17-2 확장). */
  excessIdxs: number[];
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
  return { houseIdx: houseIdxs[0], landIdxs, valuationOnlyIdxs, excessIdxs, combinedTransferPrice };
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
    houseTable2Subject: isLthdTable2SubjectAsset(house),
    houseLandOnlyOtherHousehold: landOnlyBuildingOwnerOtherHousehold(house),
    houseMergeDate: landOnlyHouseholdMergeDate(house),
    expropriationLandCutoff: expropriationProvisoLandCutoff(house),
  };
}

/**
 * #17-2 확장 — 고가주택(12억 초과 부분과세) 단위에서 **기획재정부 재산세제과-915(2011.10.27.) 회신 방식**이 요구하는 «전체 부수토지»를 카드 단위로 되살린다.
 *
 * 회신: 기준면적 이내 토지분 = 전체 부수토지 양도차익의 안분값 − 배율 초과분 양도차익(음수면 0). 함께 양도에서는 주택 카드·한도 내 부수토지 카드·배율 초과 카드가
 * 따로 계산돼 한도 내 카드가 초과분 카드의 양도차익을 모른다 — 종전에는 카드마다 자기 양도차익만 안분해 초과분이 한 번 더 빠지지 않았다(옛 산식과 같은 구조).
 * 여기서는 주택 카드를 먼저 계산한 1차 결과로 단위 전체의 한도 내 토지 조각(주택 카드의 토지분 · 한도 내 부수토지 카드)과 초과분 합계(X)를 구해 조각별 몫을 정한다.
 * 몫은 `allocateUnitExcessShares`(Σ몫 = X)이며, 각 카드는 `highValueExcessShare`로 받아 max(0, 안분(자기 양도차익 + 몫) − 몫)을 과세한다
 * (`highValueExcessLandTaxableGain` — 단일 주택 입력과 같은 함수).
 *
 * 몫을 줄 대상이 없으면(주택이 부분과세가 아님 · 초과분 없음 · 조각 없음) 빈 맵이다 — 종전 계산 그대로.
 * 주택 카드는 자기 초과분 외에 **다른 카드의 초과분**이나 **다른 한도 내 토지 카드**가 있을 때만 다시 계산한다(그 밖에는 몫 = 자기 초과분이라 값이 같다).
 *
 * **토지 차손** — 한도 내 조각과 초과분이 **모두 차손**이면 차손 조각에도 음수 몫을 준다(915 식을 부호만 대칭으로 — 단일 주택 입력과 같은 값, 사용자 결정 2026-10-20).
 * 종전에는 차손 조각 · 차손 초과분을 0으로 버려, 한도 내 카드가 자기 차손만 안분해 같은 차손이 초과분(전액)과 이내분(안분)에 이중으로 반영됐다.
 * 이익과 차손이 **섞이면** 종전대로 양수 조각 · 양수 초과분만 나눈다 — 섞인 경우의 계산 방법은 해석례를 확인하지 못했다
 * (계획서 `transfer-split-part-loss-offset-p3.plan.md` §2 B안 · 고지 `isUnitExcessSignMixed`).
 *
 * @returns 카드 인덱스 → 그 카드가 다시 계산돼야 할 때의 몫(`highValueExcessShare`)
 */
export function resolveUnitExcessShares(
  items: readonly TransferTaxItemInput[],
  unit: OneHouseUnit,
  results: readonly TransferTaxResult[],
): Map<number, number> {
  const out = new Map<number, number>();
  const facts = unitExcessFacts(items, unit, results);
  if (!facts) return out;

  const allLoss = facts.pieces.every((p) => p.gain < 0) && facts.excesses.every((e) => e <= 0);
  const pieces = allLoss ? facts.pieces : facts.pieces.filter((p) => p.gain > 0);
  const kept = facts.excesses.map((e) => (allLoss ? e : Math.max(0, e)));
  const externalExcess = kept.slice(1).reduce((a, b) => a + b, 0);
  const excessTotal = kept[0] + externalExcess;
  if (excessTotal === 0 || pieces.length === 0) return out;

  const shares = allocateUnitExcessShares(pieces.map((p) => p.gain), excessTotal);
  pieces.forEach((p, k) => {
    if (shares[k] === 0) return;
    // 주택 카드는 자기 초과분만으로 계산한 값과 같으면(외부 초과분·다른 조각 없음) 다시 계산하지 않는다.
    if (p.idx === unit.houseIdx && externalExcess === 0 && pieces.length === 1) return;
    out.set(p.idx, shares[k]);
  });
  return out;
}

/**
 * 단위 몫의 재료 — 부호를 그대로 둔 한도 내 토지 조각과 초과분(주택 카드 자기 초과분이 첫 원소, 이어서 배율 초과 카드들).
 * 주택이 부분과세가 아니면 null(몫 없음).
 */
function unitExcessFacts(
  items: readonly TransferTaxItemInput[],
  unit: OneHouseUnit,
  results: readonly TransferTaxResult[],
): { pieces: { idx: number; gain: number }[]; excesses: number[] } | null {
  const house = results[unit.houseIdx];
  if (!house || house.isPartialExempt !== true || house.isExempt === true) return null;

  const gainOf = (i: number) => results[i]?.transferGain ?? 0;
  const ownExcess = house.splitDetail?.nonBusinessLandPart?.gain ?? 0;
  const excesses = [ownExcess, ...unit.excessIdxs.map(gainOf)];

  // 한도 내 토지 조각 — 주택 카드의 토지분(분리 파트가 있고 나중 취득 토지로 제외되지 않은 경우) + 부분과세로 판정된 한도 내 부수토지 카드.
  const pieces: { idx: number; gain: number }[] = [];
  const houseLand = house.splitDetail?.land;
  if (houseLand && !isLaterAcquiredLandExemptExcluded(items[unit.houseIdx] as unknown as TransferTaxInput)) {
    const w = houseLand.gain - ownExcess;
    if (w !== 0) pieces.push({ idx: unit.houseIdx, gain: w });
  }
  for (const i of unit.landIdxs) {
    const r = results[i];
    if (r && r.isPartialExempt === true && r.isExempt !== true && gainOf(i) !== 0) pieces.push({ idx: i, gain: gainOf(i) });
  }
  return { pieces, excesses };
}

/**
 * 고가주택 단위에 배율 초과분이 있고, 한도 내 토지 조각 · 초과분 사이에 **양도차익과 양도차손이 섞여** 있는가 — 고지용.
 * 이때 `resolveUnitExcessShares`는 종전대로 양수만 나누고, 섞인 경우의 계산 방법은 확인 필요로 남긴다(계획서 p3 §2 B안).
 */
export function isUnitExcessSignMixed(
  items: readonly TransferTaxItemInput[],
  unit: OneHouseUnit,
  results: readonly TransferTaxResult[],
): boolean {
  const facts = unitExcessFacts(items, unit, results);
  if (!facts || facts.excesses.every((e) => e === 0)) return false;
  const values = [...facts.pieces.map((p) => p.gain), ...facts.excesses.filter((e) => e !== 0)];
  return values.some((v) => v > 0) && values.some((v) => v < 0);
}
