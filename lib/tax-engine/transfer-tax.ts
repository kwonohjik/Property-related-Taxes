/**
 * 양도소득세 순수 계산 엔진
 *
 * Layer 2 (Pure Engine): DB 직접 호출 없음.
 * 모든 세율 데이터는 TaxRatesMap으로 주입받아 순수 함수로 계산.
 *
 * P0-2 원칙: 세율 × 금액 곱셈은 반드시 applyRate() 사용.
 */

import { addYears } from "date-fns";
import { TRANSFER, NBL } from "./legal-codes";
import {
  applyRate,
  calculateEstimatedAcquisitionPrice,
  calculateHoldingPeriod,
  calculateProgressiveTax,
  calculateProration,
  isSurchargeSuspended,
  truncateToWon,
} from "./tax-utils";
import { TaxRateNotFoundError } from "./tax-errors";
import {
  parseDeductionRules,
  parseProgressiveRate,
  parseSurchargeRate,
  parseHouseCountExclusion,
  parseRegulatedAreaHistory,
  parseNonBusinessLandJudgment,
  type DeductionRulesData,
  type OneHouseSpecialRulesData,
  type SurchargeRateData,
  type SurchargeSpecialRulesData,
  type HouseCountExclusionData,
  type RegulatedAreaHistoryData,
  type NonBusinessLandJudgmentSchemaData,
} from "./schemas/rate-table.schema";
import {
  type HouseInfo,
  type PresaleRight,
  type MultiHouseSurchargeInput,
  type MultiHouseSurchargeResult,
  type ExcludedHouse,
  type ExclusionReason,
  determineMultiHouseSurcharge,
} from "./multi-house-surcharge";
import {
  type NonBusinessLandInput,
  type NonBusinessLandJudgment,
  judgeNonBusinessLand,
} from "./non-business-land";
import {
  type RentalReductionInput,
  type RentalReductionResult,
  calculateRentalReduction,
  getLongTermDeductionOverride,
} from "./rental-housing-reduction";
import {
  type NewHousingReductionInput,
  type NewHousingReductionResult,
  determineNewHousingReduction,
} from "./new-housing-reduction";
import {
  type FilingPenaltyInput,
  type DelayedPaymentInput,
  type TransferTaxPenaltyResult,
  calculateTransferTaxPenalty,
} from "./transfer-tax-penalty";
import {
  type Pre1990LandValuationInput,
  type Pre1990LandValuationResult,
  calculatePre1990LandValuation,
} from "./pre-1990-land-valuation";
import {
  type PublicExpropriationReductionResult,
  calculatePublicExpropriationReduction,
} from "./public-expropriation-reduction";
import {
  parseLongTermRentalRuleSet,
  parseNewHousingMatrix,
  type LongTermRentalRuleSet,
  type NewHousingMatrixData,
} from "./schemas/rate-table.schema";
import { getRate } from "@/lib/db/tax-rates";
import type { TaxBracket } from "./types";
import type { TaxRatesMap } from "@/lib/db/tax-rates";
import {
  type ParcelInput,
  type ParcelResult,
  calculateMultiParcelTransfer,
} from "./multi-parcel-transfer";

// ============================================================
// 1-A. 타입 정의 — 공개 타입은 ./types/transfer.types 로 분리
// ============================================================

import type {
  TransferTaxInput,
  TransferReduction,
  CalculationStep,
  TransferTaxResult,
} from "./types/transfer.types";

// 하위 호환: "./transfer-tax"에서 직접 타입을 import하던 기존 소비자들을 위해 재수출한다.
export type {
  TransferTaxInput,
  TransferReduction,
  CalculationStep,
  TransferTaxResult,
};


// ============================================================
// 내부 헬퍼 함수 — ./transfer-tax-helpers 로 분리
// ============================================================

import {
  parseRatesFromMap,
  checkExemption,
  calcTransferGain,
  calcOneHouseProration,
  calcLongTermHoldingDeduction,
  calcBasicDeduction,
} from "./transfer-tax-helpers";

import {
  calculateBuildingPenalty,
  calcTax,
  calcReductions,
} from "./transfer-tax-rate-calc";

// 하위 호환: transfer-tax-aggregate 등 외부 소비자를 위해 일부 헬퍼를 재수출
export { parseRatesFromMap } from "./transfer-tax-helpers";
export { calcTax } from "./transfer-tax-rate-calc";


// ============================================================
// 메인 함수: calculateTransferTax (1-G)
// ============================================================

