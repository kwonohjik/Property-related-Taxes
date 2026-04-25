/**
 * 양도소득세 다건 합산 엔진 헬퍼 (Layer 2 — Internal helpers)
 *
 * `transfer-tax-aggregate.ts` 가 800줄 정책을 초과하여 헬퍼 영역을 분리.
 * 외부 소비자는 본체(`./transfer-tax-aggregate`)에서 재수출되는 심볼(`classifyRateGroup` 등)을 사용한다.
 */

import {
  calcTax,
  parseRatesFromMap,
  type TransferTaxInput,
  type TransferTaxResult,
} from "./transfer-tax";
import { calculateProgressiveTax } from "./tax-utils";
import type { TaxRatesMap } from "@/lib/db/tax-rates";
import type {
  RateGroup,
  TransferTaxItemInput,
  AggregateTransferInput,
  GroupTaxResult,
  LossOffsetRow,
} from "./types/transfer-aggregate.types";

// ============================================================
// M-0: 입력 검증
// ============================================================

export function validateInput(input: AggregateTransferInput): void {
  if (!input.properties || input.properties.length === 0) {
    throw new Error("다건 양도 입력: properties는 1건 이상이어야 합니다.");
  }
  if (input.properties.length > 20) {
    throw new Error("다건 양도 입력: properties는 최대 20건까지 지원합니다.");
  }
  const ids = new Set<string>();
  for (const p of input.properties) {
    if (ids.has(p.propertyId)) {
      throw new Error(`중복된 propertyId: ${p.propertyId}`);
    }
    ids.add(p.propertyId);
    const year = p.transferDate.getFullYear();
    if (year !== input.taxYear) {
      throw new Error(
        `자산 ${p.propertyId}의 양도일 연도(${year})가 과세기간(${input.taxYear})과 다릅니다.`,
      );
    }
  }
}

// ============================================================
// M-2: 세율군 분류
// ============================================================

export function classifyRateGroup(
  item: TransferTaxItemInput,
  result: TransferTaxResult,
): RateGroup {
  if (item.isUnregistered) return "unregistered";

  const acqDate =
    item.acquisitionCause === "inheritance" && item.decedentAcquisitionDate
      ? item.decedentAcquisitionDate
      : item.acquisitionCause === "gift" && item.donorAcquisitionDate
        ? item.donorAcquisitionDate
        : item.acquisitionDate;
  const holdingMonths = monthsBetween(acqDate, item.transferDate);
  const isHousingLike =
    item.propertyType === "housing" ||
    item.propertyType === "right_to_move_in" ||
    item.propertyType === "presale_right";
  if (holdingMonths < 24 && (isHousingLike || holdingMonths < 24)) {
    return "short_term";
  }

  if (result.surchargeType === "non_business_land" || item.isNonBusinessLand) return "non_business_land";

  const multiHouseByResult =
    result.surchargeType === "multi_house_2" || result.surchargeType === "multi_house_3plus";
  const multiHouseByInput =
    isHousingLike &&
    item.isRegulatedArea &&
    item.householdHousingCount >= 2;
  if ((multiHouseByResult || multiHouseByInput) && !result.isSurchargeSuspended) {
    return "multi_house_surcharge";
  }

  return "progressive";
}

export function monthsBetween(from: Date, to: Date): number {
  const y = to.getFullYear() - from.getFullYear();
  const m = to.getMonth() - from.getMonth();
  const d = to.getDate() - from.getDate();
  return y * 12 + m - (d < 0 ? 1 : 0);
}

// ============================================================
// M-3: 차손 통산 (§102② · 시행령 §167의2)
// ============================================================

export interface AssetRecord {
  item: TransferTaxItemInput;
  singleInput: TransferTaxInput;
  result: TransferTaxResult;
  rateGroup: RateGroup;
  taxableGain: number;
  lthd: number;
  income: number;
}

export interface LossOffsetOutput {
  lossOffsetTable: LossOffsetRow[];
  lossOffsetFromSame: number[];
  lossOffsetFromOther: number[];
  incomeAfterOffset: number[];
  unusedLoss: number;
}

