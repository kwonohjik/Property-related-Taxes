/**
 * 양도소득세 다건 동시 양도 엔진 (Layer 2 — Orchestrator on Orchestrator)
 *
 * 동일 과세기간 내 2건 이상 자산을 양도할 때 아래 규정을 반영한다:
 *   - §92              : 양도소득금액 합산 → 통합 과세표준
 *   - §102 ②·시행령 §167의2 : 양도차손 통산 (그룹 내 → 타군 pro-rata 안분, 이월 불인정)
 *   - §103             : 기본공제 연 1회 250만원, 미등기 배제
 *   - §104의2          : 비교과세 MAX(세율군별 분리세액 합, 전체 누진세액)
 *   - 조특법 §127 ②    : 감면 중복배제는 건별 독립 적용 후 합산
 *
 * 순수 함수. DB 직접 호출 없음. 모든 세율 데이터는 rates 매개변수로 주입.
 * 기존 단건 엔진(`calculateTransferTax`)을 건별로 재사용하며, 상위에서 합산·통산·비교과세 수행.
 */

import {
  calculateTransferTax,
  calcTax,
  parseRatesFromMap,
  type TransferTaxInput,
  type TransferTaxResult,
  type CalculationStep,
} from "./transfer-tax";
import { calculateProgressiveTax } from "./tax-utils";
import { TRANSFER } from "./legal-codes";
import { applyRate, truncateToThousand } from "./tax-utils";
import type { TaxRatesMap } from "@/lib/db/tax-rates";
import {
  calculateTransferTaxPenalty,
  type FilingPenaltyInput,
  type DelayedPaymentInput,
  type TransferTaxPenaltyResult,
} from "./transfer-tax-penalty";

// ============================================================
// 타입
// ============================================================

/** 세율군 (소득세법 §102 ① 각 호 구분) */
export type RateGroup =
  | "progressive"              // 일반 누진 6~45% (보유 2년+, 중과·특례 해당 없음)
  | "short_term"               // 단기보유 단일세율 (보유 2년 미만)
  | "multi_house_surcharge"    // 다주택 중과 (+20%p / +30%p)
  | "non_business_land"        // 비사업용 토지 (+10%p)
  | "unregistered";            // 미등기 70% 단일

/** 다건 입력 (건별 + 공통) */
export interface AggregateTransferInput {
  /** 과세기간 (YYYY) */
  taxYear: number;
  /** 건별 양도 자산 목록 (1..20건) */
  properties: TransferTaxItemInput[];
  /** 당해 연도에 이미 사용한 기본공제액 (타 계산 건 포함) */
  annualBasicDeductionUsed: number;
  /** 기본공제 배분 전략 (기본 MAX_BENEFIT) */
  basicDeductionAllocation?: "MAX_BENEFIT" | "FIRST" | "EARLIEST_TRANSFER";
  /** 신고불성실 가산세 (합산 결정세액 기준 계산) */
  filingPenaltyDetails?: FilingPenaltyInput;
  /** 납부지연 가산세 (합산 결정세액 기준 계산) */
  delayedPaymentDetails?: DelayedPaymentInput;
}

/** 자산 단위 입력 — TransferTaxInput에서 공통 필드 제외 + 식별자 추가 */
export type TransferTaxItemInput = Omit<
  TransferTaxInput,
  | "annualBasicDeductionUsed"
  | "filingPenaltyDetails"
  | "delayedPaymentDetails"
  | "skipBasicDeduction"
  | "skipLossFloor"
> & {
  propertyId: string;
  propertyLabel: string;
};

/** 자산별 breakdown */
export interface PerPropertyBreakdown {
  propertyId: string;
  propertyLabel: string;
  isExempt: boolean;
  exemptReason?: string;
  /** 양도차익 (skipLossFloor=true → 음수 가능) */
  transferGain: number;
  /** 장기보유특별공제 */
  longTermHoldingDeduction: number;
  /**
   * 원시 양도소득금액 = taxableGain - longTermHoldingDeduction (음수 가능)
   * §102② 차손 통산의 입력값.
   */
  income: number;
  /** 세율군 */
  rateGroup: RateGroup;
  /** 같은 그룹에서 받은 차손 공제 (양수) */
  lossOffsetFromSameGroup: number;
  /** 타군에서 안분 받은 차손 공제 (양수) */
  lossOffsetFromOtherGroup: number;
  /** 통산 후 소득금액 (≥ 0) */
  incomeAfterOffset: number;
  /** 배분된 기본공제액 */
  allocatedBasicDeduction: number;
  /** 그룹 과세표준 중 본 자산 기여분 */
  taxBaseShare: number;
  /** 건별 감면액 (단건 엔진이 이미 중복배제 적용) */
  reductionAmount: number;
  /** §114조의2 건별 가산세 */
  penaltyTax: number;
  /** 건별 세부 계산 steps (단건 엔진에서 생성) */
  steps: CalculationStep[];
}

