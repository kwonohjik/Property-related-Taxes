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
  parseRatesFromMap,
  type TransferTaxInput,
  type CalculationStep,
} from "./transfer-tax";
import { TRANSFER } from "./legal-codes";
import { applyRate, safeMultiplyThenDivide } from "./tax-utils";
import {
  applyAnnualLimits,
  applyFiveYearLimits,
  lookupLimit,
} from "./aggregate-reduction-limits";
import {
  validateInput,
  classifyRateGroup,
  offsetLosses,
  allocateBasicDeduction,
  aggregateByGroup,
  applyGeneralProgressive,
} from "./transfer-tax-aggregate-helpers";

export { classifyRateGroup };

/** 감면 유형별 주 법령 조문 매핑 (한도 조문과 별개) */
function resolveTypeLegalBasis(type: string): string {
  switch (type) {
    case "self_farming":
      return TRANSFER.REDUCTION_SELF_FARMING;
    case "self_farming_inherited":
      return `${TRANSFER.REDUCTION_SELF_FARMING} + ${TRANSFER.REDUCTION_SELF_FARMING_INHERITED}`;
    case "self_farming_incorp":
      return `${TRANSFER.REDUCTION_SELF_FARMING} + ${TRANSFER.REDUCTION_SELF_FARMING_INCORP}`;
    case "public_expropriation":
      return TRANSFER.REDUCTION_PUBLIC_EXPROPRIATION;
    case "long_term_rental":
      return TRANSFER.REDUCTION_LONG_RENTAL;
    case "new_housing":
      return TRANSFER.REDUCTION_NEW_HOUSING;
    case "unsold_housing":
      return TRANSFER.REDUCTION_UNSOLD_HOUSING;
    default:
      return TRANSFER.REDUCTION_OVERLAP_EXCLUSION;
  }
}
import type { TaxRatesMap } from "@/lib/db/tax-rates";
// transfer-tax-penalty 직접 호출 없음 — 자산별 가산세는 단건 엔진이 처리, aggregate는 합산만 수행.

// ============================================================
// 타입 — ./types/transfer-aggregate.types 로 분리 (800줄 정책)
// 기존 소비자들을 위해 본체 파일에서 재수출한다.
// ============================================================

import type {
  RateGroup,
  TransferTaxItemInput,
  AggregateTransferInput,
  PerPropertyBreakdown,
  ReductionBreakdownEntry,
  GroupTaxResult,
  LossOffsetRow,
  AggregateTransferResult,
} from "./types/transfer-aggregate.types";

