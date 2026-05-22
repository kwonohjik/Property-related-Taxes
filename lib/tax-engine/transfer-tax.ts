/**
 * 양도소득세 순수 계산 엔진
 *
 * Layer 2 (Pure Engine): DB 직접 호출 없음.
 * 모든 세율 데이터는 TaxRatesMap으로 주입받아 순수 함수로 계산.
 *
 * P0-2 원칙: 세율 × 금액 곱셈은 반드시 applyRate() 사용.
 */
import { TRANSFER, NBL } from "./legal-codes";
import {
  applyRate,
  calculateHoldingPeriod,
  isSurchargeSuspended,
  truncateToWon,
} from "./tax-utils";
import {
  type MultiHouseSurchargeInput,
  type MultiHouseSurchargeResult,
  determineMultiHouseSurcharge,
} from "./multi-house-surcharge";
import {
  type NonBusinessLandJudgment,
  judgeNonBusinessLand,
} from "./non-business-land";
import {
  type Pre1990LandValuationResult,
  calculatePre1990LandValuation,
} from "./pre-1990-land-valuation";
import type { TaxRatesMap } from "@/lib/db/tax-rates";
import {
  runInheritedAcquisitionStep,
  type InheritedAcquisitionStepResult,
} from "./inheritance-acquisition-helpers";
// 공개 타입 — ./types/transfer.types 참조
import type {
  TransferTaxInput,
  TransferReduction,
  CalculationStep,
  TransferTaxResult,
} from "./types/transfer.types";
import type { CarryoverTaxationDetail } from "./types/transfer-carryover.types";
export type { TransferTaxInput, TransferReduction, CalculationStep, TransferTaxResult };
import {
  calculateRentalHousingException,
  type RentalHousingExceptionResult,
} from "./transfer-tax/rental-housing-exception";
import { TRANSFER_RENTAL_HOUSING } from "./legal-codes/transfer";
import { evaluateNew993, type New993Result } from "./transfer-reductions/new-99-3";