/** 세율군별 집계 */
export interface GroupTaxResult {
  group: RateGroup;
  /** 그룹 내 자산 IDs */
  assetIds: string[];
  /** 그룹 차익 합 (양수 자산만) */
  groupGrossGain: number;
  /** 그룹 차손 합 (음수 자산만, 절댓값) */
  groupGrossLoss: number;
  /** 통산 후 그룹 소득금액 (≥ 0) */
  groupIncomeAmount: number;
  /** 그룹 배분 기본공제 */
  groupBasicDeduction: number;
  /** 그룹 과세표준 = max(0, groupIncomeAmount - groupBasicDeduction) */
  groupTaxBase: number;
  /** 그룹 산출세액 */
  groupCalculatedTax: number;
  appliedRate: number;
  surchargeRate?: number;
  progressiveDeduction: number;
}

export interface LossOffsetRow {
  fromPropertyId: string;
  toPropertyId: string;
  amount: number;
  scope: "same_group" | "other_group";
}

export interface AggregateTransferResult {
  properties: PerPropertyBreakdown[];

  totalTransferGain: number;
  totalLongTermHoldingDeduction: number;
  totalIncomeBeforeOffset: number;
  totalLoss: number;

  lossOffsetTable: LossOffsetRow[];
  /** 통산 후에도 남아 소멸된 차손 (이월 불인정) */
  unusedLoss: number;
  totalIncomeAfterOffset: number;

  basicDeduction: number;
  taxBase: number;

  groupTaxes: GroupTaxResult[];

  /** 방법 B: 세율군별 분리 산출세액 합 */
  calculatedTaxByGroups: number;
  /** 방법 A: 전체 누진세율 적용 산출세액 */
  calculatedTaxByGeneral: number;
  /** 비교과세(§104의2) 적용 결과 */
  comparedTaxApplied: "groups" | "general" | "none";
  /** MAX(byGroups, byGeneral) */
  calculatedTax: number;

  /** 건별 감면액 합 */
  reductionAmount: number;
  /** 결정세액 = max(0, calculatedTax - reductionAmount) */
  determinedTax: number;

  /** §114의2 건별 합 + 신고불성실·납부지연 */
  penaltyTax: number;
  penaltyDetail?: TransferTaxPenaltyResult;

  /** 지방소득세 = (결정+가산) × 10%, 천원 절사 */
  localIncomeTax: number;
  totalTax: number;

  steps: CalculationStep[];
  warnings: string[];
}

// ============================================================
// 메인 진입점
// ============================================================