export function calculateTransferTax(
  rawInput: TransferTaxInput,
  rates: TaxRatesMap,
): TransferTaxResult {
  const steps: CalculationStep[] = [];

  // STEP 0: 세율 파싱
  const parsedRates = parseRatesFromMap(rates);

  // STEP 0.4: 1990.8.30. 이전 취득 토지 기준시가 환산 (pre1990Land 제공 시)
  // - 환산취득가 자동 활성화 + standardPriceAtAcquisition/Transfer 주입
  // - acquisitionPrice=0, acquisitionMethod="estimated" 강제
  // 이후 모든 다운스트림 로직이 이 조정된 입력값을 사용하도록 `input`으로 재바인딩.
  let pre1990LandResult: Pre1990LandValuationResult | undefined;
  let input: TransferTaxInput = rawInput;
  if (rawInput.pre1990Land) {
    pre1990LandResult = calculatePre1990LandValuation(rawInput.pre1990Land);
    input = {
      ...rawInput,
      acquisitionPrice: 0,
      useEstimatedAcquisition: true,
      standardPriceAtAcquisition: pre1990LandResult.standardPriceAtAcquisition,
      standardPriceAtTransfer: pre1990LandResult.standardPriceAtTransfer,
      acquisitionMethod: "estimated",
    };
    steps.push({
      label: "1990.8.30. 이전 취득 토지 기준시가 환산",
      formula: pre1990LandResult.breakdown.formula,
      amount: pre1990LandResult.standardPriceAtAcquisition,
      legalBasis: pre1990LandResult.breakdown.legalBasis,
    });
    steps.push({
      label: pre1990LandResult.caseLabel,
      formula:
        `취득기준시가 = ${pre1990LandResult.pricePerSqmAtAcquisition.toLocaleString()}원/㎡ × ` +
        `${rawInput.pre1990Land.areaSqm.toLocaleString()}㎡ = ` +
        `${pre1990LandResult.standardPriceAtAcquisition.toLocaleString()}원`,
      amount: pre1990LandResult.standardPriceAtAcquisition,
      sub: true,
    });
  }

  // 이 지점 이후 로컬 input/workingInput은 동일 (pre-1990 적용 완료).
  const workingInput = input;

  // STEP 0.5: 다주택 중과세 판정 (houses[] 제공 + 주택 수 산정 규칙 로드 완료 시)
  let multiHouseSurchargeResult: MultiHouseSurchargeResult | undefined;
  if (workingInput.houses && workingInput.houses.length > 0 && parsedRates.houseCountExclusionRules) {
    const mhInput: MultiHouseSurchargeInput = {
      houses: workingInput.houses,
      sellingHouseId: workingInput.sellingHouseId ?? workingInput.houses[0].id,
      transferDate: workingInput.transferDate,
      isOneHousehold: workingInput.isOneHousehold,
      temporaryTwoHouse: workingInput.multiHouseTemporaryTwoHouse,
      marriageMerge: workingInput.marriageMerge,
      parentalCareMerge: workingInput.parentalCareMerge,
      presaleRights: workingInput.presaleRights ?? [],
    };
    multiHouseSurchargeResult = determineMultiHouseSurcharge(
      mhInput,
      parsedRates.houseCountExclusionRules,
      parsedRates.regulatedAreaHistory ?? null,
      parsedRates.surchargeSpecialRules,
      workingInput.isRegulatedArea,
    );
  }

  // STEP 0.6: 비사업용 토지 정밀 판정 (nonBusinessLandDetails 제공 시)
  let nonBusinessLandJudgment: NonBusinessLandJudgment | undefined;
  // input은 readonly이므로 isNonBusinessLand override를 위한 mutable 복사본 사용
  let effectiveInput = workingInput;
  if (workingInput.nonBusinessLandDetails) {
    nonBusinessLandJudgment = judgeNonBusinessLand(
      workingInput.nonBusinessLandDetails,
      parsedRates.nonBusinessLandJudgmentRules,
    );
    // [I5 수정] 판정 결과로 isNonBusinessLand 덮어씀 — 입력 플래그와 다를 때 step 경고 기록
    if (nonBusinessLandJudgment.isNonBusinessLand !== workingInput.isNonBusinessLand) {
      effectiveInput = { ...workingInput, isNonBusinessLand: nonBusinessLandJudgment.isNonBusinessLand };
      steps.push({
        label: "비사업용 토지 판정 (엔진 재판정)",
        formula: `입력 플래그(${workingInput.isNonBusinessLand ? "비사업용" : "사업용"}) → 정밀 판정 결과: ${nonBusinessLandJudgment.isNonBusinessLand ? "비사업용" : "사업용"}`,
        amount: 0,
        legalBasis: NBL.MAIN,
      });
    }
  }

  // STEP 1: 비과세 판단
  const exemptionResult = checkExemption(effectiveInput, parsedRates.oneHouseSpecialRules);

  // STEP 1a: 전액 비과세 시 조기 반환
  if (exemptionResult.isExempt) {
    steps.push({
      label: "1세대1주택 비과세",
      formula: exemptionResult.exemptReason ?? "비과세",
      amount: 0,
      legalBasis: TRANSFER.ONE_HOUSE_EXEMPT,
    });
    return {
      isExempt: true,
      exemptReason: exemptionResult.exemptReason,
      transferGain: 0,
      taxableGain: 0,
      usedEstimatedAcquisition: effectiveInput.useEstimatedAcquisition,
      longTermHoldingDeduction: 0,
      longTermHoldingRate: 0,
      basicDeduction: 0,
      taxBase: 0,
      appliedRate: 0,
      progressiveDeduction: 0,
      calculatedTax: 0,
      isSurchargeSuspended: false,
      reductionAmount: 0,
      determinedTax: 0,
      penaltyTax: 0,
      localIncomeTax: 0,
      totalTax: 0,
      steps,
      pre1990LandValuationDetail: pre1990LandResult,
    };
  }

  // STEP 1.5: 다필지 분리 계산 (환지·합병 등)
  if (rawInput.parcels && rawInput.parcels.length > 0) {
    const mpResult = calculateMultiParcelTransfer({
      totalTransferPrice: effectiveInput.transferPrice,
      transferDate: effectiveInput.transferDate,
      parcels: rawInput.parcels,
    });
    for (let pi = 0; pi < mpResult.parcelResults.length; pi++) {
      const pr = mpResult.parcelResults[pi];
      const parcelLabel = `필지 ${pi + 1}`;
      const expenseDesc = pr.estimatedDeduction > 0
        ? `개산공제 ${pr.estimatedDeduction.toLocaleString()}`
        : pr.expenses.toLocaleString();
      steps.push({ label: `[${parcelLabel}] 양도차익`, formula: `안분가 ${pr.allocatedTransferPrice.toLocaleString()} - 취득가 ${pr.acquisitionPrice.toLocaleString()} - 경비 ${expenseDesc}`, amount: pr.transferGain });
      steps.push({ label: `[${parcelLabel}] 장특공제`, formula: `${(pr.longTermHoldingRate * 100).toFixed(0)}%`, amount: pr.longTermHoldingDeduction, sub: true });
    }
    const mpTaxableGain = mpResult.totalTransferGain;
    const mpLtd = mpResult.totalLongTermHoldingDeduction;
    const mpTransferIncome = mpResult.totalTransferIncome;
    steps.push({ label: "양도차익 합계", formula: "필지별 합산", amount: mpTaxableGain, legalBasis: TRANSFER.TRANSFER_GAIN });
    steps.push({ label: "장기보유특별공제 합계", formula: "필지별 합산", amount: mpLtd, legalBasis: TRANSFER.LONG_TERM_DEDUCTION, sub: true });
    steps.push({ label: "양도소득금액 합계", formula: `${mpTaxableGain.toLocaleString()} - ${mpLtd.toLocaleString()}`, amount: mpTransferIncome });

    const mpBasicDeduction = input.skipBasicDeduction
      ? 0
      : calcBasicDeduction(mpTaxableGain, mpLtd, input.annualBasicDeductionUsed ?? 0, input.isUnregistered, parsedRates.basicDeductionRules);
    const mpTaxBase = Math.max(0, mpTransferIncome - mpBasicDeduction);
    steps.push({ label: "기본공제", formula: `${mpBasicDeduction.toLocaleString()}원`, amount: mpBasicDeduction, legalBasis: TRANSFER.BASIC_DEDUCTION });
    steps.push({ label: "과세표준", formula: `${mpTransferIncome.toLocaleString()} - ${mpBasicDeduction.toLocaleString()}`, amount: mpTaxBase, legalBasis: TRANSFER.TAX_BASE_CALC });

    const mpTaxResult = calcTax(mpTaxBase, parsedRates, effectiveInput, multiHouseSurchargeResult);
    steps.push({ label: "산출세액", formula: `${mpTaxBase.toLocaleString()}원 × ${Math.round(mpTaxResult.appliedRate * 100)}%`, amount: mpTaxResult.calculatedTax, legalBasis: TRANSFER.TAX_RATE });

    const {
      reductionAmount: mpReduction,
      reductionType: mpReductionType,
      reductionTypeApplied: mpReductionTypeApplied,
      reducibleIncome: mpReducibleIncome,
      rentalReductionDetail: mpRentalDetail,
      newHousingReductionDetail: mpNewHousingDetail,
      publicExpropriationDetail: mpExproDetail,
      selfFarmingReductionDetail: mpSelfFarmingDetail,
    } = calcReductions(
      mpTaxResult.calculatedTax,
      input.reductions,
      parsedRates.selfFarmingRules,
      input.rentalReductionDetails,
      parsedRates.longTermRentalRules,
      input.newHousingDetails,
      parsedRates.newHousingMatrix,
      input.transferDate,
      mpTransferIncome,
      mpBasicDeduction,
      mpTaxBase,
      input.acquisitionDate,
      input.standardPriceAtAcquisition,
      input.standardPriceAtTransfer,
    );
    const mpDeterminedTax = truncateToWon(Math.max(0, mpTaxResult.calculatedTax - mpReduction));
    const mpPenaltyBase = effectiveInput.acquisitionMethod === "appraisal"
      ? (effectiveInput.appraisalValue ?? 0)
      : 0;
    const mpPenaltyResult = calculateBuildingPenalty(effectiveInput, mpPenaltyBase);
    const mpPenaltyTax = mpPenaltyResult?.penalty ?? 0;
    const mpDeterminedTaxWithPenalty = mpDeterminedTax + mpPenaltyTax;
    const mpLocalIncomeTax = applyRate(mpDeterminedTaxWithPenalty, 0.1);

    // 가산세
    let mpFilingDelayedPenalty = 0;
    let mpPenaltyDetail: TransferTaxPenaltyResult | undefined;
    if (input.filingPenaltyDetails || input.delayedPaymentDetails) {
      mpPenaltyDetail = calculateTransferTaxPenalty({
        filing: input.filingPenaltyDetails,
        delayedPayment: input.delayedPaymentDetails,
      });
      mpFilingDelayedPenalty = mpPenaltyDetail?.totalPenalty ?? 0;
    }

    return {
      isExempt: false,
      transferGain: mpTaxableGain,
      taxableGain: mpTaxableGain,
      usedEstimatedAcquisition: false,
      longTermHoldingDeduction: mpLtd,
      longTermHoldingRate: mpTaxableGain > 0 ? mpLtd / mpTaxableGain : 0,
      basicDeduction: mpBasicDeduction,
      taxBase: mpTaxBase,
      appliedRate: mpTaxResult.appliedRate,
      progressiveDeduction: mpTaxResult.progressiveDeduction,
      calculatedTax: mpTaxResult.calculatedTax,
      surchargeType: mpTaxResult.surchargeType,
      surchargeRate: mpTaxResult.surchargeRate,
      isSurchargeSuspended: mpTaxResult.surchargeSuspended,
      reductionAmount: mpReduction,
      reductionType: mpReductionType,
      reductionTypeApplied: mpReductionTypeApplied,
      reducibleIncome: mpReducibleIncome,
      determinedTax: mpDeterminedTax,
      penaltyTax: mpPenaltyTax,
      localIncomeTax: mpLocalIncomeTax,
      totalTax: mpDeterminedTaxWithPenalty + mpLocalIncomeTax + mpFilingDelayedPenalty,
      steps,
      rentalReductionDetail: mpRentalDetail,
      newHousingReductionDetail: mpNewHousingDetail,
      publicExpropriationDetail: mpExproDetail,
      selfFarmingReductionDetail: mpSelfFarmingDetail,
      penaltyDetail: mpPenaltyDetail,
      parcelDetails: mpResult.parcelResults,
    };
  }

  // STEP 2: 양도차익 계산
  const { gain: rawGain, usedEstimated, estimatedBase, estimatedDeduction, expenses: appliedExpenses, splitDetail } = calcTransferGain(effectiveInput);
  // STEP 2a: 손실 → 0 (aggregate 엔진에서 skipLossFloor=true 시 음수 허용 — §102② 통산용)
  const transferGain = input.skipLossFloor ? rawGain : Math.max(0, rawGain);

  // 환산취득가 방식: 취득가와 필요경비(개산공제)를 분리 표시
  // 일반 방식: 취득가와 필요경비를 분리 표시
  let gainFormula: string;
  if (input.useEstimatedAcquisition) {
    gainFormula = [
      `양도가(${input.transferPrice.toLocaleString()}원)`,
      `취득가(환산 ${estimatedBase.toLocaleString()}원)`,
      `경비(개산공제 ${estimatedDeduction.toLocaleString()}원)`,
    ].join(" - ");
  } else {
    gainFormula = [
      `양도가(${input.transferPrice.toLocaleString()}원)`,
      `취득가(${input.acquisitionPrice.toLocaleString()}원)`,
      `경비(${appliedExpenses.toLocaleString()}원)`,
    ].join(" - ");
  }
  steps.push({
    label: "양도차익 계산",
    formula: gainFormula,
    amount: transferGain,
    legalBasis: TRANSFER.TRANSFER_GAIN,
  });

  // 양도 손실(또는 0): 가산세는 §114조의2 ②에 따라 산출세액 없어도 부과
  // aggregate 엔진에서 skipLossFloor=true로 호출 시 음수 차익도 이 분기로 흡수되어야 함
  if (transferGain <= 0) {
    const pb0 = input.acquisitionMethod === "appraisal"
      ? (input.appraisalValue ?? 0)
      : (input.useEstimatedAcquisition ? estimatedBase : 0);
    const pr0 = calculateBuildingPenalty(effectiveInput, pb0);
    const pt0 = pr0?.penalty ?? 0;
    if (pt0 > 0) {
      steps.push({
        label: "신축·증축 가산세",
        formula: `${pb0.toLocaleString()}원 × 5% (${pr0!.note})`,
        amount: pt0,
        legalBasis: TRANSFER.BUILDING_PENALTY,
      });
    }
    const lit0 = pt0 > 0 ? applyRate(pt0, 0.1) : 0;
    if (pt0 > 0) {
      steps.push({ label: "지방소득세", formula: `${pt0.toLocaleString()}원 × 10%`, amount: lit0, legalBasis: TRANSFER.LOCAL_INCOME_TAX });
      steps.push({ label: "총 납부세액", formula: `가산세 ${pt0.toLocaleString()}원 + 지방소득세 ${lit0.toLocaleString()}원`, amount: pt0 + lit0, legalBasis: TRANSFER.BUILDING_PENALTY });
    }
    return {
      isExempt: false,
      exemptReason: exemptionResult.exemptReason,
      transferGain: transferGain,
      taxableGain: transferGain,
      usedEstimatedAcquisition: usedEstimated,
      longTermHoldingDeduction: 0,
      longTermHoldingRate: 0,
      basicDeduction: 0,
      taxBase: 0,
      appliedRate: 0,
      progressiveDeduction: 0,
      calculatedTax: 0,
      isSurchargeSuspended: false,
      reductionAmount: 0,
      determinedTax: 0,
      penaltyTax: pt0,
      localIncomeTax: lit0,
      totalTax: pt0 + lit0,
      steps,
    };
  }

  // STEP 3: 과세 양도차익 (12억 초과분 안분 — 부분과세인 경우)
  let taxableGain: number;
  if (exemptionResult.isPartialExempt) {
    taxableGain = calcOneHouseProration(transferGain, input.transferPrice);
    steps.push({
      label: "과세 양도차익 (12억 초과분)",
      formula: `${transferGain.toLocaleString()}원 × (양도가 ${input.transferPrice.toLocaleString()}원 - 12억) / 양도가`,
      amount: taxableGain,
      legalBasis: TRANSFER.ONE_HOUSE_EXEMPT,
    });
  } else {
    taxableGain = transferGain;
  }

  // 중과세 여부 판단 (장기보유공제·세액 결정에 공통 사용)
  // houses[] 제공 시: determineMultiHouseSurcharge 결과 사용
  // 미제공 시: householdHousingCount + isRegulatedArea 플래그 기반 (하위 호환)
  const isSurchargeCase = multiHouseSurchargeResult
    ? multiHouseSurchargeResult.surchargeType !== "none"
    : (input.propertyType === "housing" || input.propertyType === "right_to_move_in" || input.propertyType === "presale_right") &&
      input.isRegulatedArea &&
      input.householdHousingCount >= 2;

  const effectiveHouseCount = multiHouseSurchargeResult
    ? multiHouseSurchargeResult.effectiveHouseCount
    : input.householdHousingCount;
  const surchargeTypeKey = effectiveHouseCount >= 3 ? "multi_house_3plus" : "multi_house_2";
  const suspendedResult = multiHouseSurchargeResult
    ? multiHouseSurchargeResult.isSurchargeSuspended
    : isSurchargeCase
      ? isSurchargeSuspended(parsedRates.surchargeSpecialRules, input.transferDate, surchargeTypeKey)
      : false;

  // STEP 4: 장기보유특별공제 (장기임대 특례율 포함)
  const { deduction: longTermHoldingDeduction, rate: longTermHoldingRate, holdingPeriod } =
    calcLongTermHoldingDeduction(taxableGain, effectiveInput, parsedRates.longTermHoldingRules, isSurchargeCase, suspendedResult, parsedRates.longTermRentalRules, splitDetail);
  const holdingPeriodStr = holdingPeriod.years > 0 || holdingPeriod.months > 0
    ? `보유기간 ${holdingPeriod.years}년 ${holdingPeriod.months}개월`
    : "";
  // 1세대1주택 특례 여부에 따라 계산식 분리 표시
  const residenceYearsForStep = Math.floor(input.residencePeriodMonths / 12);
  const isOneHouseSpecial =
    input.isOneHousehold &&
    input.householdHousingCount === 1 &&
    residenceYearsForStep >= 2 &&
    longTermHoldingDeduction > 0;
  const lthdFormulaRate = isOneHouseSpecial
    ? `보유 ${holdingPeriod.years}년×4% + 거주 ${residenceYearsForStep}년×4% = ${Math.round(longTermHoldingRate * 100)}% (80% 한도)`
    : `보유 ${holdingPeriod.years}년×2% = ${Math.round(longTermHoldingRate * 100)}% (30% 한도)`;
  steps.push({
    label: "장기보유특별공제",
    formula: [
      `${taxableGain.toLocaleString()}원 × ${Math.round(longTermHoldingRate * 100)}%`,
      lthdFormulaRate,
      holdingPeriodStr,
    ].filter(Boolean).join(" | "),
    amount: longTermHoldingDeduction,
    legalBasis: TRANSFER.LONG_TERM_DEDUCTION,
  });

  // STEP 4.5: 양도소득금액 = 양도차익 − 장기보유특별공제 (소득세법 §95 ①)
  const transferIncome = Math.max(0, taxableGain - longTermHoldingDeduction);
  steps.push({
    label: "양도소득금액",
    formula: `양도차익 ${taxableGain.toLocaleString()}원 - 장기보유특별공제 ${longTermHoldingDeduction.toLocaleString()}원`,
    amount: transferIncome,
    legalBasis: TRANSFER.LONG_TERM_DEDUCTION,
  });

  // STEP 5: 기본공제 (aggregate 엔진에서 호출 시 skipBasicDeduction=true로 스킵)
  const basicDeduction = input.skipBasicDeduction
    ? 0
    : calcBasicDeduction(
        taxableGain,
        longTermHoldingDeduction,
        input.annualBasicDeductionUsed,
        input.isUnregistered,
        parsedRates.basicDeductionRules,
      );
  if (!input.skipBasicDeduction) {
    steps.push({
      label: "기본공제",
      formula: `연 한도 ${parsedRates.basicDeductionRules.annualLimit.toLocaleString()}원 - 기사용 ${input.annualBasicDeductionUsed.toLocaleString()}원`,
      amount: basicDeduction,
      legalBasis: TRANSFER.BASIC_DEDUCTION,
    });
  }

  // STEP 6: 과세표준 = 양도소득금액 − 기본공제 (소득세법 §92 — 원 단위, 절사 규정 없음)
  const taxBase = Math.max(0, transferIncome - basicDeduction);
  steps.push({
    label: "과세표준",
    formula: `양도소득금액 ${transferIncome.toLocaleString()}원 - 기본공제 ${basicDeduction.toLocaleString()}원`,
    amount: taxBase,
    legalBasis: TRANSFER.TAX_BASE_CALC,
  });

  // STEP 7: 산출세액
  const taxResult = calcTax(taxBase, parsedRates, effectiveInput, multiHouseSurchargeResult);
  const fmtPct = (r: number) => `${Math.round(r * 100)}%`;
  steps.push({
    label: "산출세액",
    formula: `과세표준 ${taxBase.toLocaleString()}원 × 세율 ${fmtPct(taxResult.appliedRate)}${taxResult.surchargeRate ? ` (+중과 ${fmtPct(taxResult.surchargeRate)})` : ""}${taxResult.shortTermNote ? ` (${taxResult.shortTermNote})` : ""}`,
    amount: taxResult.calculatedTax,
    legalBasis: taxResult.surchargeRate ? TRANSFER.SURCHARGE : TRANSFER.TAX_RATE,
  });

  // STEP 8: 감면세액
  const {
    reductionAmount,
    reductionType,
    reductionTypeApplied,
    reducibleIncome,
    rentalReductionDetail,
    newHousingReductionDetail,
    publicExpropriationDetail,
    selfFarmingReductionDetail,
  } = calcReductions(
    taxResult.calculatedTax,
    input.reductions,
    parsedRates.selfFarmingRules,
    input.rentalReductionDetails,
    parsedRates.longTermRentalRules,
    input.newHousingDetails,
    parsedRates.newHousingMatrix,
    input.transferDate,
    // 양도소득금액 = 과세양도차익 − 장기보유특별공제 (§77 감면 소득 안분 기준)
    Math.max(0, taxableGain - longTermHoldingDeduction),
    basicDeduction,
    taxBase,
    input.acquisitionDate,
    input.standardPriceAtAcquisition,
    input.standardPriceAtTransfer,
  );
  // 감면 유형별 법령 조문 매핑
  const reductionLawMap: Record<string, string> = {
    "자경농지":                TRANSFER.REDUCTION_SELF_FARMING,
    "자경농지(§69·상속인 경작기간 합산 §66⑪)": `${TRANSFER.REDUCTION_SELF_FARMING} + ${TRANSFER.REDUCTION_SELF_FARMING_INHERITED}`,
    "자경농지(§69·편입일 부분감면 §66⑤⑥)":  `${TRANSFER.REDUCTION_SELF_FARMING} + ${TRANSFER.REDUCTION_SELF_FARMING_INCORP}`,
    "장기임대주택":            TRANSFER.REDUCTION_LONG_RENTAL,
    "신축주택":                TRANSFER.REDUCTION_NEW_HOUSING,
    "미분양주택":              TRANSFER.REDUCTION_UNSOLD_HOUSING,
    "공익사업용 토지 수용(§77)": publicExpropriationDetail?.useLegacyRates
      ? `${TRANSFER.REDUCTION_PUBLIC_EXPROPRIATION} + ${TRANSFER.REDUCTION_PUBLIC_EXPROPRIATION_TRANSITIONAL}`
      : TRANSFER.REDUCTION_PUBLIC_EXPROPRIATION,
  };
  steps.push({
    label: "감면세액",
    formula: reductionType ? `${reductionType} 감면 ${reductionAmount.toLocaleString()}원` : "감면 없음",
    amount: reductionAmount,
    legalBasis: reductionType ? reductionLawMap[reductionType] : undefined,
  });

  // STEP 9: 결정세액 = 산출세액 - 감면 (원 미만 절사)
  const determinedTax = truncateToWon(Math.max(0, taxResult.calculatedTax - reductionAmount));
  steps.push({
    label: "결정세액",
    formula: `산출세액 ${taxResult.calculatedTax.toLocaleString()}원 - 감면 ${reductionAmount.toLocaleString()}원 (원 미만 절사)`,
    amount: determinedTax,
    legalBasis: TRANSFER.FINAL_TAX,
  });

  // STEP 10.5: §114조의2 신축·증축 가산세 (step은 STEP 12에서 통합 emit)
  const penaltyBase = input.acquisitionMethod === "appraisal"
    ? (input.appraisalValue ?? 0)
    : (input.useEstimatedAcquisition ? (estimatedBase ?? 0) : 0);
  const penaltyResult = calculateBuildingPenalty(effectiveInput, penaltyBase);
  const penaltyTax = penaltyResult?.penalty ?? 0;

  // 총결정세액 = 결정세액 + §114조의2 가산세
  const determinedTaxWithPenalty = determinedTax + penaltyTax;

  // STEP 10: 지방소득세 (총결정세액 × 10%, 원 미만 절사 — 지방세법 §103의3)
  const localIncomeTax = applyRate(determinedTaxWithPenalty, 0.1);
  steps.push({
    label: "지방소득세",
    formula: `${determinedTaxWithPenalty.toLocaleString()}원 × 10%`,
    amount: localIncomeTax,
    legalBasis: TRANSFER.LOCAL_INCOME_TAX,
  });

  // STEP 12: 신고불성실·납부지연 가산세 (선택 입력 시) — totalTax 합산 전에 계산
  const penaltyDetail =
    input.filingPenaltyDetails || input.delayedPaymentDetails
      ? calculateTransferTaxPenalty({
          filing: input.filingPenaltyDetails,
          delayedPayment: input.delayedPaymentDetails,
        })
      : undefined;
  const filingDelayedPenalty = penaltyDetail?.totalPenalty ?? 0;
  const totalAllPenalty = penaltyTax + filingDelayedPenalty;

  // 가산세 통합 step: §114조의2 + 신고불성실 + 납부지연 합산 표시
  if (totalAllPenalty > 0) {
    steps.push({
      label: "가산세 합계",
      formula: `환산가액적용가산세 + 신고불성실가산세 + 납부지연가산세`,
      amount: totalAllPenalty,
      legalBasis: TRANSFER.BUILDING_PENALTY,
    });
    if (penaltyTax > 0) {
      steps.push({
        label: "환산가액적용가산세 (§114조의2)",
        formula: `${penaltyBase.toLocaleString()}원 × 5% (${penaltyResult!.note})`,
        amount: penaltyTax,
        legalBasis: TRANSFER.BUILDING_PENALTY,
        sub: true,
      });
    }
    if (penaltyDetail?.filingPenalty && penaltyDetail.filingPenalty.filingPenalty > 0) {
      steps.push({
        label: `신고불성실가산세 (${(penaltyDetail.filingPenalty.penaltyRate * 100).toFixed(0)}%)`,
        formula: `납부세액 ${penaltyDetail.filingPenalty.penaltyBase.toLocaleString()}원 × ${(penaltyDetail.filingPenalty.penaltyRate * 100).toFixed(0)}%`,
        amount: penaltyDetail.filingPenalty.filingPenalty,
        legalBasis: penaltyDetail.filingPenalty.legalBasis,
        sub: true,
      });
    }
    if (penaltyDetail?.delayedPaymentPenalty && penaltyDetail.delayedPaymentPenalty.delayedPaymentPenalty > 0) {
      const d = penaltyDetail.delayedPaymentPenalty;
      steps.push({
        label: `납부지연가산세 (${d.elapsedDays}일 × ${(d.dailyRate * 100).toFixed(3)}%)`,
        formula: `미납세액 ${d.unpaidTax.toLocaleString()}원 × ${d.elapsedDays}일 × ${(d.dailyRate * 100).toFixed(3)}%`,
        amount: d.delayedPaymentPenalty,
        legalBasis: "국세기본법 §47의4",
        sub: true,
      });
    }
    steps.push({
      label: "총결정세액",
      formula: `결정세액 ${determinedTax.toLocaleString()}원 + 가산세 합계 ${totalAllPenalty.toLocaleString()}원`,
      amount: determinedTax + totalAllPenalty,
      legalBasis: TRANSFER.FINAL_TAX,
    });
  }

  // STEP 11: 총 납부세액 = 총결정세액 + 지방소득세 + 신고불성실/납부지연가산세
  const totalTax = determinedTaxWithPenalty + localIncomeTax + filingDelayedPenalty;
  steps.push({
    label: "총 납부세액",
    formula: `${totalAllPenalty > 0 ? "총결정세액" : "결정세액"} ${(determinedTax + totalAllPenalty).toLocaleString()}원 + 지방소득세 ${localIncomeTax.toLocaleString()}원`,
    amount: totalTax,
    legalBasis: `${TRANSFER.FINAL_TAX} + ${TRANSFER.LOCAL_INCOME_TAX}`,
  });

  return {
    isExempt: false,
    exemptReason: exemptionResult.exemptReason,
    transferGain,
    taxableGain,
    usedEstimatedAcquisition: usedEstimated,
    longTermHoldingDeduction,
    longTermHoldingRate,
    basicDeduction,
    taxBase,
    appliedRate: taxResult.appliedRate,
    progressiveDeduction: taxResult.progressiveDeduction,
    calculatedTax: taxResult.calculatedTax,
    surchargeType: taxResult.surchargeType,
    surchargeRate: taxResult.surchargeRate,
    isSurchargeSuspended: taxResult.surchargeSuspended,
    reductionAmount,
    reductionType,
    reductionTypeApplied,
    reducibleIncome,
    determinedTax,
    penaltyTax,
    localIncomeTax,
    totalTax,
    steps,
    multiHouseSurchargeDetail: multiHouseSurchargeResult
      ? {
          effectiveHouseCount: multiHouseSurchargeResult.effectiveHouseCount,
          rawHouseCount: multiHouseSurchargeResult.rawHouseCount,
          excludedHouses: multiHouseSurchargeResult.excludedHouses,
          exclusionReasons: multiHouseSurchargeResult.exclusionReasons,
          isRegulatedAtTransfer: multiHouseSurchargeResult.isRegulatedAtTransfer,
          warnings: multiHouseSurchargeResult.warnings,
        }
      : undefined,
    nonBusinessLandJudgmentDetail: nonBusinessLandJudgment,
    rentalReductionDetail,
    newHousingReductionDetail,
    publicExpropriationDetail,
    selfFarmingReductionDetail,
    penaltyDetail,
    pre1990LandValuationDetail: pre1990LandResult,
    splitDetail: splitDetail ?? undefined,
  };
}
