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
import { resolveSplitAwareTax, hasPartialNonBusinessLand } from "./transfer-tax-split-rate";
import type { SplitRatePart } from "./transfer-tax-split-rate";
import { PROGRESSIVE_RATE_CLAUSES } from "./transfer-tax-rate-calc";
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
): {
  groupTaxes: GroupTaxResult[];
  /**
   * 파트가 있는 자산(토지·건물 분리취득 · 한 필지 중 일부만 비사업용)의 **자산 단독 세액**.
   * 파트가 없는 자산은 `undefined`.
   *
   * `PerPropertyBreakdown.refCalculatedTax`가 쓴다 — 그 필드의 종전 산식
   * `taxBaseShare × (appliedRate + surchargeRate)`은 파트 자산에서 `appliedRate`가
   * **파트 최고세율**이라 자산 과세표준 전체에 곱해지면 과대해진다(계획서 §4.12).
   *
   * ❌ 이것은 **그룹 세액의 역안분이 아니다.** `refCalculatedTax`는 **자산 단독 참고값**이고
   *   `Σ ref ≠ 그룹 세액`은 비교과세의 본질이다(타입 문서가 「비교과세 적용 시 합산값과
   *   차이 가능」으로 명시). 예정신고는 자산별, §104⑤는 확정신고에서 전체에 적용된다.
   */
  assetPartTax: { tax: number; note?: string }[];
} {
  const groupMap = new Map<RateGroup, number[]>();
  records.forEach((r, i) => {
    if (r.result.isExempt) return;
    const list = groupMap.get(r.rateGroup) ?? [];
    list.push(i);
    groupMap.set(r.rateGroup, list);
  });

  const out: GroupTaxResult[] = [];
  const assetPartTax: { tax: number; note?: string }[] = [];
  const parsedRates = parseRatesFromMap(rates);
  /**
   * 자산 1건의 산출세액 — 토지·건물 취득일이 다른 split 자산은 파트별 세율 + §104⑤ 비교과세.
   * 단건 엔진(`transfer-tax.ts` STEP 7)과 **같은 헬퍼**를 쓴다(이중 진실 방지).
   */
  const assetTaxOf = (i: number) => {
    const assetTaxBase = Math.max(0, incomeAfterOffset[i] - allocatedBasic[i]);
    const tr = resolveSplitAwareTax({
      taxBase: assetTaxBase,
      transferIncome: incomeAfterOffset[i],
      basicDeduction: allocatedBasic[i],
      splitDetail: records[i].result.splitDetail,
      parsedRates,
      taxRateInput: records[i].correctedSingleInput,
    });
    // 파트가 있는 자산만 **자산 단독 세액**을 기록한다(§4.12 — 표시 정확화용).
    // 자산은 그룹 하나에만 속하므로 이 대입은 자산당 1회다.
    if (tr.splitPartDetail) assetPartTax[i] = { tax: tr.calculatedTax, note: tr.shortTermNote };
    return {
      tax: tr.calculatedTax,
      rate: tr.appliedRate,
      surcharge: tr.surchargeRate,
      /** 자산 단위 과세표준 — 파트가 없는 자산은 이 값이 곧 파트 과세표준이다. */
      taxBase: assetTaxBase,
      /** 자산 단위 「해당 호」 — 파트가 없는 자산의 호별 합산 키(P12 2단계). */
      rateClause: tr.rateClause,
      /** §104⑤ 본문이 「각 호별로 합산한 자산」이라 정한 **파트 목록**(있으면). */
      parts: tr.splitPartDetail?.parts,
      splitParts: tr.splitPartDetail !== undefined,
      // 한 필지 중 일부만 비사업용 — §104⑤ 본문 후단으로 **별개 자산 의제**가 걸린 자산.
      partialNbl: hasPartialNonBusinessLand(records[i].correctedSingleInput),
    };
  };
  /**
   * 자산 **내부**에서 §104⑤가 이미 적용된 자산인가.
   *   · `splitParts`  — 토지·건물 파트 분해(§94①1호상 별개 자산)
   *   · `partialNbl`  — 한 필지 중 비사토/그 외 분해(§104⑤ 본문 후단 별개 자산 의제)
   *
   * 이런 자산을 **그룹 합산 1회**로 되돌리면 그 분해가 사라진다. 특히 부분 비사토는
   * `calcTax`가 곧바로 모델 A(`누진(전체) + 10%p × 비사토분`)를 내므로 **P8 정정이 무효화**된다
   * — 그룹 합산 경로는 `resolveSplitAwareTax`를 거치지 않기 때문이다(계획서 D-12).
   *
   * ⚠️ 대가로 §104⑤2호 **단서 ⓐ**(동일 호 합산) 혜택을 포기한다(D-7과 같은 성질). 다만
   *   **법문 밖 산식(모델 A)을 법문 안 선택지(2호 본문)로** 바꾸는 것이라 방향이 명확하다.
   *   엄밀한 해법은 의제된 **파트 단위 그룹핑**이며 대규모 리팩터다(계획서 §4.8).
   */
  const isAssetLevelClause5 = (p: { splitParts: boolean; partialNbl: boolean }) =>
    p.splitParts || p.partialNbl;
  /**
   * §104⑤2호 **단서** ⓐ 요건(「동일한 호의 세율이 적용되고」) 판정용 **해당 호** 키.
   *
   * `assetTaxOf`의 `rate`·`surcharge`는 **승패가 반영된** 값이라 이 판정에 쓸 수 없다 —
   * §104⑦ 후단이 자산별로 「중과 vs 단기」 중 하나를 이미 골라버리기 때문이다.
   * 단서는 자산이 **해당하는 호**가 같은지를 묻는다(승패는 ⓑ「적용세율이 둘 이상」 쪽이다).
   *
   * 중과 호 판정은 `classifyRateGroup`의 `multiHouseByInput`과 **같은 입력 기반 규칙**을 쓴다
   * (`result.surchargeType`은 단기가 이기면 비어 있어 승패에 오염된다).
   */
  const rateClauseKeyOf = (i: number): string => {
    const item = records[i].correctedItem;
    const result = records[i].result;
    const acqDate =
      item.acquisitionCause === "inheritance" && item.decedentAcquisitionDate
        ? item.decedentAcquisitionDate
        : item.acquisitionCause === "gift" && item.donorAcquisitionDate
          ? item.donorAcquisitionDate
          : item.acquisitionDate;
    const holdingMonths = monthsBetween(acqDate, item.transferDate);
    // §104①3호(1년 미만) · 2호(1~2년) — 구간이 다르면 **호가 다르다**.
    const shortBand = holdingMonths < 12 ? "104-1-3" : holdingMonths < 24 ? "104-1-2" : "-";
    const isHousingLike =
      item.propertyType === "housing" ||
      item.propertyType === "right_to_move_in" ||
      item.propertyType === "presale_right";
    // §104⑦1호(2주택 +20%p) · 3호(3주택 이상 +30%p) — 역시 다르면 다른 호다.
    // 유예·부칙 배제로 중과가 걸리지 않으면 해당 호 자체가 없다.
    const surchargeBand =
      result.isSurchargeSuspended || result.rateSurchargeStatutoryExcluded
        ? "-"
        : isHousingLike && item.isRegulatedArea && item.householdHousingCount >= 2
          ? item.householdHousingCount >= 3
            ? "104-7-3"
            : "104-7-1"
          : "-";
    return `${shortBand}|${surchargeBand}`;
  };
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
      const perAsset = idxList.map((i) => assetTaxOf(i));
      // 토지·건물 파트별 세율이 걸린 자산은 그룹 합산 1회 계산으로 되돌리면 파트 분해가 사라진다
      // (단건 엔진과 값이 갈리는 이중 진실) — 세율이 같아 보여도 자산별 합계 경로를 쓴다.
      const uniformRate =
        !perAsset.some(isAssetLevelClause5) && perAsset.every((p) => p.rate === perAsset[0].rate);
      // §104⑤2호 **단서** — 「동일한 호의 세율이 적용되고, 그 **적용세율이 둘 이상**인 경우
      // 해당 자산에 대해서는 각 자산의 양도소득과세표준을 **합산한 것에 대하여** … 각 해당
      // 호별 세율을 적용하여 산출한 세액 중에서 **큰 산출세액**의 합계액으로 한다」.
      //
      // 자산별 승자가 갈렸을 뿐 **해당 호는 같은** 경우가 있다(실무 교재 사례2):
      //   B·C 둘 다 §104①2호(1~2년) 대상이면서 둘 다 §104⑦3호(3주택) 대상인데,
      //   개별로는 B가 단기 60% 승·C가 중과 승 → `appliedRate`가 갈려 자산별 합으로 떨어졌다.
      //   교재는 "B·C **별도로** 비교하는 것이 아니라 **합산한 금액**에 중과세율을 적용해
      //   단기세율 산출세액과 비교한다"고 명시한다(과소 14,000,000 실측 · 계획서 D-11).
      //
      // `calcTax`의 §104⑦ 후단이 **자기가 받은 과세표준**에 대해 그 MAX를 이미 수행하므로,
      // 합산 1회 경로로 보내면 정답이 나온다(신규 세율 로직 불필요).
      //
      // ⚠️ **호가 다른 경우와 구분**한다 — 1년 미만(3호)+1~2년(2호)이나 ⑦1호+⑦3호 혼재는
      //    단서가 아니라 **본문**(자산별 합)이다. 후자는 R7 감사(2026-07-29)가 고친 결함이다.
      const sameRateClause =
        !perAsset.some(isAssetLevelClause5) &&
        idxList.every((i) => rateClauseKeyOf(i) === rateClauseKeyOf(idxList[0]));
      if (uniformRate || sameRateClause) {
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
      //
      // ❌ **재제안 금지 — 「적용세율이 같으면 자산별 합으로 쪼갠다」** (2026-08-02 P11 오류·되돌림)
      //    §104⑤2호 **본문**의 「자산별」이 곧 **호별 합산**이라고 예규가 못박고 있다:
      //      「"자산별"에서 "자산"의 의미는 동법 **제104조 각 호별로 합산한 자산**을 의미」
      //      — 「기획재정부 재산세제과-536」(2018.6.19.) ·
      //        국세청 「기준-2018-법령해석재산-0098」[법령해석과-1715](생산 2018.6.21.)
      //    즉 같은 호 자산의 과세표준 합산은 **단서가 아니라 본문**이며 **무조건**이다.
      //    단서는 그 위에서 「그 자산이 **둘 이상의 호**에 해당해 적용세율이 둘 이상이면
      //    합산액에 **각 해당 호별** 세율을 적용해 **큰** 산출세액을 취한다」를 정한 것이다
      //    (교재 사례2 = ①2호 + ⑦3호 동시 해당 → D-11/P9가 구현).
      //    ⇒ 아래 `mixedTier`(적용 **호**가 갈리는가)가 정확한 판정이다. 자산별 **적용세율**
      //      동일 여부로 쪼개면 과소과세가 된다. 계획서 §D-13.
      // 2026-08-02 **P12 2단계** — 자산이 아니라 **파트**를 호별로 묶는다(계획서 §4.11).
      //   자산 하나가 둘 이상의 호에 걸치면(토지·건물 분리취득 · 한 필지 중 일부만 비사업용)
      //   §104⑤ 본문·후단이 **각각을 별개 자산으로 의제**하므로 **파트가 곧 합산 단위**다.
      //   종전에는 그런 자산이 있으면 `mixedTier`가 켜져 **그룹 전체**가 자산별 합으로 떨어져
      //   같은 호 다른 자산의 합산까지 끊겼다(§D-7 과소 51,000,000 · §D-12 과소 23,400,000).
      //
      // ⚠️ **이 분기에만 적용한다.** `calcTax`의 `rateClause`는 §104⑦ **후단의 승자 기준**이라
      //   (`transfer-tax-rate-calc.ts:451`) 그대로 그룹 키로 쓰면 「해당 호는 같은데 승자만
      //   갈린」 자산이 나뉘어 **D-11(P9)이 회귀**한다. 그런데 이 분기의 자산은 위
      //   `classifyRateGroup`(:72)이 2년 미만을 전부 `short_term`으로 보내 **2년 이상만**
      //   남으므로 §104⑦ 후단이 발동하지 않는다 ⇒ 승패 오염이 없다.
      //   `short_term` 분기는 손대지 않는다 — D-11(`sameRateClause`)이 거기 있다.
      const perAsset = idxList.map((i) => assetTaxOf(i));
      /** 호별 합산 단위 — 파트가 있으면 그 파트들, 없으면 자산 자체가 파트 1개다. */
      type ClausePart = Pick<SplitRatePart, "taxBase" | "calculatedTax" | "appliedRate"> & {
        rateClause: SplitRatePart["rateClause"];
        rateInput: TransferTaxInput;
        surchargeRate?: number;
      };
      const clauseParts: ClausePart[] = perAsset.flatMap((a, n) =>
        a.parts
          ? a.parts.map((p) => ({
              taxBase: p.taxBase,
              calculatedTax: p.calculatedTax,
              appliedRate: p.appliedRate,
              rateClause: p.rateClause,
              rateInput: p.rateInput,
              surchargeRate: p.surchargeRate,
            }))
          : [
              {
                taxBase: a.taxBase,
                calculatedTax: a.tax,
                appliedRate: a.rate,
                rateClause: a.rateClause,
                rateInput: records[idxList[n]].correctedSingleInput,
                surchargeRate: a.surcharge,
              },
            ],
      );
      // 묶음 키 — `computeSplitPartTax`가 자산 **내부**에서 쓰는 `clauseKey`와 **같은 규약**이다:
      //   · 누진 호(1·8호·⑦1·3호) → 호 단위로 묶는다. 합산하면 누진 구간·누진공제가 달라진다.
      //   · 단일세율 호(2·3·10호) → **`호|세율`**로 묶는다. 세율이 같아야 합산 1회가 성립하고,
      //     그때 자산별 합과의 차이는 floor 횟수뿐이라 **종전 규약을 그대로 유지**한다.
      //   · 호 불명(`undefined`)   → 묶지 않는다(안전측).
      const clauseGroups = new Map<string, ClausePart[]>();
      clauseParts.forEach((p, i) => {
        const c = p.rateClause;
        const k = !c
          ? `solo-${i}`
          : PROGRESSIVE_RATE_CLAUSES.has(c)
            ? c
            : `${c}|${p.appliedRate}`;
        clauseGroups.set(k, [...(clauseGroups.get(k) ?? []), p]);
      });
      groupCalculatedTax = 0;
      for (const bucket of clauseGroups.values()) {
        if (bucket.length === 1) {
          groupCalculatedTax += bucket[0].calculatedTax;
          continue;
        }
        // 같은 호 → 과세표준을 **합산해 1회** 계산한다(§104⑤2호 본문 · 예규 §1.6-A).
        // 대표 파트의 `rateInput`을 쓴다 — 같은 호라 세율 규칙이 같고, 재구성하면 dual-truth다.
        const mergedBase = bucket.reduce((sum, p) => sum + p.taxBase, 0);
        groupCalculatedTax += calcTax(
          mergedBase,
          parsedRates,
          bucket[0].rateInput,
        ).calculatedTax;
      }
      appliedRate = Math.max(...clauseParts.map((p) => p.appliedRate)); // 표시용 최고세율
      surchargeRate = Math.max(...clauseParts.map((p) => p.surchargeRate ?? 0));
      // 호마다 누진공제가 달라 그룹 단위로 합산 표시할 수 없다(묶음이 하나일 때도 규약 통일).
      progressiveDeduction = 0;
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

  return { groupTaxes: out, assetPartTax };
}

// ============================================================
// M-6: 전체 누진세율 (방법 A)
// ============================================================

export function applyGeneralProgressive(taxBase: number, rates: TaxRatesMap): number {
  if (taxBase <= 0) return 0;
  const { brackets } = parseRatesFromMap(rates);
  return calculateProgressiveTax(taxBase, brackets);
}
