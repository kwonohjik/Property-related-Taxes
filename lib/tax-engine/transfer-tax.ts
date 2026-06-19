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
  isSurchargeSuspended,
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
import { runRentalHousingExceptionStep } from "./transfer-tax-rental-housing-step";
import type { New993Result } from "./transfer-reductions/new-99-3";
import {
  resolveIncomeDeduction,
  resolveSurchargeExclusionByReduction,
  buildIncomeDeductionStep,
  buildSurchargeExclusionStep,
  RATE_SPECIAL_REDUCTION_IDS,
} from "./transfer-reductions/income-deduction-router";
import { resolveHouseCountExclusion, buildHouseCountExclusionStep } from "./transfer-reductions/unsold-98-9";
import { resolveSpecialHouseExclusions } from "./transfer-reductions/unsold-hybrid-p5";

import {
  parseRatesFromMap,
  checkExemption,
  meetsOneHouseHoldingResidence,
  calcTransferGain,
  calcOneHouseProration,
  calcLongTermHoldingDeduction,
  calcBasicDeduction,
  runCommercialBuildingStep,
  type CommercialBuildingStepResult,
} from "./transfer-tax-helpers";
import { calculateBuildingPenalty, calcTax, handleMultiParcelBranch } from "./transfer-tax-rate-calc";
import { finalizeTransferTax, resolveLTHDStartDate, buildTransferResultDetails } from "./transfer-tax-finalize";
import { isRedevelopmentActive, calculateRedevelopmentTax } from "./transfer-tax-redevelopment";
import { calcCarryoverScenarios } from "./transfer-tax-carryover";
import { runBurdenedGiftStep } from "./transfer-tax-burdened-gift-step";
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

  // STEP 0.48 부담부증여 §159 — 800줄 정책 분리 (P5): runBurdenedGiftStep
  const bgStep = runBurdenedGiftStep(rawInput, workingInput, steps, warnings);
  const transferBurdenedGiftBreakdown = bgStep.breakdown;
  workingInput = bgStep.workingInput;

  // STEP 0.45: 차감형 감면주택(§99의3·§99·§98의8) 중과 배제 선판정 — 소령 §167의3①5호·§167의10①2호.
  // 적격 시 양도 주택에 isTaxSpecialExemption 주입 → 기존 중과 엔진 경로로 배제 (D-11 자동화).
  //
  // 입력은 원본 `input` 기준 — STEP 4.6 본판정(resolveIncomeDeduction(input, ...))과 동일하게 맞춘다.
  // 감면 요건의 "취득일·5년 보유"는 양도자가 그 주택을 실제 취득한 날 기준이다. 이월과세(소득세법
  // §97의2①)는 "양도차익 계산상 필요경비(취득가액)"만 증여자 취득 당시 금액으로 의제할 뿐 취득시기를
  // 의제하지 않으므로(보유기간 승계는 §95④·§104② 별도 명문, 감면 5년에는 미적용), workingInput의
  // 증여자 취득일(carryover.ts donorAcquisitionDate)로 감면을 판정하면 선판정·본판정이 어긋난다 (리뷰 M-2).
  const surchargeExclusionByReduction = resolveSurchargeExclusionByReduction(input.reductions, {
    transferDate: input.transferDate,
    acquisitionDate: input.acquisitionDate,
    assetContractDate: input.assetContractDate,
    transferPrice: input.transferPrice,
    standardPriceAtTransfer: input.standardPriceAtTransfer,
  });

  // STEP 0.5: 다주택 중과세 판정 (houses[] 제공 + 주택 수 산정 규칙 로드 완료 시)
  let multiHouseSurchargeResult: MultiHouseSurchargeResult | undefined;
  if (workingInput.houses && workingInput.houses.length > 0 && parsedRates.houseCountExclusionRules) {
    const sellingId = workingInput.sellingHouseId ?? workingInput.houses[0].id;
    const housesForSurcharge = surchargeExclusionByReduction.excluded
      ? workingInput.houses.map((h) => (h.id === sellingId ? { ...h, isTaxSpecialExemption: true } : h))
      : workingInput.houses;
    if (surchargeExclusionByReduction.excluded) steps.push(buildSurchargeExclusionStep(surchargeExclusionByReduction));
    const mhInput: MultiHouseSurchargeInput = {
      houses: housesForSurcharge,
      sellingHouseId: sellingId,
      transferDate: workingInput.transferDate,
      isOneHousehold: workingInput.isOneHousehold,
      temporaryTwoHouse: workingInput.multiHouseTemporaryTwoHouse,
      marriageMerge: workingInput.marriageMerge,
      parentalCareMerge: workingInput.parentalCareMerge,
      presaleRights: workingInput.presaleRights ?? [],
      gracePeriod: workingInput.gracePeriod,
      // §154① 보유·거주 요건 precompute (배제2 §155⑤ 의제 게이트). 미산정 시 undefined → 엔진 충족 간주
      sellingHouseMeetsOneHouseRequirements: parsedRates.oneHouseSpecialRules
        ? meetsOneHouseHoldingResidence(
            workingInput,
            parsedRates.oneHouseSpecialRules.one_house_exemption,
          )
        : undefined,
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
    // 판정 결과로 isNonBusinessLand override + 단일 필지 기준면적 초과분 면적안분 비율(목장 §168의10③·기타토지 §168의11①, F3) 항상 주입
    // (입력 플래그=true·판정=true 케이스도 부분안분이 반영되도록 if 밖에서 갱신)
    effectiveInput = {
      ...workingInput,
      isNonBusinessLand: nonBusinessLandJudgment.isNonBusinessLand,
      nonBusinessLandAreaRatio: nonBusinessLandJudgment.surcharge.nonBusinessAreaRatio,
    };
    // [I5] 입력 플래그와 판정 결과가 다를 때만 step 경고 기록
    if (nonBusinessLandJudgment.isNonBusinessLand !== workingInput.isNonBusinessLand) {
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

  // STEP 0.9: §99의4·§98의9 주택수 제외 (소법 §89①3호 의제) — §99의4 우선 1건(F-4) 적용,
  // 비과세·12억 안분·LTHD 표2에 유효 주택수(count−1) 반영. 중과는 §167의3 별개 — 원본(R-D).
  const { applied: hceApplied, new994Detail, unsold989Detail } = resolveHouseCountExclusion(
    effectiveInput.reductions,
    { generalHouseAcquisitionDate: effectiveInput.acquisitionDate, transferDate: effectiveInput.transferDate },
  );
  // STEP 0.95 (P5 모드 2): 보유 감면주택 N-way 주택수 제외 — 7개 조문 ② + §98 령②·⑥ + §99②.
  // 비과세(§89①3호) 판정 주택수만 차감 — 중과 주택수는 원본 유지 (R-D).
  const specialHouseExclusionDetail = resolveSpecialHouseExclusions(
    effectiveInput.specialHouseExclusions,
    effectiveInput.transferDate,
  );
  const totalExcluded = (hceApplied ? 1 : 0) + specialHouseExclusionDetail.excludedCount;
  const exemptionJudgeInput = totalExcluded > 0
    ? { ...effectiveInput, householdHousingCount: Math.max(effectiveInput.householdHousingCount - totalExcluded, 0) }
    : effectiveInput;
  if (hceApplied) {
    steps.push(buildHouseCountExclusionStep(hceApplied, effectiveInput.householdHousingCount, Math.max(effectiveInput.householdHousingCount - 1, 0)));
  }
  if (specialHouseExclusionDetail.excludedCount > 0) {
    steps.push({
      label: "보유 감면주택 주택수 제외 (§89①3호 의제)",
      formula: `${specialHouseExclusionDetail.entries.filter((e) => e.eligible).map((e) => e.articleLabel).join(" · ")} — 주택수 ${effectiveInput.householdHousingCount} → ${exemptionJudgeInput.householdHousingCount} (비과세 판정 한정 — 중과 주택수 불변)`,
      amount: 0,
      legalBasis: specialHouseExclusionDetail.entries.filter((e) => e.eligible).map((e) => e.legalBasis).join(" · "),
    });
  }

  const exemptionResult = checkExemption(exemptionJudgeInput, parsedRates.oneHouseSpecialRules);

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
      new994Detail, // §99의4 주택수 제외가 비과세 근거인 경우 카드 표시 (추징 경고 포함)
      unsold989Detail, // §98의9 동일 (종부세 안내·F-4 경고 포함)
      specialHouseExclusionDetail:
        specialHouseExclusionDetail.entries.length > 0 ? specialHouseExclusionDetail : undefined,
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
      ...buildTransferResultDetails({
        multiHouseSurchargeResult,
        nonBusinessLandJudgment,
        pre1990LandResult,
        carryoverDetail,
        inheritedAcquisitionStep,
      }),
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
      ...buildTransferResultDetails({
        multiHouseSurchargeResult,
        nonBusinessLandJudgment,
        pre1990LandResult,
        carryoverDetail,
        inheritedAcquisitionStep,
        cbStep,
        splitDetail,
      }),
    };
  }

  // STEP 2.5: 장기임대주택 보유자 거주주택 비과세 특례 (소령 §155⑳ + §161)
  // gain 계산 완료 후 실행. applied=true 시 특례 결과로 즉시 반환(STEP 3 이후 생략),
  // false 시 미적용 사유만 steps에 기록하고 일반 경로 계속. (구현: transfer-tax-rental-housing-step.ts)
  if (effectiveInput.rentalHousingException?.applyException) {
    const rheResult = runRentalHousingExceptionStep({
      effectiveInput,
      input,
      transferGain,
      usedEstimated,
      estimatedBase,
      estimatedDeduction,
      parsedRates,
      multiHouseSurchargeResult,
      steps,
    });
    if (rheResult) return rheResult;
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
  // 입력 참조는 effectiveInput으로 통일 — 최종 파생 입력(carryover·부담부·NBL·상업용 반영).
  // 현재 8필드(propertyType·지역·주택수·1주택·거주·기본공제)는 파생 STEP이 불변이라 동치이나,
  // 향후 파생 STEP이 주택수·지역을 바꿔도 silent 오류가 없도록 effectiveInput 고정.
  const isSurchargeCase = multiHouseSurchargeResult
    ? multiHouseSurchargeResult.surchargeType !== "none"
    : (effectiveInput.propertyType === "housing" || effectiveInput.propertyType === "right_to_move_in" || effectiveInput.propertyType === "presale_right") &&
      effectiveInput.isRegulatedArea &&
      effectiveInput.householdHousingCount >= 2;

  const effectiveHouseCount = multiHouseSurchargeResult
    ? multiHouseSurchargeResult.effectiveHouseCount
    : effectiveInput.householdHousingCount;
  const surchargeTypeKey = effectiveHouseCount >= 3 ? "multi_house_3plus" : "multi_house_2";
  const suspendedResult = multiHouseSurchargeResult
    ? multiHouseSurchargeResult.isSurchargeSuspended
    : isSurchargeCase
      ? isSurchargeSuspended(parsedRates.surchargeSpecialRules, input.transferDate, surchargeTypeKey)
      : false;

  // STEP 4: 장기보유특별공제 (장기임대 특례율 포함 — §97의3·§97의4는 L-2' 블록)
  // §99의4 eligible 시 exemptionJudgeInput(유효 주택수) 전달 — 표2 판정도 §89①3호 의제 체인
  // (소령 §159의4 "그 밖의 규정에 따라 1세대 1주택으로 보는 주택 포함"). 중과 isSurchargeCase는 원본(R-D).
  // eslint-disable-next-line prefer-const -- deduction·rate는 STEP 4.05 §98의2 특칙에서 재할당
  let { deduction: longTermHoldingDeduction, rate: longTermHoldingRate, holdingPeriod, rental97LthdDetail } =
    calcLongTermHoldingDeduction(taxableGain, exemptionJudgeInput, parsedRates.longTermHoldingRules, isSurchargeCase, suspendedResult, parsedRates.longTermRentalRules, splitDetail);
  // STEP 4.05: §98의2 특칙 — 장특 = 양도차익 × §95② 표2 보유기간별 공제율 강제 (법 ①1호, P4).
  // 적격 선판정은 STEP 0.45 (중과 배제 5호 열거 — 동일 신호). 1세대1주택 표2(보유+거주)는
  // ①의 "각 표 외의 부분 본문 불구" 범위 밖 — 특례 적용 시 유지 (항상 ≥ 표2 보유 단독).
  let lthd982Applied = false;
  if (surchargeExclusionByReduction.appliedId === "unsold_98_2") {
    const isOneHouseSpecial982 =
      exemptionJudgeInput.isOneHousehold &&
      exemptionJudgeInput.householdHousingCount === 1 &&
      Math.floor(effectiveInput.residencePeriodMonths / 12) >= 2 &&
      longTermHoldingDeduction > 0;
    if (!isOneHouseSpecial982) {
      const rate982 = holdingPeriod.years >= 3 ? Math.min(holdingPeriod.years * 0.04, 0.4) : 0;
      longTermHoldingDeduction = applyRate(taxableGain, rate982);
      longTermHoldingRate = rate982;
      lthd982Applied = true;
    }
  }
  const holdingPeriodStr = holdingPeriod.years > 0 || holdingPeriod.months > 0
    ? `보유기간 ${holdingPeriod.years}년 ${holdingPeriod.months}개월`
    : "";
  // 1세대1주택 특례 여부에 따라 계산식 분리 표시 (LTHD 계산 입력과 동일 기준 — §99의4 반영)
  const residenceYearsForStep = Math.floor(effectiveInput.residencePeriodMonths / 12);
  const isOneHouseSpecial =
    exemptionJudgeInput.isOneHousehold &&
    exemptionJudgeInput.householdHousingCount === 1 &&
    residenceYearsForStep >= 2 &&
    longTermHoldingDeduction > 0;
  const lthdFormulaRate = lthd982Applied
    ? `§98의2 특칙 — 표2 보유 ${holdingPeriod.years}년×4% = ${Math.round(longTermHoldingRate * 100)}% (40% 한도, 법 §98의2①1호)`
    : isOneHouseSpecial
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

  // STEP 4.6: 차감형 감면(§99의3·§99·§98의8) — 양도소득금액 차감 방식 (income-deduction-router)
  // 5년 내 = 발생분 전액(§98의8은 50%) / 5년 후 = 기준시가 안분. 농특세는 finalize 2-pass.
  let transferIncome = transferIncomeBefore993;
  const incomeDeduction = resolveIncomeDeduction(input.reductions, {
    transferDate: input.transferDate,
    acquisitionDate: input.acquisitionDate,
    assetContractDate: input.assetContractDate,
    transferPrice: input.transferPrice,
    standardPriceAtTransfer: input.standardPriceAtTransfer,
    transferIncome: transferIncomeBefore993,
  });
  const new993PreliminaryResult: New993Result | undefined = incomeDeduction.new993Detail;
  if (incomeDeduction.appliedId) {
    transferIncome = Math.max(0, transferIncomeBefore993 - incomeDeduction.reducible);
  }
  if (incomeDeduction.stepLabel) {
    steps.push(buildIncomeDeductionStep(incomeDeduction, transferIncomeBefore993, transferIncome));
  }

  // STEP 5: 기본공제 (aggregate 엔진에서 호출 시 skipBasicDeduction=true로 스킵)
  const basicDeduction = effectiveInput.skipBasicDeduction
    ? 0
    : calcBasicDeduction(
        taxableGain,
        longTermHoldingDeduction,
        effectiveInput.annualBasicDeductionUsed,
        effectiveInput.isUnregistered,
        parsedRates.basicDeductionRules,
      );
  if (!effectiveInput.skipBasicDeduction) {
    steps.push({
      label: "기본공제",
      formula: `연 한도 ${parsedRates.basicDeductionRules.annualLimit.toLocaleString()} - 기사용 ${effectiveInput.annualBasicDeductionUsed.toLocaleString()}`,
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
  // P3 특칙: §98의3④·§98의5③·§98의6③ — 적격 시 단기세율(§104①2·3호) 배제 (세율 §104①1호 강제)
  const rateSpecialActive =
    incomeDeduction.eligibleId !== undefined &&
    RATE_SPECIAL_REDUCTION_IDS.includes(incomeDeduction.eligibleId);
  const taxRateInputBase = selfOwns === "land_only" && effectiveInput.landAcquisitionDate
    ? { ...effectiveInput, acquisitionDate: effectiveInput.landAcquisitionDate }
    : effectiveInput;
  // P5: §98①1호 — 세율 20% 단일 강제 (§104① 불구)
  const flatRate20Active = incomeDeduction.eligibleId === "unsold_98";
  const taxRateInput = flatRate20Active
    ? { ...taxRateInputBase, forceFlatRate20: true }
    : rateSpecialActive
      ? { ...taxRateInputBase, suppressShortTermRate: true }
      : taxRateInputBase;
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
    new99PreliminaryResult: incomeDeduction.new99Detail,
    unsold988PreliminaryResult: incomeDeduction.unsold988Detail,
    unsold987PreliminaryResult: incomeDeduction.unsold987Detail,
    unsold992PreliminaryResult: incomeDeduction.unsold992Detail,
    unsold983PreliminaryResult: incomeDeduction.unsold983Detail,
    unsold985PreliminaryResult: incomeDeduction.unsold985Detail,
    unsold986PreliminaryResult: incomeDeduction.unsold986Detail,
    unsold982PreliminaryResult: incomeDeduction.unsold982Detail,
    unsold984PreliminaryResult: incomeDeduction.unsold984Detail,
    unsold98PreliminaryResult: incomeDeduction.unsold98Detail,
  });
  const {
    new993FinalResult,
    new99FinalResult,
    unsold988FinalResult,
    unsold987FinalResult,
    unsold992FinalResult,
    unsold983FinalResult,
    unsold985FinalResult,
    unsold986FinalResult,
    unsold982FinalResult,
    unsold984FinalResult,
    unsold98FinalResult,
    reductionAmount,
    reductionType,
    reductionTypeApplied,
    reducibleIncome,
    rentalReductionDetail,
    newHousingReductionDetail,
    publicExpropriationDetail,
    selfFarmingReductionDetail,
    rental97TaxDetail,
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
    ...buildTransferResultDetails({
      multiHouseSurchargeResult,
      nonBusinessLandJudgment,
      pre1990LandResult,
      carryoverDetail,
      inheritedAcquisitionStep,
      cbStep,
      splitDetail,
    }),
    rentalReductionDetail,
    newHousingReductionDetail,
    publicExpropriationDetail,
    selfFarmingReductionDetail,
    rental97LthdDetail,
    rental97TaxDetail,
    new994Detail,
    unsold989Detail,
    penaltyDetail,
    new993Detail: new993FinalResult,
    new99Detail: new99FinalResult,
    unsold988Detail: unsold988FinalResult,
    unsold987Detail: unsold987FinalResult,
    unsold992Detail: unsold992FinalResult,
    unsold983Detail: unsold983FinalResult,
    unsold985Detail: unsold985FinalResult,
    unsold986Detail: unsold986FinalResult,
    unsold982Detail: unsold982FinalResult,
    unsold984Detail: unsold984FinalResult,
    unsold98Detail: unsold98FinalResult,
    specialHouseExclusionDetail:
      specialHouseExclusionDetail.entries.length > 0 ? specialHouseExclusionDetail : undefined,
    transferBurdenedGiftBreakdown,
  };
}