export function calculateTransferTaxAggregate(
  input: AggregateTransferInput,
  rates: TaxRatesMap,
): AggregateTransferResult {
  const warnings: string[] = [];
  const steps: CalculationStep[] = [];

  // M-0: 검증
  validateInput(input);

  // M-1: 건별 단건 엔진 호출 (기본공제 스킵, 차손 허용)
  const perAsset = input.properties.map((item) => {
    const singleInput: TransferTaxInput = {
      ...(item as unknown as TransferTaxInput),
      annualBasicDeductionUsed: 0,
      skipBasicDeduction: true,
      skipLossFloor: true,
    };
    const result = calculateTransferTax(singleInput, rates);
    return { item, singleInput, result };
  });

  // M-2: 세율군 분류
  const classified = perAsset.map((pa) => ({
    ...pa,
    rateGroup: classifyRateGroup(pa.item, pa.result),
  }));

  // 자산별 원시 income 및 세율군 정리
  // 장특공제는 양수 양도차익에만 적용되므로 (소득세법 §95②), 차손 자산은 income = transferGain
  const assetRecords = classified.map((pa) => {
    if (pa.result.isExempt) {
      return { ...pa, taxableGain: 0, lthd: 0, income: 0 };
    }
    const transferGain = pa.result.transferGain;
    if (transferGain < 0) {
      return { ...pa, taxableGain: transferGain, lthd: 0, income: transferGain };
    }
    const taxableGain = pa.result.taxableGain;
    const lthd = pa.result.longTermHoldingDeduction;
    const income = taxableGain - lthd;
    return { ...pa, taxableGain, lthd, income };
  });

  // M-3: §102② 차손 통산
  const {
    lossOffsetTable,
    lossOffsetFromSame,
    lossOffsetFromOther,
    incomeAfterOffset,
    unusedLoss,
  } = offsetLosses(assetRecords);

  steps.push({
    label: "양도차손 통산 (§102② · 시행령 §167의2)",
    formula: `그룹 내 통산 + 타군 pro-rata 안분 (잔여 차손 ${unusedLoss.toLocaleString()}원 소멸, 이월 불인정)`,
    amount: lossOffsetTable.reduce((s, r) => s + r.amount, 0),
    legalBasis: TRANSFER.LOSS_OFFSET,
  });

  // M-4: 기본공제 배분 (미등기·exempt 제외)
  const parsedRates = parseRatesFromMap(rates);
  const annualLimit = parsedRates.basicDeductionRules.annualLimit;
  const availableThisCalc = Math.max(0, annualLimit - input.annualBasicDeductionUsed);

  const eligibleForBasic = assetRecords
    .map((r, idx) => ({ idx, rateGroup: r.rateGroup, income: incomeAfterOffset[idx], isExempt: r.result.isExempt, transferDate: r.item.transferDate }))
    .filter((r) => !r.isExempt && r.rateGroup !== "unregistered" && r.income > 0);

  const allocation = allocateBasicDeduction(
    eligibleForBasic,
    availableThisCalc,
    input.basicDeductionAllocation ?? "MAX_BENEFIT",
  );
  const allocatedBasic: number[] = assetRecords.map(() => 0);
  for (const a of allocation) allocatedBasic[a.idx] = a.amount;
  const totalBasicDeduction = allocatedBasic.reduce((s, v) => s + v, 0);

  steps.push({
    label: "기본공제",
    formula: `연 한도 ${annualLimit.toLocaleString()}원 - 기사용 ${input.annualBasicDeductionUsed.toLocaleString()}원 = ${totalBasicDeduction.toLocaleString()}원 (${input.basicDeductionAllocation ?? "MAX_BENEFIT"} 배분)`,
    amount: totalBasicDeduction,
    legalBasis: TRANSFER.BASIC_DEDUCTION,
  });

  // M-5·M-6: 세율군별 집계 + 세율 적용
  const groupTaxes = aggregateByGroup(
    assetRecords,
    incomeAfterOffset,
    allocatedBasic,
    rates,
  );
  const calculatedTaxByGroups = groupTaxes.reduce((s, g) => s + g.groupCalculatedTax, 0);

  // M-6: 전체 누진세율 (방법 A)
  const totalIncomeAfterOffset = incomeAfterOffset.reduce((s, v) => s + v, 0);
  const generalTaxBase = Math.max(0, totalIncomeAfterOffset - totalBasicDeduction);
  const calculatedTaxByGeneral = applyGeneralProgressive(generalTaxBase, rates);

  // M-7: 비교과세 (§104의2)
  const hasSurchargeGroup = groupTaxes.some((g) =>
    g.group === "multi_house_surcharge" ||
    g.group === "non_business_land" ||
    g.group === "unregistered" ||
    g.group === "short_term",
  );
  let calculatedTax: number;
  let comparedTaxApplied: "groups" | "general" | "none";
  if (!hasSurchargeGroup) {
    calculatedTax = calculatedTaxByGroups;
    comparedTaxApplied = "none";
  } else {
    if (calculatedTaxByGeneral > calculatedTaxByGroups) {
      calculatedTax = calculatedTaxByGeneral;
      comparedTaxApplied = "general";
    } else {
      calculatedTax = calculatedTaxByGroups;
      comparedTaxApplied = "groups";
    }
  }

  steps.push({
    label: "비교과세 (§104의2)",
    formula: `세율군별 ${calculatedTaxByGroups.toLocaleString()}원 vs 전체누진 ${calculatedTaxByGeneral.toLocaleString()}원 → ${comparedTaxApplied === "none" ? "비교 불필요 (중과·단기 없음)" : `MAX = ${calculatedTax.toLocaleString()}원 (${comparedTaxApplied === "groups" ? "세율군별" : "전체누진"})`}`,
    amount: calculatedTax,
    legalBasis: TRANSFER.COMPARATIVE_TAXATION,
  });

  // M-8: 감면 합산 (건별 독립 계산 결과 합)
  const reductionAmount = assetRecords.reduce(
    (s, r) => s + (r.result.isExempt ? 0 : r.result.reductionAmount ?? 0),
    0,
  );
  const determinedTaxBeforePenalty = Math.max(0, calculatedTax - reductionAmount);

  // M-9: 가산세 (§114의2 건별 합 + 신고·납부)
  const perAssetBuildingPenalty = assetRecords.reduce(
    (s, r) => s + (r.result.isExempt ? 0 : r.result.penaltyTax ?? 0),
    0,
  );
  let penaltyTax = perAssetBuildingPenalty;
  let penaltyDetail: TransferTaxPenaltyResult | undefined;
  if (input.filingPenaltyDetails || input.delayedPaymentDetails) {
    penaltyDetail = calculateTransferTaxPenalty({
      filing: input.filingPenaltyDetails,
      delayedPayment: input.delayedPaymentDetails,
    });
    penaltyTax += penaltyDetail.totalPenalty;
  }

  // M-10: 지방소득세 (원 미만 절사 — 지방세법 §103의3)
  const localIncomeTax = applyRate(determinedTaxBeforePenalty + penaltyTax, 0.1);
  const totalTax = determinedTaxBeforePenalty + penaltyTax + localIncomeTax;

  steps.push({
    label: "총 납부세액",
    formula: `결정세액 ${determinedTaxBeforePenalty.toLocaleString()}원 + 가산세 ${penaltyTax.toLocaleString()}원 + 지방소득세 ${localIncomeTax.toLocaleString()}원`,
    amount: totalTax,
  });

  // properties breakdown 조립
  const properties: PerPropertyBreakdown[] = assetRecords.map((r, idx) => ({
    propertyId: r.item.propertyId,
    propertyLabel: r.item.propertyLabel,
    isExempt: r.result.isExempt,
    exemptReason: r.result.exemptReason,
    transferGain: r.result.transferGain,
    longTermHoldingDeduction: r.lthd,
    income: r.income,
    rateGroup: r.rateGroup,
    lossOffsetFromSameGroup: lossOffsetFromSame[idx],
    lossOffsetFromOtherGroup: lossOffsetFromOther[idx],
    incomeAfterOffset: incomeAfterOffset[idx],
    allocatedBasicDeduction: allocatedBasic[idx],
    taxBaseShare: Math.max(0, incomeAfterOffset[idx] - allocatedBasic[idx]),
    reductionAmount: r.result.isExempt ? 0 : r.result.reductionAmount ?? 0,
    penaltyTax: r.result.isExempt ? 0 : r.result.penaltyTax ?? 0,
    steps: r.result.steps,
  }));

  return {
    properties,
    totalTransferGain: assetRecords.reduce((s, r) => s + r.result.transferGain, 0),
    totalLongTermHoldingDeduction: assetRecords.reduce((s, r) => s + r.lthd, 0),
    totalIncomeBeforeOffset: assetRecords.reduce((s, r) => s + r.income, 0),
    totalLoss: assetRecords
      .filter((r) => r.income < 0)
      .reduce((s, r) => s + Math.abs(r.income), 0),
    lossOffsetTable,
    unusedLoss,
    totalIncomeAfterOffset,
    basicDeduction: totalBasicDeduction,
    taxBase: groupTaxes.reduce((s, g) => s + g.groupTaxBase, 0),
    groupTaxes,
    calculatedTaxByGroups,
    calculatedTaxByGeneral,
    comparedTaxApplied,
    calculatedTax,
    reductionAmount,
    determinedTax: determinedTaxBeforePenalty,
    penaltyTax,
    penaltyDetail,
    localIncomeTax,
    totalTax,
    steps,
    warnings,
  };
}