export type {
  RateGroup,
  TransferTaxItemInput,
  AggregateTransferInput,
  PerPropertyBreakdown,
  ReductionBreakdownEntry,
  GroupTaxResult,
  LossOffsetRow,
  AggregateTransferResult,
};

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

  // M-8: 감면 합산 — 유형별 비율 재계산 (조특법 §69 + §127의2 + §133)
  // 1) 각 자산이 노출한 reducibleIncome을 유형별로 집계
  // 2) 합산 과세표준 기준으로 `safeMultiplyThenDivide(calculatedTax, 유형별 reducibleIncome, taxBase)` 재계산
  // 3) §133 유형별 연간 한도 적용 (자경·축산·어업 1억원 그룹 / 공익수용 2억원 단독 등)
  // 4) 유형이 없는 레거시 감면은 건별 단순 합산으로 폴백
  //
  // 분모 주의: 반드시 aggregate taxBase(차손 통산 + 기본공제 반영)여야 한다.
  // 합산양도소득금액이나 각 건별 taxBase를 쓰면 과대감면이 발생한다.
  const aggregateTaxBase = Math.max(0, totalIncomeAfterOffset - totalBasicDeduction);
  const reducibleByType = new Map<string, { income: number; assetIds: string[] }>();
  for (const r of assetRecords) {
    if (r.result.isExempt) continue;
    const type = r.result.reductionTypeApplied;
    const income = r.result.reducibleIncome ?? 0;
    if (!type || income <= 0) continue;
    const existing = reducibleByType.get(type) ?? { income: 0, assetIds: [] };
    existing.income += income;
    existing.assetIds.push(r.item.propertyId);
    reducibleByType.set(type, existing);
  }

  // 조특법 §133 유형별 연간 한도 — `aggregate-reduction-limits.ts` 모듈 사용.
  // 유형별 원시 감면세액을 계산한 뒤 그룹 단위로 capping.
  const rawByType = new Map<string, number>();
  for (const [type, entry] of reducibleByType.entries()) {
    const raw =
      aggregateTaxBase > 0
        ? safeMultiplyThenDivide(calculatedTax, entry.income, aggregateTaxBase)
        : 0;
    rawByType.set(type, raw);
  }
  const { cappedByType: annuallyCapped, capInfoByType } = applyAnnualLimits(rawByType);

  // §133 5년 누적 한도 추가 capping
  const transferYear = input.taxYear;
  const { fiveYearCappedByType, fiveYearCapInfoByType } = applyFiveYearLimits(
    annuallyCapped,
    input.priorReductionUsage ?? [],
    transferYear,
  );
  const cappedByType = fiveYearCappedByType;

  const reductionBreakdown: ReductionBreakdownEntry[] = [];
  let totalAggregatedReduction = 0;
  for (const [type, entry] of reducibleByType.entries()) {
    const raw = rawByType.get(type) ?? 0;
    const capped = cappedByType.get(type) ?? 0;
    const info = capInfoByType.get(type);
    const fiveInfo = fiveYearCapInfoByType.get(type);
    const annualLimit =
      info && Number.isFinite(info.annualLimit) ? info.annualLimit : 0;
    const annuallyCappedReduction = annuallyCapped.get(type) ?? capped;
    const fiveYearLimitVal =
      fiveInfo && Number.isFinite(fiveInfo.fiveYearLimit) ? fiveInfo.fiveYearLimit : 0;
    reductionBreakdown.push({
      type,
      legalBasis: info?.legalBasis
        ? `${lookupLimit(type).groupTypes.length > 0 ? resolveTypeLegalBasis(type) : TRANSFER.REDUCTION_OVERLAP_EXCLUSION} + ${info.legalBasis}`
        : resolveTypeLegalBasis(type),
      totalReducibleIncome: entry.income,
      aggregateTaxBase,
      aggregateCalculatedTax: calculatedTax,
      rawAggregateReduction: raw,
      annualLimit,
      annuallyCappedReduction,
      cappedAggregateReduction: capped,
      cappedByLimit: info?.cappedByLimit ?? false,
      fiveYearLimit: fiveYearLimitVal,
      priorGroupSum: fiveInfo?.priorGroupSum ?? 0,
      fiveYearRemaining: fiveInfo && Number.isFinite(fiveInfo.remaining) ? fiveInfo.remaining : 0,
      cappedByFiveYearLimit: fiveInfo?.cappedByFiveYear ?? false,
      assetIds: entry.assetIds,
    });
    totalAggregatedReduction += capped;
  }

  // 유형이 지정되지 않은 감면(reducibleIncome 미노출 레거시 경로)은 건별 단순 합산
  const legacyReductionAmount = assetRecords.reduce((s, r) => {
    if (r.result.isExempt) return s;
    if (r.result.reductionTypeApplied) return s; // 재계산 경로에서 이미 처리
    return s + (r.result.reductionAmount ?? 0);
  }, 0);

  const reductionAmount = Math.min(
    calculatedTax,
    totalAggregatedReduction + legacyReductionAmount,
  );

  // 세율군 혼재 시 경고 (PDF 사례 범위 외)
  if (comparedTaxApplied === "groups" && reducibleByType.size > 0) {
    warnings.push(
      "비교과세가 세율군별로 적용된 상황에서 감면 재계산은 전체 산출세액 기준으로 이루어졌습니다. 세율군 혼재 시 정확한 안분은 별도 로직이 필요합니다.",
    );
  }

  steps.push({
    label: "감면세액 (합산 재계산)",
    formula:
      reducibleByType.size > 0
        ? `유형별 재계산: ${[...reducibleByType.keys()].join(", ")} | 원시 ${(totalAggregatedReduction === 0 ? "0" : totalAggregatedReduction.toLocaleString())}원 + 레거시 ${legacyReductionAmount.toLocaleString()}원`
        : `건별 단순합 ${legacyReductionAmount.toLocaleString()}원 (유형 미지정 감면만 존재)`,
    amount: reductionAmount,
    legalBasis: TRANSFER.REDUCTION_ANNUAL_LIMIT,
  });

  const determinedTaxBeforePenalty = Math.max(0, calculatedTax - reductionAmount);

  // M-9: 가산세 — 자산별 §114의2 + 자산별 신고불성실/납부지연 합산
  const perAssetBuildingPenalty = assetRecords.reduce(
    (s, r) => s + (r.result.isExempt ? 0 : r.result.penaltyTax ?? 0),
    0,
  );
  const perAssetFilingDelayedPenalty = assetRecords.reduce(
    (s, r) => s + (r.result.isExempt ? 0 : r.result.penaltyDetail?.totalPenalty ?? 0),
    0,
  );
  const penaltyTax = perAssetBuildingPenalty + perAssetFilingDelayedPenalty;

  // M-10: 지방소득세 (원 미만 절사 — 지방세법 §103의3)
  const localIncomeTax = applyRate(determinedTaxBeforePenalty + penaltyTax, 0.1);
  const totalTax = determinedTaxBeforePenalty + penaltyTax + localIncomeTax;

  steps.push({
    label: "총 납부세액",
    formula: `결정세액 ${determinedTaxBeforePenalty.toLocaleString()}원 + 가산세 ${penaltyTax.toLocaleString()}원 + 지방소득세 ${localIncomeTax.toLocaleString()}원`,
    amount: totalTax,
  });

  // properties breakdown 조립 — 합산 재계산 후 건별 배분액 포함
  const properties: PerPropertyBreakdown[] = assetRecords.map((r, idx) => {
    const reductionType = r.result.reductionTypeApplied;
    const reducibleIncome = r.result.isExempt ? 0 : r.result.reducibleIncome ?? 0;
    const standalone = r.result.isExempt ? 0 : r.result.reductionAmount ?? 0;

    // 유형별 재계산 엔트리가 있으면 비율 배분, 없으면 단독값 그대로
    let reductionAggregated = standalone;
    let reductionAllocationRatio = 0;
    if (reductionType && reducibleIncome > 0) {
      const entry = reductionBreakdown.find((b) => b.type === reductionType);
      if (entry && entry.totalReducibleIncome > 0) {
        reductionAllocationRatio = reducibleIncome / entry.totalReducibleIncome;
        // 최종 capped 감면액을 reducibleIncome 비율로 자산에 배분 (원 미만 절사)
        reductionAggregated = Math.floor(
          entry.cappedAggregateReduction * reductionAllocationRatio,
        );
      }
    }

    // 실제 적용 취득가액 (환산 시 재산식), 필요경비는 §97 개산공제 포함 역산
    const tsfStd = r.singleInput.standardPriceAtTransfer ?? 0;
    const effectiveAcquisitionPrice = r.result.usedEstimatedAcquisition
      ? (tsfStd > 0
          ? Math.floor((r.singleInput.transferPrice * (r.singleInput.standardPriceAtAcquisition ?? 0)) / tsfStd)
          : 0)
      : r.singleInput.acquisitionPrice;
    const effectiveNecessaryExpense = r.result.isExempt
      ? 0
      : r.singleInput.transferPrice - effectiveAcquisitionPrice - r.result.transferGain;

    // 다건 컨텍스트 자산별 산출세액·결정세액 (참고).
    // 단건 엔진은 skipBasicDeduction=true로 호출되어 r.result.determinedTax는 양도소득금액 기준 부정확.
    // taxBaseShare(= incomeAfterOffset - allocatedBasic) 기준으로 다건 컨텍스트에서 재계산해 노출한다.
    const taxBaseShare = Math.max(0, incomeAfterOffset[idx] - allocatedBasic[idx]);
    const effectiveRate = r.result.appliedRate + (r.result.surchargeRate ?? 0);
    const refCalculatedTax = r.result.isExempt
      ? 0
      : Math.max(0, Math.floor(taxBaseShare * effectiveRate) - r.result.progressiveDeduction);
    const refDeterminedTax = Math.max(0, refCalculatedTax - standalone);

    return {
      propertyId: r.item.propertyId,
      propertyLabel: r.item.propertyLabel,
      isExempt: r.result.isExempt,
      exemptReason: r.result.exemptReason,
      transferPrice: r.singleInput.transferPrice,
      acquisitionPrice: effectiveAcquisitionPrice,
      necessaryExpense: effectiveNecessaryExpense,
      determinedTax: r.result.determinedTax,
      transferGain: r.result.transferGain,
      longTermHoldingDeduction: r.lthd,
      income: r.income,
      rateGroup: r.rateGroup,
      lossOffsetFromSameGroup: lossOffsetFromSame[idx],
      lossOffsetFromOtherGroup: lossOffsetFromOther[idx],
      incomeAfterOffset: incomeAfterOffset[idx],
      allocatedBasicDeduction: allocatedBasic[idx],
      taxBaseShare,
      appliedRate: r.result.appliedRate,
      progressiveDeduction: r.result.progressiveDeduction,
      surchargeRate: r.result.surchargeRate,
      refCalculatedTax,
      refDeterminedTax,
      reductionAmount: standalone,
      reductionType,
      reducibleIncome,
      reductionAggregated,
      reductionAllocationRatio,
      penaltyTax: r.result.isExempt ? 0 : r.result.penaltyTax ?? 0,
      filingDelayedPenaltyTax: r.result.isExempt ? 0 : r.result.penaltyDetail?.totalPenalty ?? 0,
      penaltyDetail: r.result.penaltyDetail,
      steps: r.result.steps,
    };
  });

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
    reductionBreakdown,
    determinedTax: determinedTaxBeforePenalty,
    penaltyTax,
    // 가산세 상세는 자산별로 properties[i].penaltyDetail 에서 노출.
    localIncomeTax,
    totalTax,
    steps,
    warnings,
  };
}

// 헬퍼 영역(M-0 검증 / M-2 세율군 / M-3 차손통산 / M-4 기본공제 / M-5 그룹집계 / M-6 누진)은
// `transfer-tax-aggregate-helpers.ts` 로 분리되었다 (800줄 정책 준수).

// 위 헬퍼들은 헬퍼 파일로 이동.

