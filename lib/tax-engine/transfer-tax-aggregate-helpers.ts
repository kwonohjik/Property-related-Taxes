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

  // 분양권은 **보유기간과 무관하게** 단일세율 그룹이다 (§104①1호 괄호:
  //   "제55조제1항에 따른 세율(**분양권의 경우에는 양도소득 과세표준의 100분의 60**)").
  //   → 1년 미만 70%(3호) · 1~2년 60%(2호) · **2년 이상 60%(1호 괄호)** — 어느 구간도 누진이 아니다.
  //
  // 2026-07-29 정정(#591 감사 R7 — **세액 변경**): 2년 이상 분양권이 위 24개월 게이트를 빠져나가
  // `progressive`로 분류됐다. §104⑤2호 그룹 합산에서 누진 자산과 한 그룹이 되면서
  // **그룹 대표세율(60%)이 합산 과세표준 전체에 적용**돼 과세 초과가 발생했다.
  //   실측: 분양권 차익 3억(60%=180,000,000) + 사업용 토지 차익 2억(누진=56,060,000)
  //        → 올바른 §104⑤ = MAX(합산누진 174,060,000, 자산별합 236,060,000) = 236,060,000
  //        → 종전 산출 300,000,000 (= 5억 × 60%). 63,940,000 과세 초과.
  //
  // 조합원입주권(`right_to_move_in`)은 대상이 **아니다** — §104①1호 괄호가 분양권만 지목하고,
  // 2년 이상이면 §55① 누진세율이다(2호·3호는 2년 미만 구간 전용). 현행 분류 유지.
  if (item.propertyType === "presale_right") {
    return "short_term";
  }

  if (result.surchargeType === "non_business_land" || item.isNonBusinessLand) return "non_business_land";

  const multiHouseByResult =
    result.surchargeType === "multi_house_2" || result.surchargeType === "multi_house_3plus";
  const multiHouseByInput =
    isHousingLike &&
    item.isRegulatedArea &&
    item.householdHousingCount >= 2;
  // 부칙 §9270호 §14①(rateSurchargeStatutoryExcluded): surchargeType은 유지하나 세율 중과 미적용 →
  // §104⑤ 그룹은 progressive로 분류(기존 배제/유예 분류는 불변 — 이 케이스만 좁게 제외).
  if ((multiHouseByResult || multiHouseByInput) && !result.isSurchargeSuspended && !result.rateSurchargeStatutoryExcluded) {
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
  /**
   * 정밀 NBL 판정(result.nonBusinessLandJudgmentDetail)으로 교정한 입력.
   * 원시 isNonBusinessLand는 사용자 체크박스라 정밀판정과 어긋날 수 있어,
   * 그룹 분류·세율 재계산은 반드시 이 교정본을 사용한다(사업용 오중과 방지).
   * - correctedItem: classifyRateGroup용 (TransferTaxItemInput)
   * - correctedSingleInput: calcTax용 (TransferTaxInput)
   */
  correctedItem: TransferTaxItemInput;
  correctedSingleInput: TransferTaxInput;
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
  eligible: { idx: number; rateGroup: RateGroup; income: number; transferDate: Date; rate: number }[],
  available: number,
  strategy: "MAX_BENEFIT" | "FIRST" | "EARLIEST_TRANSFER",
): { idx: number; amount: number }[] {
  if (available <= 0 || eligible.length === 0) return [];

  let sorted: typeof eligible;
  if (strategy === "FIRST") {
    // 입력 순서 우선 — 목록 첫 번째 자산(idx 오름차순). 양도일 순(EARLIEST_TRANSFER)과 구분.
    sorted = [...eligible].sort((a, b) => a.idx - b.idx);
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
      // 동일 그룹 내: 적용세율 높은 자산에 기본공제 우선 배분 (세액 절감 최대 = MAX_BENEFIT).
      // short_term 그룹에 1년 미만 50% + 1~2년 40%가 섞인 경우 등 순서 의존 제거.
      const dr = b.rate - a.rate;
      if (dr !== 0) return dr;
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
  const parsedRates = parseRatesFromMap(rates);
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

    let groupCalculatedTax: number;
    let appliedRate: number;
    let surchargeRate: number | undefined;
    let progressiveDeduction: number;

    if (group === "short_term") {
      // §104⑤2호 — 단기 단일세율은 호(1년 미만 50%/70%, 1~2년 40%/60%)별로 다를 수 있다.
      // 자산별 과세표준(= max(0, incomeAfterOffset[i] - allocatedBasic[i])) × 자산별 세율로 산출세액 계산.
      // calcTax를 자산 입력으로 재호출하여 §104①후단(비사업용+단기 큰 세액) 분기까지 정확히 반영.
      const perAsset = idxList.map((i) => {
        const assetTaxBase = Math.max(0, incomeAfterOffset[i] - allocatedBasic[i]);
        const tr = calcTax(assetTaxBase, parsedRates, records[i].correctedSingleInput);
        return { rate: tr.appliedRate, tax: tr.calculatedTax };
      });
      const uniformRate = perAsset.every((p) => p.rate === perAsset[0].rate);
      if (uniformRate) {
        // 동일 세율(예: 일괄양도 일체과세 70% — 사례 28)은 합산 과세표준 × 세율로 1회 floor.
        // 자산별 floor 합산은 floor 횟수 차이로 ±N원 오차가 나므로 동일 세율은 기존 합산 방식 유지.
        const tr = calcTax(groupTaxBase, parsedRates, records[idxList[0]].correctedSingleInput);
        groupCalculatedTax = tr.calculatedTax;
        appliedRate = tr.appliedRate;
      } else {
        // 세율 혼재(50%+40% 등) — 그룹 합산 후 대표세율 1개 적용은 순서 의존·세액 오류.
        // §104⑤2호에 따라 자산별 산출세액의 합으로 계산.
        groupCalculatedTax = perAsset.reduce((s, p) => s + p.tax, 0);
        appliedRate = Math.max(...perAsset.map((p) => p.rate)); // 표시용 최고세율
      }
      surchargeRate = undefined;
      progressiveDeduction = 0;
    } else {
      // 누진세율 호(progressive·multi_house_surcharge·non_business_land) 및 미등기 단일 70%.
      //
      // §104⑤2호 **단서**는 "둘 이상의 자산에 대하여 … **동일한 호**의 세율이 적용되고,
      // 그 적용세율이 둘 이상인 경우"에만 합산 후 호별 세율을 적용하도록 한다.
      // ⇒ 한 그룹 안에서 **적용 호가 갈리면** 단서가 아니라 **본문**(자산별 산출세액 합계)이다.
      //
      // 2026-07-29 정정(#591 감사 R7 — **세액 변경**): `multi_house_surcharge` 그룹은
      // §104⑦**1호**(1세대 2주택 +20%p)와 §104⑦**3호**(1세대 3주택 이상 +30%p)가 **섞일 수 있는데**,
      // 종전에는 `records[idxList[0]]`(입력 첫 자산)의 세율을 그룹 합산 과세표준 전체에 적용했다.
      //   → 3주택 우선 324,060,000 / 2주택 우선 274,060,000 — **입력 순서에 따라 세액이 달라졌다**.
      //   → §104⑤2호 본문 도출값은 280,120,000이다
      //     (3억: 누진 94,060,000 + 30% 90,000,000 / 2억: 누진 56,060,000 + 20% 40,000,000).
      //
      // `short_term` 그룹은 위에서 이미 같은 판정을 하고 있었다(세율 혼재 → 자산별 합) —
      // 누진 호 쪽만 빠져 있던 내부 불일치다. 동일 세율이면 종전대로 합산 1회 floor를 유지한다
      // (자산별 floor 합산은 floor 횟수 차이로 ±N원이 어긋난다).
      const perAsset = idxList.map((i) => {
        const assetTaxBase = Math.max(0, incomeAfterOffset[i] - allocatedBasic[i]);
        const tr = calcTax(assetTaxBase, parsedRates, records[i].correctedSingleInput);
        return { tax: tr.calculatedTax, rate: tr.appliedRate, surcharge: tr.surchargeRate };
      });
      // 호 판정 대리값 = 중과 가산율. 가산율이 갈리면 적용 호가 다르다는 뜻이다.
      const mixedTier = perAsset.some((p) => p.surcharge !== perAsset[0].surcharge);
      if (mixedTier) {
        groupCalculatedTax = perAsset.reduce((sum, p) => sum + p.tax, 0);
        appliedRate = Math.max(...perAsset.map((p) => p.rate)); // 표시용 최고세율
        surchargeRate = Math.max(...perAsset.map((p) => p.surcharge ?? 0));
        progressiveDeduction = 0; // 자산별 누진공제가 상이 — 합산 표시 불가
      } else {
        const rep = records[idxList[0]];
        const taxResult = calcTax(groupTaxBase, parsedRates, rep.correctedSingleInput);
        groupCalculatedTax = taxResult.calculatedTax;
        appliedRate = taxResult.appliedRate;
        surchargeRate = taxResult.surchargeRate;
        progressiveDeduction = taxResult.progressiveDeduction;
      }
    }

    out.push({
      group,
      assetIds: idxList.map((i) => records[i].item.propertyId),
      groupGrossGain,
      groupGrossLoss,
      groupIncomeAmount,
      groupBasicDeduction,
      groupTaxBase,
      groupCalculatedTax,
      appliedRate,
      surchargeRate,
      progressiveDeduction,
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