// ============================================================
// M-0: 검증
// ============================================================

function validateInput(input: AggregateTransferInput): void {
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
  // 1) 미등기
  if (item.isUnregistered) return "unregistered";

  // 2) 단기보유 — 단건 엔진이 calcTax에서 단기 세율을 적용한 경우 shortTermNote/appliedRate로 판별
  //    여기서는 보유기간 기준 재판정 (단건 엔진과 동일한 분기)
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

  // 3) 비사업용 토지
  if (result.surchargeType === "non_business_land" || item.isNonBusinessLand) return "non_business_land";

  // 4) 다주택 중과 (유예 미해당)
  // 차손 자산(transferGain≤0)은 단건 엔진이 조기 반환하여 surchargeType 미설정 → item 입력으로 보완
  const multiHouseByResult =
    result.surchargeType === "multi_house_2" || result.surchargeType === "multi_house_3plus";
  const multiHouseByInput =
    isHousingLike &&
    item.isRegulatedArea &&
    item.householdHousingCount >= 2;
  if ((multiHouseByResult || multiHouseByInput) && !result.isSurchargeSuspended) {
    return "multi_house_surcharge";
  }

  // 5) 일반 누진
  return "progressive";
}

function monthsBetween(from: Date, to: Date): number {
  const y = to.getFullYear() - from.getFullYear();
  const m = to.getMonth() - from.getMonth();
  const d = to.getDate() - from.getDate();
  return y * 12 + m - (d < 0 ? 1 : 0);
}