export function offsetLosses(records: AssetRecord[]): LossOffsetOutput {
  const n = records.length;
  const fromSame: number[] = new Array(n).fill(0);
  const fromOther: number[] = new Array(n).fill(0);
  const table: LossOffsetRow[] = [];

  const byGroup = new Map<RateGroup, number[]>();
  records.forEach((r, i) => {
    if (r.result.isExempt) return;
    const list = byGroup.get(r.rateGroup) ?? [];
    list.push(i);
    byGroup.set(r.rateGroup, list);
  });

  const remainingLossByGroup = new Map<RateGroup, number>();
  const remainingGainByAsset: number[] = records.map((r) => (r.result.isExempt ? 0 : Math.max(0, r.income)));

  for (const [group, idxList] of byGroup) {
    const gainIdx = idxList.filter((i) => records[i].income > 0);
    const lossIdx = idxList.filter((i) => records[i].income < 0);
    const totalGain = gainIdx.reduce((s, i) => s + records[i].income, 0);
    const totalLossAbs = lossIdx.reduce((s, i) => s + Math.abs(records[i].income), 0);
    const offsetPool = Math.min(totalGain, totalLossAbs);

    if (offsetPool > 0 && totalGain > 0) {
      let distributed = 0;
      gainIdx.forEach((gi, pos) => {
        const isLast = pos === gainIdx.length - 1;
        const share = isLast
          ? offsetPool - distributed
          : Math.floor((records[gi].income * offsetPool) / totalGain);
        if (share > 0) {
          fromSame[gi] += share;
          remainingGainByAsset[gi] -= share;
          let lossShareRemaining = share;
          lossIdx.forEach((li, lpos) => {
            const isLastLoss = lpos === lossIdx.length - 1;
            const fromThis = isLastLoss
              ? lossShareRemaining
              : Math.min(
                  lossShareRemaining,
                  Math.floor((Math.abs(records[li].income) * share) / totalLossAbs),
                );
            if (fromThis > 0) {
              table.push({
                fromPropertyId: records[li].item.propertyId,
                toPropertyId: records[gi].item.propertyId,
                amount: fromThis,
                scope: "same_group",
              });
              lossShareRemaining -= fromThis;
            }
          });
        }
        distributed += share;
      });
    }

    remainingLossByGroup.set(group, totalLossAbs - offsetPool);
  }

  const totalRemainingLoss = [...remainingLossByGroup.values()].reduce((s, v) => s + v, 0);
  const totalRemainingGain = remainingGainByAsset.reduce((s, v) => s + v, 0);
  const offsetPool2 = Math.min(totalRemainingLoss, totalRemainingGain);

  if (offsetPool2 > 0 && totalRemainingGain > 0) {
    const lossGroups = [...remainingLossByGroup.entries()].filter(([, v]) => v > 0);
    const gainIndices = remainingGainByAsset
      .map((g, i) => ({ i, g }))
      .filter((x) => x.g > 0);

    let consumedGain = 0;
    gainIndices.forEach((gx, pos) => {
      const isLast = pos === gainIndices.length - 1;
      const share = isLast
        ? offsetPool2 - consumedGain
        : Math.floor((gx.g * offsetPool2) / totalRemainingGain);
      if (share > 0) {
        fromOther[gx.i] += share;
        let remainingShare = share;
        lossGroups.forEach(([lossGroup, lossGroupRemain], lgPos) => {
          if (lossGroupRemain <= 0) return;
          const isLastGroup = lgPos === lossGroups.length - 1;
          const fromThisGroup = isLastGroup
            ? remainingShare
            : Math.min(
                remainingShare,
                Math.floor((lossGroupRemain * share) / totalRemainingLoss),
              );
          if (fromThisGroup > 0) {
            const lossIdxInGroup = records
              .map((r, i) => ({ i, r }))
              .filter((x) => x.r.rateGroup === lossGroup && x.r.income < 0);
            const groupLossTotal = lossIdxInGroup.reduce((s, x) => s + Math.abs(x.r.income), 0);
            let distributed = 0;
            lossIdxInGroup.forEach((lx, lpos) => {
              const isLastAsset = lpos === lossIdxInGroup.length - 1;
              const fromThisAsset = isLastAsset
                ? fromThisGroup - distributed
                : Math.floor((Math.abs(lx.r.income) * fromThisGroup) / groupLossTotal);
              if (fromThisAsset > 0) {
                table.push({
                  fromPropertyId: lx.r.item.propertyId,
                  toPropertyId: records[gx.i].item.propertyId,
                  amount: fromThisAsset,
                  scope: "other_group",
                });
                distributed += fromThisAsset;
              }
            });
            remainingShare -= fromThisGroup;
          }
        });
      }
      consumedGain += share;
    });
  }

  const unusedLoss = totalRemainingLoss - offsetPool2;

  const incomeAfterOffset = records.map((r, i) => {
    if (r.result.isExempt) return 0;
    if (r.income < 0) return 0;
    return Math.max(0, r.income - fromSame[i] - fromOther[i]);
  });

  return {
    lossOffsetTable: table,
    lossOffsetFromSame: fromSame,
    lossOffsetFromOther: fromOther,
    incomeAfterOffset,
    unusedLoss,
  };
}