import {
  parseRatesFromMap,
  checkExemption,
  calcTransferGain,
  calcOneHouseProration,
  calcLongTermHoldingDeduction,
  calcBasicDeduction,
  runCommercialBuildingStep,
  buildMultiHouseSurchargeDetail,
  type CommercialBuildingStepResult,
} from "./transfer-tax-helpers";
import { calculateBuildingPenalty, calcTax, handleMultiParcelBranch } from "./transfer-tax-rate-calc";
import { finalizeTransferTax, resolveLTHDStartDate } from "./transfer-tax-finalize";
import { isRedevelopmentActive, calculateRedevelopmentTax } from "./transfer-tax-redevelopment";
import { calcCarryoverScenarios } from "./transfer-tax-carryover";
import { buildBurdenedGiftBreakdown, assertBurdenedGiftEligible, detectBurdenedGiftMultiHouseWarning } from "./burdened-gift-apportionment";
import { BURDENED_GIFT_TRANSFER } from "./legal-codes/burdened-gift";
import type { TransferBurdenedGiftBreakdown } from "./types/transfer-burdened-gift.types";
import { resolveAcquisitionOverride, type TransferTaxAcquisitionOptions } from "./transfer-tax-acquisition-override";
export type { TransferTaxAcquisitionOptions } from "./transfer-tax-acquisition-override";
import { applyFamilyBusinessCgtStep } from "./transfer-tax-family-business";
export { parseRatesFromMap } from "./transfer-tax-helpers";
export { calcTax } from "./transfer-tax-rate-calc";
export function calculateTransferTax(
  rawInput: TransferTaxInput,
  rates: TaxRatesMap,
  options?: TransferTaxAcquisitionOptions,
): TransferTaxResult {
  const steps: CalculationStep[] = [];
  const warnings: string[] = []; // F-2: 케이스 12 등 비차단 안내

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
        `취득기준시가 = ${pre1990LandResult.pricePerSqmAtAcquisition.toLocaleString()}/㎡ × ` +
        `${rawInput.pre1990Land.areaSqm.toLocaleString()}㎡ = ` +
        `${pre1990LandResult.standardPriceAtAcquisition.toLocaleString()}`,
      amount: pre1990LandResult.standardPriceAtAcquisition,
      sub: true,
    });
  }
  // STEP 0.45: 상속 부동산 취득가액 의제 (소령 §176조의2④·§163⑨)
  const inheritedStep = runInheritedAcquisitionStep(rawInput, input, pre1990LandResult);
  let inheritedAcquisitionStep: InheritedAcquisitionStepResult | undefined;
  if (inheritedStep) {
    inheritedAcquisitionStep = inheritedStep;
    input = inheritedStep.updatedInput;
    steps.push(inheritedStep.step);
  }
  // STEP 0.42: 가업상속공제 §97의2④ 의제 취득가액 — 조기 반환 (familyBusinessInheritance 없으면 no-op)
  const fbResult = applyFamilyBusinessCgtStep(rawInput, input, rates, calculateTransferTax);
  if (fbResult) return fbResult;
  // STEP 0.46: 외부 취득가액 override 적용 (options 없으면 no-op)
  input = resolveAcquisitionOverride(input, options);
  let workingInput = input;
  // STEP 0.475: 배우자등 이월과세 §97조의2 (carryoverTaxation 없으면 skip, 재귀 시 자동 skip)
  let carryoverDetail: CarryoverTaxationDetail | undefined;
  if (rawInput.acquisitionCause === "carryover_gift" && rawInput.carryoverTaxation) {
    const carryoverResult = calcCarryoverScenarios(
      workingInput,
      rates,
      // calculateTransferTax를 주입 — 재귀 호출 시 carryoverTaxation=undefined이므로 무한 루프 없음
      calculateTransferTax,
    );
    if (carryoverResult) {
      carryoverDetail = carryoverResult.detail;
      // 채택 시나리오 입력으로 workingInput 교체 → 이후 STEP 0.5~11이 그대로 통과
      workingInput = carryoverResult.adoptedInput;
      steps.push({
        label: "배우자등 이월과세 판정",
        formula: carryoverResult.detail.isEligible
          ? `Scenario A(결정세액 ${carryoverResult.detail.scenarioA.determinedTax.toLocaleString()}) vs B(${carryoverResult.detail.scenarioB.determinedTax.toLocaleString()}) → ${carryoverResult.detail.adoptedScenario} 채택`
          : `이월과세 적용배제 (사유: ${carryoverResult.detail.exclusionReason ?? "없음"})`,
        amount: 0,
        legalBasis: TRANSFER.CARRYOVER_TAXATION,
      });
    }
  }

  // STEP 0.48 부담부증여 §159 (Phase 2/F-1/F-2): transferType OR legacy + propertyType 4종 + overshoot + 5-a 해석 B + 12 안내.
  let transferBurdenedGiftBreakdown: TransferBurdenedGiftBreakdown | undefined;
  const isBurdenedGiftEngine =
    rawInput.transferType === "burdened_gift" ||
    rawInput.acquisitionCause === "burdened_gift";
  if (isBurdenedGiftEngine && rawInput.burdenedGiftInfo) {
    // Phase 2 게이트 — propertyType 허용 범위·overshoot fail-fast·고가주택 후속 PR 차단
    assertBurdenedGiftEligible({
      propertyType: workingInput.propertyType,
      isOneHousehold: workingInput.isOneHousehold,
      info: rawInput.burdenedGiftInfo,
    });
    transferBurdenedGiftBreakdown = buildBurdenedGiftBreakdown({
      landStdPriceAtTransfer: rawInput.burdenedGiftInfo.landStdPriceAtTransfer,
      buildingStdPriceAtTransfer: rawInput.burdenedGiftInfo.buildingStdPriceAtTransfer,
      landStdPriceAtAcquisition: rawInput.burdenedGiftInfo.landStdPriceAtAcquisition,
      buildingStdPriceAtAcquisition: rawInput.burdenedGiftInfo.buildingStdPriceAtAcquisition,
      info: rawInput.burdenedGiftInfo,
      giftDate: rawInput.transferDate, // Phase 2 — 증여일 = 양도일
    });
    const land = transferBurdenedGiftBreakdown.perAsset.land;
    const building = transferBurdenedGiftBreakdown.perAsset.building;
    const totalTransferPrice = land.transferPrice + building.transferPrice;
    const totalAcquisitionPrice = land.acquisitionPrice + building.acquisitionPrice;
    const totalEstimatedDeduction = land.estimatedDeduction + building.estimatedDeduction;
    // override: §159 산정값으로 본 계산 진행 (§114⑦ 환산경로와 분리).
    // F-1: burdenedGiftDenominator = giftValuation C — 12억 안분 해석 B 분모.
    workingInput = {
      ...workingInput,
      transferPrice: totalTransferPrice,
      acquisitionPrice: totalAcquisitionPrice,
      expenses: totalEstimatedDeduction,
      capitalExpenditure: undefined,
      transferExpense: undefined,
      useEstimatedAcquisition: false,
      burdenedGiftDenominator: transferBurdenedGiftBreakdown.sangjeungbeopValuation.max,
    };
    steps.push({
      label: "부담부증여 양도차익 산정 (소령 §159)",
      formula:
        `양도가 = 인수채무 ${transferBurdenedGiftBreakdown.assumedDebtAmount.toLocaleString()} ` +
        `(${transferBurdenedGiftBreakdown.sangjeungbeopValuation.selectedMode} 평가 ${transferBurdenedGiftBreakdown.sangjeungbeopValuation.max.toLocaleString()} 중 ` +
        `${(transferBurdenedGiftBreakdown.debtRatio * 100).toFixed(4)}% 안분)`,
      amount: totalTransferPrice,
      legalBasis: BURDENED_GIFT_TRANSFER.VALUATION_159,
    });
    // F-2: 케이스 12 다주택 중과 비스코프 안내 (양도자 = 증여자 → §97의2 미적용).
    const multiHouseWarning = detectBurdenedGiftMultiHouseWarning({
      propertyType: workingInput.propertyType,
      isRegulatedArea: workingInput.isRegulatedArea,
      householdHousingCount: workingInput.householdHousingCount,
    });
    if (multiHouseWarning) warnings.push(multiHouseWarning);
  }

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

  // STEP 0.65: 재개발/재건축 분기 — 시행령 §166. STEP 1: 비과세 판단
  if (isRedevelopmentActive(effectiveInput.propertyType, effectiveInput.redevelopment)) return calculateRedevelopmentTax(effectiveInput, parsedRates, steps);
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
      warnings: warnings.length > 0 ? warnings : undefined,
      transferGain: 0,
      taxableGain: 0,
      usedEstimatedAcquisition: effectiveInput.useEstimatedAcquisition,
      longTermHoldingDeduction: 0,
      longTermHoldingRate: 0,
      lthdStartDate: resolveLTHDStartDate(effectiveInput),
      basicDeduction: 0,
      taxBase: 0,
      appliedRate: 0,
      progressiveDeduction: 0,
      calculatedTax: 0,
      isSurchargeSuspended: false,
      reductionAmount: 0,
      determinedTax: 0,
      penaltyTax: 0,
      penaltyBase: 0,
      localIncomeTax: 0,
      totalTax: 0,
      steps,
      pre1990LandValuationDetail: pre1990LandResult,
      carryoverTaxationDetail: carryoverDetail,
    };
  }

  // STEP 0.35: 상업용건물·오피스텔 환산취득가 (소령 §164⑧ + §176조의2②2호)
  // 성공 시 effectiveInput을 실가 경로로 교체 (useEstimatedAcquisition=false, acquisitionPrice=환산가, expenses=개산공제)
  let cbStep: CommercialBuildingStepResult | undefined;
  if (effectiveInput.propertyType === "commercial_building" && effectiveInput.useEstimatedAcquisition) {
    cbStep = runCommercialBuildingStep(effectiveInput);
    if (cbStep) {
      effectiveInput = {
        ...effectiveInput,
        useEstimatedAcquisition: false,
        acquisitionPrice: cbStep.acquisitionPrice,
        expenses: cbStep.lumpSumDeduction,
        capitalExpenditure: undefined,
        transferExpense: undefined,
      };
    }
  }

  // STEP 1.5: 다필지 분리 계산 (환지·합병 등)
  const mpBranchResult = handleMultiParcelBranch(
    { rawInput, effectiveInput, input, parsedRates, multiHouseSurchargeResult, pre1990LandResult, carryoverDetail, options },
    steps,
  );
  if (mpBranchResult) return mpBranchResult;
  // STEP 2: 양도차익 계산
  const { gain: rawGain, usedEstimated, estimatedBase, estimatedDeduction, expenses: appliedExpenses, splitDetail, swapApplied, swapComparison } = calcTransferGain(effectiveInput);
  // 소유자 분리: 본인 신고분 양도차익만 추출 (소령 §166⑥, §168②)
  // splitDetail이 있고 selfOwns !== "both" 이면 본인 소유 파트의 gain만 사용
  const selfOwns = effectiveInput.selfOwns ?? "both";
  const ownerRawGain = splitDetail && selfOwns !== "both"
    ? (selfOwns === "building_only" ? splitDetail.building.gain : splitDetail.land.gain)
    : rawGain;

  // STEP 2a: 손실 → 0 (aggregate 엔진에서 skipLossFloor=true 시 음수 허용 — §102② 통산용)
  const transferGain = input.skipLossFloor ? ownerRawGain : Math.max(0, ownerRawGain);
  // 환산취득가 방식: 취득가와 필요경비(개산공제)를 분리 표시
  // 일반 방식: 취득가와 필요경비를 분리 표시
  let gainFormula: string;
  if (input.useEstimatedAcquisition) {
    gainFormula = [
      `양도가(${input.transferPrice.toLocaleString()}`,
      `취득가(환산 ${estimatedBase.toLocaleString()}`,
      `경비(개산공제 ${estimatedDeduction.toLocaleString()}`,
    ].join(" - ");
  } else {
    gainFormula = [
      `양도가(${input.transferPrice.toLocaleString()}`,
      `취득가(${input.acquisitionPrice.toLocaleString()}`,
      `경비(${appliedExpenses.toLocaleString()}`,
    ].join(" - ");
  }
  if (selfOwns !== "both" && splitDetail) {
    const selfLabel = selfOwns === "building_only" ? "건물" : "토지";
    steps.push({
      label: `본인 신고분: ${selfLabel} (소령 §166⑥, §168②)`,
      formula: `일괄양도가액 ${input.transferPrice.toLocaleString()} 중 ${selfLabel} 분만 신고 — 나머지는 타인 소유`,
      amount: transferGain,
      legalBasis: TRANSFER.TRANSFER_GAIN,
    });
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
        formula: `${pb0.toLocaleString()} × 5% (${pr0!.note})`,
        amount: pt0,
        legalBasis: TRANSFER.BUILDING_PENALTY,
      });
    }
    const lit0 = pt0 > 0 ? applyRate(pt0, 0.1) : 0;
    if (pt0 > 0) {
      steps.push({ label: "지방소득세", formula: `${pt0.toLocaleString()} × 10%`, amount: lit0, legalBasis: TRANSFER.LOCAL_INCOME_TAX });
      steps.push({ label: "총 납부세액", formula: `가산세 ${pt0.toLocaleString()} + 지방소득세 ${lit0.toLocaleString()}`, amount: pt0 + lit0, legalBasis: TRANSFER.BUILDING_PENALTY });
    }
    return {
      isExempt: false,
      exemptReason: exemptionResult.exemptReason,
      warnings: warnings.length > 0 ? warnings : undefined,
      transferGain: transferGain,
      taxableGain: transferGain,
      usedEstimatedAcquisition: usedEstimated,
      longTermHoldingDeduction: 0,
      lthdStartDate: resolveLTHDStartDate(effectiveInput),
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
      penaltyBase: 0,
      localIncomeTax: lit0,
      totalTax: pt0 + lit0,
      steps,
      splitDetail: splitDetail ?? undefined,
      preHousingDisclosureDetail: splitDetail?.preHousingDisclosureDetail,
    };
  }

  // STEP 2.5: 장기임대주택 보유자 거주주택 비과세 특례 (소령 §155⑳ + §161)
  // gain 계산 완료 후 실행 — A/B 시나리오별 taxableGain 결정.
  // applied=true 시 STEP 3(일반 12억 안분)을 건너뛰고 특례 결과로 직접 진행.
  let rentalHousingExceptionDetail: RentalHousingExceptionResult | undefined;
  if (effectiveInput.rentalHousingException?.applyException) {
    const holdPeriod = calculateHoldingPeriod(effectiveInput.acquisitionDate, effectiveInput.transferDate);
    const holdYears = holdPeriod.years;
    const liveYears = Math.floor(effectiveInput.residencePeriodMonths / 12);
    rentalHousingExceptionDetail = calculateRentalHousingException(
      effectiveInput.rentalHousingException,
      transferGain,
      effectiveInput.transferPrice,
      holdYears,
      liveYears,
      holdYears,    // 거주주택 보유연수 (B 시나리오 시 PHRP 보유연수와 동일)
      liveYears,    // 거주주택 거주연수
    );
    if (rentalHousingExceptionDetail.applied) {
      steps.push({
        label: "장기임대주택 보유자 거주주택 비과세 특례",
        formula: `§155⑳ + §161 — ${rentalHousingExceptionDetail.scenarioId} 시나리오 적용`,
        amount: rentalHousingExceptionDetail.taxableGain,
        legalBasis: TRANSFER_RENTAL_HOUSING.PIT_RD_155_20,
      });
      // 특례 적용 시: taxableGain을 특례 결과로 대체하고 최종 결과 반환
      const rhe = rentalHousingExceptionDetail;
      const rheTaxBase = truncateToWon(Math.max(0, rhe.taxableGain - 2_500_000));
      const rheTaxResult = calcTax(rheTaxBase, parsedRates, effectiveInput, multiHouseSurchargeResult);
      // §161 비과세 양도소득금액 — 양도소득금액(§95①) 단계에서 분리 표기용
      // = §95① 양도소득금액 − 과세대상 양도소득금액
      // FilingFormTable의 "비과세 양도소득금액" 행에 표시 (양도차익 단계 비과세 분리 X)
      const nontaxableGainAmount = Math.max(0, rhe.formulaTrace.gain95Table1 - rhe.taxableGain);
      // 명세서 카드 "비과세 양도소득금액 (소령 §161①)" 행에서 step.formula 자동 매핑.
      // 정식 step emit으로 사용자가 §161① 안분 산식·근거 검증 가능 (이전: result 필드만 표시).
      if (nontaxableGainAmount > 0) {
        steps.push({
          label: "비과세 양도소득금액 (소령 §161①)",
          formula: `§95① 양도소득금액 ${rhe.formulaTrace.gain95Table1.toLocaleString()} − 과세대상 양도소득금액 ${rhe.taxableGain.toLocaleString()} = ${nontaxableGainAmount.toLocaleString()}`,
          amount: nontaxableGainAmount,
          legalBasis: TRANSFER_RENTAL_HOUSING.PIT_RD_155_20,
        });
      }
      return {
        isExempt: rhe.taxableGain === 0,
        exemptReason: rhe.taxableGain === 0 ? "장기임대주택 보유자 거주주택 비과세 (§155⑳)" : undefined,
        transferGain,
        taxableGain: rhe.taxableGain,
        usedEstimatedAcquisition: usedEstimated,
        // 환산취득가·개산공제 분리 표기를 위해 result에 명시 (FilingFormTable 환산 분기 진입 조건)
        // 누락 시 fallback 분기로 떨어져 "취득가액 = 환산취득가 + 개산공제 합산" 흡수 표시 발생
        estimatedBase: usedEstimated ? estimatedBase : undefined,
        estimatedDeduction: usedEstimated ? estimatedDeduction : undefined,
        longTermHoldingDeduction: rhe.formulaTrace.gain95Table1 > 0
          ? transferGain - rhe.formulaTrace.gain95Table1
          : 0,
        // 장기보유공제율 — 0 강제 시 결과 카드에 "장기보유특별공제 (0%)"로 잘못 표시되므로 실제 공제율 산출
        longTermHoldingRate: transferGain > 0 && rhe.formulaTrace.gain95Table1 > 0
          ? (transferGain - rhe.formulaTrace.gain95Table1) / transferGain
          : 0,
        lthdStartDate: resolveLTHDStartDate(effectiveInput),
        nontaxableGainAmount,
        basicDeduction: rhe.taxableGain > 0 ? 2_500_000 : 0,
        taxBase: rheTaxBase,
        appliedRate: rheTaxResult.appliedRate,
        progressiveDeduction: rheTaxResult.progressiveDeduction,
        calculatedTax: rheTaxResult.calculatedTax,
        isSurchargeSuspended: false,
        reductionAmount: 0,
        determinedTax: rheTaxResult.calculatedTax,
        penaltyTax: 0,
        penaltyBase: 0,
        localIncomeTax: applyRate(rheTaxResult.calculatedTax, 0.1),
        totalTax: rheTaxResult.calculatedTax + applyRate(rheTaxResult.calculatedTax, 0.1),
        steps,
        rentalHousingExceptionDetail: rhe,
      };
    } else {
      // applied=false: 미적용 사유를 steps에 기록하여 결과 화면에서 노출 (침묵 실패 차단)
      const reasons = [
        ...rentalHousingExceptionDetail.eligibility.residenceFailReasons,
        ...rentalHousingExceptionDetail.eligibility.failReasons.map((r) => r.message),
      ];
      const reasonText =
        reasons.length > 0
          ? reasons.join(" · ")
          : "장기임대주택 거주주택 비과세 특례 요건 미충족";
      steps.push({
        label: "장기임대주택 거주주택 비과세 특례 — 적용 불가",
        formula: reasonText,
        amount: 0,
        legalBasis: TRANSFER_RENTAL_HOUSING.PIT_RD_155_20,
      });
    }
  }

  // STEP 3: 과세 양도차익 (12억 초과분 안분 — 부분과세인 경우)
  // 우선순위: burdenedGiftDenominator (부담부증여 — 해석 B) > totalPropertyTransferPrice (지분) > transferPrice (단독)
  // F-1 (2026-05-12): effectiveInput 사용 — STEP 0.48 burdenedGiftDenominator 오버라이드 반영.
  let taxableGain: number;
  if (exemptionResult.isPartialExempt) {
    taxableGain = calcOneHouseProration(
      transferGain,
      effectiveInput.transferPrice,
      effectiveInput.totalPropertyTransferPrice,
      effectiveInput.burdenedGiftDenominator,
    );
    const denom =
      effectiveInput.burdenedGiftDenominator ??
      effectiveInput.totalPropertyTransferPrice ??
      effectiveInput.transferPrice;
    const isBurdened = effectiveInput.burdenedGiftDenominator !== undefined;
    const isFractional =
      !isBurdened &&
      effectiveInput.totalPropertyTransferPrice !== undefined &&
      effectiveInput.totalPropertyTransferPrice !== effectiveInput.transferPrice;
    const denomLabel = isBurdened ? "증여가액 C" : isFractional ? "총양도가" : "양도가";
    steps.push({
      label: "과세 양도차익 (12억 초과분)",
      formula: `${transferGain.toLocaleString()} × (${denomLabel} ${denom.toLocaleString()} - 12억) / ${denomLabel}`,
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
    ? (() => {
        const hPart = Math.min(holdingPeriod.years * 4, 40);
        const rPart = Math.min(residenceYearsForStep * 4, 40);
        return `보유 ${holdingPeriod.years}년×4%=${hPart}% + 거주 ${residenceYearsForStep}년×4%=${rPart}% = ${Math.round(longTermHoldingRate * 100)}%`;
      })()
    : `보유 ${holdingPeriod.years}년×2% = ${Math.round(longTermHoldingRate * 100)}% (30% 한도)`;
  steps.push({
    label: "장기보유특별공제",
    formula: [
      `${taxableGain.toLocaleString()} × ${Math.round(longTermHoldingRate * 100)}%`,
      lthdFormulaRate,
      holdingPeriodStr,
    ].filter(Boolean).join(" | "),
    amount: longTermHoldingDeduction,
    legalBasis: TRANSFER.LONG_TERM_DEDUCTION,
  });

  // STEP 4.1·4.2: 1세대1주택 특례(표2) 적용 시 보유분/거주분 sub-step 정식 emit.
  // 명세서 카드의 "보유 기간분 장특"·"거주 기간분 장특" 행에 step.formula 자동 매핑 (정확한 안분율 노출).
  // 비특례 케이스는 sub-step 미발생 (보유분 일률 표1 적용 — UI는 표1 안내 노출).
  if (isOneHouseSpecial && longTermHoldingDeduction > 0) {
    const hPart = Math.min(holdingPeriod.years * 4, 40);
    const rPart = Math.min(residenceYearsForStep * 4, 40);
    const totalRate = hPart + rPart;
    if (totalRate > 0) {
      const holdingAmt = Math.floor((longTermHoldingDeduction * hPart) / totalRate);
      const residenceAmt = longTermHoldingDeduction - holdingAmt;
      steps.push({
        label: "보유 기간분 장특",
        formula: `${longTermHoldingDeduction.toLocaleString()} × ${hPart}% / ${totalRate}% = ${holdingAmt.toLocaleString()} (보유 ${holdingPeriod.years}년 × 4%, 40% 한도)`,
        amount: holdingAmt,
        legalBasis: TRANSFER.LONG_TERM_DEDUCTION,
        sub: true,
      });
      steps.push({
        label: "거주 기간분 장특",
        formula: `${longTermHoldingDeduction.toLocaleString()} × ${rPart}% / ${totalRate}% = ${residenceAmt.toLocaleString()} (거주 ${residenceYearsForStep}년 × 4%, 40% 한도, 잔액 보정)`,
        amount: residenceAmt,
        legalBasis: TRANSFER.LONG_TERM_DEDUCTION,
        sub: true,
      });
    }
  }

  // STEP 4.5: 양도소득금액 = 양도차익 − 장기보유특별공제 (소득세법 §95 ①)
  const transferIncomeBefore993 = Math.max(0, taxableGain - longTermHoldingDeduction);
  steps.push({
    label: "양도소득금액",
    formula: `양도차익 ${taxableGain.toLocaleString()} - 장기보유특별공제 ${longTermHoldingDeduction.toLocaleString()}`,
    amount: transferIncomeBefore993,
    legalBasis: TRANSFER.LONG_TERM_DEDUCTION,
  });

  // STEP 4.6 (Phase 2, 2026-05-06): §99의3 신축주택 과세특례 — 양도소득금액 차감 방식
  // 5년 내 양도 = 취득~양도일까지 발생분 전액 / 5년 후 양도 = 5년 안분 산식
  // 농특세 = (감면 전 산출세액 - 감면 후 산출세액) × 20% (STEP 7 이후 계산)
  let transferIncome = transferIncomeBefore993;
  const new993Reduction = input.reductions?.find((r) => r.type === "new_99_3");
  let new993PreliminaryResult: New993Result | undefined;
  if (new993Reduction && new993Reduction.type === "new_99_3") {
    // Round 9 정정 (2026-05-06): contractDate 우선순위
    //   1) reduction.contractDate993 (legacy 이력 호환, 1개월 alias 후 제거)
    //   2) input.assetContractDate (자산-수준 매매계약일 — 상단 입력)
    const effectiveContractDate = new993Reduction.contractDate993
      ? new Date(new993Reduction.contractDate993)
      : input.assetContractDate;
    new993PreliminaryResult = evaluateNew993({
      transferDate: input.transferDate,
      acquisitionDate: input.acquisitionDate,
      contractDate: effectiveContractDate,
      usageApprovalDate: new993Reduction.usageApprovalDate993 ? new Date(new993Reduction.usageApprovalDate993) : undefined,
      transferIncome: transferIncomeBefore993,
      standardPriceAtAcquisition: new993Reduction.standardPriceAtAcquisition993 ?? 0,
      standardPriceAt5Years: new993Reduction.standardPriceAt5Years ?? 0,
      standardPriceAtTransfer:
        new993Reduction.standardPriceAtTransfer993 ?? input.standardPriceAtTransfer ?? 0,
      transferPrice: input.transferPrice,
      exclusiveAreaSqm: 0, // 자산 면적 정보가 별도 — 고가주택 면적 기준은 호출자에서 사전 검증 권장
      region: new993Reduction.region993 ?? "outside_speculation",
      isResident: new993Reduction.isResident993 ?? true,
      isHousingConstructionBusiness: new993Reduction.isHousingConstructionBusiness993 ?? false,
      acquisitionType: new993Reduction.acquisitionType993 ?? "from_builder",
      hasOccupancyAtContract: new993Reduction.hasOccupancyAtContract,
      // 농특세는 STEP 7 산출세액 계산 후 별도로 재계산 (preliminary는 placeholder 0)
      calculatedTaxBeforeReduction: 0,
      calculatedTaxAfterReduction: 0,
    });
    if (new993PreliminaryResult.isEligible) {
      transferIncome = Math.max(0, transferIncomeBefore993 - new993PreliminaryResult.reducibleTransferIncome);
      steps.push({
        label: "§99의3 신축주택 과세특례 — 양도소득금액 차감",
        formula: `양도소득금액 ${transferIncomeBefore993.toLocaleString()} - 감면 양도소득금액 ${new993PreliminaryResult.reducibleTransferIncome.toLocaleString()} = ${transferIncome.toLocaleString()}`,
        amount: transferIncome,
        legalBasis: "조특법 §99의3",
      });
    } else {
      steps.push({
        label: "§99의3 신축주택 과세특례 — 적용 불가",
        formula: new993PreliminaryResult.ineligibleReasons.map((r) => r.message).join(" · "),
        amount: 0,
        legalBasis: "조특법 §99의3",
      });
    }
  }

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
      formula: `연 한도 ${parsedRates.basicDeductionRules.annualLimit.toLocaleString()} - 기사용 ${input.annualBasicDeductionUsed.toLocaleString()}`,
      amount: basicDeduction,
      legalBasis: TRANSFER.BASIC_DEDUCTION,
    });
  }

  // STEP 6: 과세표준 = 양도소득금액 − 기본공제 (소득세법 §92 — 원 단위, 절사 규정 없음)
  const taxBase = Math.max(0, transferIncome - basicDeduction);
  steps.push({
    label: "과세표준",
    formula: `양도소득금액 ${transferIncome.toLocaleString()} - 기본공제 ${basicDeduction.toLocaleString()}`,
    amount: taxBase,
    legalBasis: TRANSFER.TAX_BASE_CALC,
  });

  // STEP 7: 산출세액
  // selfOwns="land_only" 시 단기/장기 세율 판정은 토지 취득일 기준 (소령 §166⑥)
  const taxRateInput = selfOwns === "land_only" && effectiveInput.landAcquisitionDate
    ? { ...effectiveInput, acquisitionDate: effectiveInput.landAcquisitionDate }
    : effectiveInput;
  const taxResult = calcTax(taxBase, parsedRates, taxRateInput, multiHouseSurchargeResult);
  const fmtPct = (r: number) => `${Math.round(r * 100)}%`;
  steps.push({
    label: "산출세액",
    formula: `과세표준 ${taxBase.toLocaleString()} × 세율 ${fmtPct(taxResult.appliedRate)}${taxResult.surchargeRate ? ` (+중과 ${fmtPct(taxResult.surchargeRate)})` : ""}${taxResult.shortTermNote ? ` (${taxResult.shortTermNote})` : ""}`,
    amount: taxResult.calculatedTax,
    legalBasis: taxResult.surchargeRate ? TRANSFER.SURCHARGE : TRANSFER.TAX_RATE,
  });

  // STEP 7.5 ~ 11/12: 산출세액 이후 단계 통합 (transfer-tax-finalize.ts)
  const finalize = finalizeTransferTax({
    input,
    effectiveInput,
    steps,
    taxResult,
    taxRateInput,
    parsedRates,
    multiHouseSurchargeResult,
    taxableGain,
    longTermHoldingDeduction,
    basicDeduction,
    taxBase,
    estimatedBase,
    transferIncomeBefore993,
    new993PreliminaryResult,
  });
  const {
    new993FinalResult,
    reductionAmount,
    reductionType,
    reductionTypeApplied,
    reducibleIncome,
    rentalReductionDetail,
    newHousingReductionDetail,
    publicExpropriationDetail,
    selfFarmingReductionDetail,
    determinedTax,
    penaltyTax,
    penaltyBase,
    localIncomeTax,
    penaltyDetail,
    totalTax,
  } = finalize;
  return {
    isExempt: false,
    exemptReason: exemptionResult.exemptReason,
    warnings: warnings.length > 0 ? warnings : undefined,
    transferGain,
    taxableGain,
    usedEstimatedAcquisition: usedEstimated,
    estimatedBase: usedEstimated ? estimatedBase : undefined,
    estimatedDeduction: usedEstimated ? estimatedDeduction : undefined,
    expenses: appliedExpenses,
    swapApplied,
    swapComparison,
    capitalExpenditureForDisplay: rawInput.capitalExpenditure ?? 0,
    longTermHoldingDeduction,
    longTermHoldingRate,
    lthdStartDate: resolveLTHDStartDate(effectiveInput),
    basicDeduction,
    taxBase,
    appliedRate: taxResult.appliedRate,
    progressiveDeduction: taxResult.progressiveDeduction,
    calculatedTax: taxResult.calculatedTax,
    surchargeType: taxResult.surchargeType,
    surchargeRate: taxResult.surchargeRate,
    isSurchargeSuspended: taxResult.surchargeSuspended,
    shortTermNote: taxResult.shortTermNote,
    reductionAmount,
    reductionType,
    reductionTypeApplied,
    reducibleIncome,
    determinedTax,
    penaltyTax,
    penaltyBase,
    localIncomeTax,
    totalTax,
    steps,
    multiHouseSurchargeDetail: multiHouseSurchargeResult ? buildMultiHouseSurchargeDetail(multiHouseSurchargeResult) : undefined,
    nonBusinessLandJudgmentDetail: nonBusinessLandJudgment,
    rentalReductionDetail,
    newHousingReductionDetail,
    publicExpropriationDetail,
    selfFarmingReductionDetail,
    penaltyDetail,
    pre1990LandValuationDetail: pre1990LandResult,
    splitDetail: splitDetail ?? undefined,
    preHousingDisclosureDetail: splitDetail?.preHousingDisclosureDetail,
    inheritedAcquisitionDetail: inheritedAcquisitionStep?.result,
    inheritedHouseValuationDetail: inheritedAcquisitionStep?.houseValuationResult,
    carryoverTaxationDetail: carryoverDetail,
    new993Detail: new993FinalResult,
    commercialBuildingValuationDetail: cbStep?.detail,
    transferBurdenedGiftBreakdown,
  };
}