// ============================================================
// M-3: 차손 통산 (§102② · 시행령 §167의2)
// ============================================================

interface AssetRecord {
  item: TransferTaxItemInput;
  singleInput: TransferTaxInput;
  result: TransferTaxResult;
  rateGroup: RateGroup;
  taxableGain: number;
  lthd: number;
  income: number;
}

interface LossOffsetOutput {
  lossOffsetTable: LossOffsetRow[];
  lossOffsetFromSame: number[];
  lossOffsetFromOther: number[];
  incomeAfterOffset: number[];
  unusedLoss: number;
}

function offsetLosses(records: AssetRecord[]): LossOffsetOutput {
  const n = records.length;
  const fromSame: number[] = new Array(n).fill(0);
  const fromOther: number[] = new Array(n).fill(0);
  const table: LossOffsetRow[] = [];

  // 그룹별 인덱스 집계
  const byGroup = new Map<RateGroup, number[]>();
  records.forEach((r, i) => {
    if (r.result.isExempt) return;
    const list = byGroup.get(r.rateGroup) ?? [];
    list.push(i);
    byGroup.set(r.rateGroup, list);
  });

  // Step 1: 그룹별 same-group 통산
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
          // 차손 자산별 기록 (pro-rata)
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

  // Step 2: 타군 pro-rata 안분 (시행령 §167의2)
  const totalRemainingLoss = [...remainingLossByGroup.values()].reduce((s, v) => s + v, 0);
  const totalRemainingGain = remainingGainByAsset.reduce((s, v) => s + v, 0);
  const offsetPool2 = Math.min(totalRemainingLoss, totalRemainingGain);

  if (offsetPool2 > 0 && totalRemainingGain > 0) {
    // 차손 그룹별 분담 (remainingLossByGroup)
    const lossGroups = [...remainingLossByGroup.entries()].filter(([, v]) => v > 0);

    // 차익 자산들에 안분 (자산 단위 pro-rata)
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
        // 차손 자산별 pro-rata 기록
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
            // 그룹 내 차손 자산들에 분배
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

  // Step 4: 자산별 incomeAfterOffset
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

function allocateBasicDeduction(
  eligible: { idx: number; rateGroup: RateGroup; income: number; transferDate: Date }[],
  available: number,
  strategy: "MAX_BENEFIT" | "FIRST" | "EARLIEST_TRANSFER",
): { idx: number; amount: number }[] {
  if (available <= 0 || eligible.length === 0) return [];

  // 우선순위 정렬
  let sorted: typeof eligible;
  if (strategy === "FIRST") {
    sorted = [...eligible].sort((a, b) => a.transferDate.getTime() - b.transferDate.getTime());
  } else if (strategy === "EARLIEST_TRANSFER") {
    sorted = [...eligible].sort((a, b) => a.transferDate.getTime() - b.transferDate.getTime());
  } else {
    // MAX_BENEFIT: 그룹 우선순위 + 소득금액 내림차순
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

function aggregateByGroup(
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

    // 대표 자산으로 calcTax 호출
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

function applyGeneralProgressive(taxBase: number, rates: TaxRatesMap): number {
  if (taxBase <= 0) return 0;
  const { brackets } = parseRatesFromMap(rates);
  // 중과·단기 없이 순수 누진세율만 적용 (§104의2 방법 A)
  return calculateProgressiveTax(taxBase, brackets);
}