// ============================================================
// M-4: 기본공제 배분
// ============================================================

export function allocateBasicDeduction(
  eligible: { idx: number; rateGroup: RateGroup; income: number; transferDate: Date }[],
  available: number,
  strategy: "MAX_BENEFIT" | "FIRST" | "EARLIEST_TRANSFER",
): { idx: number; amount: number }[] {
  if (available <= 0 || eligible.length === 0) return [];

  let sorted: typeof eligible;
  if (strategy === "FIRST") {
    sorted = [...eligible].sort((a, b) => a.transferDate.getTime() - b.transferDate.getTime());
  } else if (strategy === "EARLIEST_TRANSFER") {
    sorted = [...eligible].sort((a, b) => a.transferDate.getTime() - b.transferDate.getTime());
  } else {
    const groupPriority: Record<RateGroup, number> = {
      unregistered: 5,
      short_term: 4,
      multi_house_surcharge: 3,
      non_business_land: 2,
      progressive: 1,
    };
    sorted = [...eligible].sort((a, b) => {
      const dg = (groupPriority[b.rateGroup] ?? 0) - (groupPriority[a.rateGroup] ?? 0);
      if (dg !== 0) return dg;
      return b.income - a.income;
    });
  }

  const result: { idx: number; amount: number }[] = [];
  let remaining = available;
  for (const e of sorted) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, e.income);
    if (take > 0) {
      result.push({ idx: e.idx, amount: take });
      remaining -= take;
    }
  }
  return result;
}

// ============================================================
// M-5: 세율군별 집계 + 세율 적용
// ============================================================

export function aggregateByGroup(
  records: AssetRecord[],
  incomeAfterOffset: number[],
  allocatedBasic: number[],
  rates: TaxRatesMap,
): GroupTaxResult[] {
  const groupMap = new Map<RateGroup, number[]>();
  records.forEach((r, i) => {
    if (r.result.isExempt) return;
    const list = groupMap.get(r.rateGroup) ?? [];
    list.push(i);
    groupMap.set(r.rateGroup, list);
  });

  const out: GroupTaxResult[] = [];
  for (const [group, idxList] of groupMap) {
    const groupGrossGain = idxList
      .filter((i) => records[i].income > 0)
      .reduce((s, i) => s + records[i].income, 0);
    const groupGrossLoss = idxList
      .filter((i) => records[i].income < 0)
      .reduce((s, i) => s + Math.abs(records[i].income), 0);
    const groupIncomeAmount = idxList.reduce((s, i) => s + incomeAfterOffset[i], 0);
    const groupBasicDeduction = idxList.reduce((s, i) => s + allocatedBasic[i], 0);
    const groupTaxBase = Math.max(0, groupIncomeAmount - groupBasicDeduction);

    const repIdx = idxList[0];
    const rep = records[repIdx];
    const parsedRates = parseRatesFromMap(rates);
    const taxResult = calcTax(groupTaxBase, parsedRates, rep.singleInput);

    out.push({
      group,
      assetIds: idxList.map((i) => records[i].item.propertyId),
      groupGrossGain,
      groupGrossLoss,
      groupIncomeAmount,
      groupBasicDeduction,
      groupTaxBase,
      groupCalculatedTax: taxResult.calculatedTax,
      appliedRate: taxResult.appliedRate,
      surchargeRate: taxResult.surchargeRate,
      progressiveDeduction: taxResult.progressiveDeduction,
    });
  }

  return out;
}

// ============================================================
// M-6: 전체 누진세율 (방법 A)
// ============================================================

export function applyGeneralProgressive(taxBase: number, rates: TaxRatesMap): number {
  if (taxBase <= 0) return 0;
  const { brackets } = parseRatesFromMap(rates);
  return calculateProgressiveTax(taxBase, brackets);
}
