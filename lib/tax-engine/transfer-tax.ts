/**
 * 양도소득세 순수 계산 엔진
 *
 * Layer 2 (Pure Engine): DB 직접 호출 없음.
 * 모든 세율 데이터는 TaxRatesMap으로 주입받아 순수 함수로 계산.
 *
 * P0-2 원칙: 세율 × 금액 곱셈은 반드시 applyRate() 사용.
 */
import { TRANSFER } from "./legal-codes";
import {
  applyRate,
  isSurchargeSuspended,
} from "./tax-utils";
import {
  type Pre1990LandValuationResult,
  calculatePre1990LandValuation,
} from "./pre-1990-land-valuation";
import type { TaxRatesMap } from "@/lib/db/tax-rates";
import {
  runInheritedAcquisitionStep,
  resolveInheritedRedevelopmentAcqPrice,
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
import { runRentalHousingExceptionStep, isPrhpScenarioB, canEarlyReturnPrhp } from "./transfer-tax-rental-housing-step";
import type { New993Result } from "./transfer-reductions/new-99-3";
import {
  resolveIncomeDeduction,
  resolveSurchargeExclusionByReduction,
  buildIncomeDeductionStep,
  RATE_SPECIAL_REDUCTION_IDS,
} from "./transfer-reductions/income-deduction-router";
import { runHouseCountExclusionStep } from "./transfer-tax-house-exclusion-step";
import { runMultiHouseSurchargeStep, runNonBusinessLandStep, runCommercialAppurtenantLandStep } from "./transfer-tax-judgment-steps";
import { pushLongTermHoldingSteps } from "./transfer-tax-lthd-steps";

import {
  parseRatesFromMap,
  checkExemption,
  resolveExemptionResidenceMonths,
  calcTransferGain,
  calcLongTermHoldingDeduction,
  calcBasicDeduction,
  applyCommercialBuildingStep,
} from "./transfer-tax-helpers";
import { emitPenaltySteps } from "./transfer-tax-helpers";
import { calculateBuildingPenalty, resolveExtensionPenaltyBase } from "./transfer-tax-building-penalty";
import { handleMultiParcelBranch } from "./transfer-tax-multi-parcel-branch";
import { resolveSplitAwareTax, buildCalculatedTaxStep, hasHousingLandExemptExclusion } from "./transfer-tax-split-rate";
import { resolveTaxableGain, buildGainFormula } from "./transfer-tax-taxable-gain";
import { finalizeTransferTax, resolveLTHDStartDate, buildTransferResultDetails, buildExemptEarlyResult } from "./transfer-tax-finalize";
import { computeAmendment } from "./transfer-tax-amendment";
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
      // standardPriceAtTransfer는 rawInput에서 유지 (form 입력값 — 양도시 기준시가 총액).
      // 서브엔진(pre-1990-land-valuation)은 더 이상 양도시 기준시가를 산출하지 않음.
      // rawInput.standardPriceAtTransfer = 상위 폼에서 사용자가 입력한 양도시 기준시가(㎡당 × 면적).
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

  /**
   * STEP 0.48 부담부증여 §159 — 800줄 정책 분리 (P5): runBurdenedGiftStep
   *
   * 🔴 **§159의 입력 소스는 `rawInput`이 원칙이되, 이월과세가 교체했으면 그쪽이 정본이다**
   * (2026-08-10 D-7a). `runBurdenedGiftStep`은 §159 산정에 필요한 값을 첫 인자에서 읽는데,
   * 종전에는 그것이 항상 `rawInput`이라 STEP 0.475가 만든 **시나리오 A의 입력이 통째로
   * 무시**됐다 — 시나리오 A 내부 재귀 호출에서는 반영되는데 **채택 후 본 계산에서는 사라져**,
   * 「비교는 A로 이겨 놓고 세액은 B로 내는」 상태가 된다.
   *
   * 교체 대상 3개는 모두 §97의2①이 직접 정한 것이다:
   *   · `burdenedGiftInfo`      — 취득가액(1호) + 증여세 상당액(3호) 전달분
   *   · `capitalExpenditure`    — 당초 증여자 자본적지출 합산분(2호). K-4가 읽는다
   *   · `transferExpense`       — 위와 짝(§100② 성질별 안분에서 함께 쓰인다)
   *
   * 이월과세를 타지 않으면(`carryoverDetail` undefined) 종전과 **완전히 동일**하다.
   */
  const bgSourceInput: TransferTaxInput = carryoverDetail
    ? {
        ...rawInput,
        burdenedGiftInfo: workingInput.burdenedGiftInfo,
        capitalExpenditure: workingInput.capitalExpenditure,
        transferExpense: workingInput.transferExpense,
      }
    : rawInput;
  const bgStep = runBurdenedGiftStep(bgSourceInput, workingInput, steps, warnings);
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

  const multiHouseSurchargeResult = runMultiHouseSurchargeStep(
    workingInput,
    parsedRates,
    steps,
    surchargeExclusionByReduction,
  );

  // eslint-disable-next-line prefer-const -- effectiveInput은 후속 STEP에서 파생 입력으로 재할당
  let { nonBusinessLandJudgment, effectiveInput } = runNonBusinessLandStep(
    workingInput,
    parsedRates,
    steps,
  );

  // STEP 0.62: 상업용건물·오피스텔 부수토지 기준면적 초과분 비사업용 판정
  // (「지방세법 시행령」 §101①2호·§101②). commercialAppurtenantLand 미제공 시 no-op.
  // STEP 0.35(:249 CB 환산)보다 **먼저** 실행되지만, 그 STEP이 spread로 재구성하므로
  // 여기서 주입한 isNonBusinessLand·nonBusinessLandAreaRatio는 보존된다.
  effectiveInput = runCommercialAppurtenantLandStep(effectiveInput, steps);

  // STEP 0.65: 재개발/재건축 분기 — 시행령 §166. STEP 1: 비과세 판단
  if (isRedevelopmentActive(effectiveInput.propertyType, effectiveInput.redevelopment)) {
    // 상속 종전자산: §163⑨ 상속개시일 평가액이 확인되면 취득가액이 "확인 가능"하므로 §166③ 환산·
    // §163⑥ 개산공제를 배제하고 실가(상속평가액)를 종전자산 취득가액으로 사용한다(§166③은 취득가액
    // 확인 불가 시에만 적용). 미확인 시 override 미발동 → 현행 §166③ 유지.
    let redevInput = effectiveInput;
    if (effectiveInput.acquisitionCause === "inheritance") {
      const inhAcqPrice = resolveInheritedRedevelopmentAcqPrice(inheritedAcquisitionStep);
      if (inhAcqPrice !== null) {
        redevInput = { ...effectiveInput, acquisitionPrice: inhAcqPrice, useEstimatedAcquisition: false };
      }
    }
    return calculateRedevelopmentTax(redevInput, parsedRates, steps);
  }

  // STEP 0.9 + 0.95: 주택수 제외(§99의4·§98의9·보유 감면주택·상속주택) → 비과세 판정용 유효 주택수 산정.
  // 800줄 정책 분리 — runHouseCountExclusionStep (transfer-tax-house-exclusion-step.ts).
  const { exemptionJudgeInput, new994Detail, unsold989Detail, specialHouseExclusionDetail } =
    runHouseCountExclusionStep(effectiveInput, steps);

  const exemptionResult = checkExemption(exemptionJudgeInput, parsedRates.oneHouseSpecialRules);

  // §155⑦3호 귀농주택 — ⑪(귀농 후 최초 1개 일반주택 한정)·⑫(귀농일부터 3년 영농·거주 사후관리)는
  //   과거·미래 양도 이력이 있어야 판정할 수 있어 엔진이 결론 낼 수 없다. 자동 판정 대신 경고로 노출한다
  //   (자동 안분 fallback 금지 원칙과 다른 층위 — 임의 배분이 아니라 **판정 불가 고지**다).
  if (exemptionResult.exemptReason?.includes("§155⑦3호") ) {
    warnings.push(
      "귀농주택 특례(§155⑦3호) — ⑪ 귀농 후 **최초로 양도하는 1개** 일반주택에만 적용됩니다. " +
        "또한 §155⑫에 따라 귀농일부터 3년 이상 영농·영어에 종사하지 않거나 그 기간 거주하지 않으면 " +
        "사유 발생일이 속하는 달의 말일부터 2개월 이내에 감면세액을 신고·납부해야 합니다(추징).",
    );
  }

  // STEP 1a: 전액 비과세 조기 반환. §155⑳ B(→STEP 2.5 §161 안분)·A eligibility 미충족(→STEP 2.5 정상과세)은 억제.
  // G-2·G-3: 부수토지 중 배율 초과분(비사업용 토지)·보유 2년 미만분은 비과세 대상이 아니다 —
  //      조기 반환하면 과세할 토지분이 사라지므로 정상 경로로 흘려 STEP 3에서 분리한다(§5.2·§5.4).
  if (exemptionResult.isExempt && canEarlyReturnPrhp(effectiveInput) && !hasHousingLandExemptExclusion(effectiveInput)) {
    steps.push({
      label: "1세대1주택 비과세",
      formula: exemptionResult.exemptReason ?? "비과세",
      amount: 0,
      legalBasis: TRANSFER.ONE_HOUSE_EXEMPT,
    });
    return buildExemptEarlyResult({
      input,
      effectiveInput,
      steps,
      exemptReason: exemptionResult.exemptReason,
      new994Detail,
      unsold989Detail,
      specialHouseExclusionDetail:
        specialHouseExclusionDetail.entries.length > 0 ? specialHouseExclusionDetail : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
      multiHouseSurchargeResult,
      nonBusinessLandJudgment,
      pre1990LandResult,
      carryoverDetail,
      inheritedAcquisitionStep,
    });
  }

  // STEP 0.35: 상업용건물·오피스텔 환산취득가 (소령 §164⑥ + §176조의2②2호 + §164⑨ 수용 특례).
  // 성공 시 effectiveInput을 실가 경로로 교체 (helpers로 추출 — 800줄 정책).
  const cbApplied = applyCommercialBuildingStep(effectiveInput);
  effectiveInput = cbApplied.effectiveInput;
  const cbStep = cbApplied.cbStep;

  // STEP 1.5: 다필지 분리 계산 (환지·합병 등)
  const mpBranchResult = handleMultiParcelBranch(
    { rawInput, effectiveInput, input, parsedRates, multiHouseSurchargeResult, pre1990LandResult, carryoverDetail, options },
    steps,
  );
  if (mpBranchResult) return mpBranchResult;
  // STEP 2: 양도차익 계산
  const { gain: rawGain, usedEstimated, estimatedBase, estimatedDeduction, expenses: appliedExpenses, splitDetail, swapApplied: gainSwapApplied, swapComparison: gainSwapComparison, expropriationValuationDetail: gainExprDetail, auctionValuationDetail, housingExpropriationValuationDetail } = calcTransferGain(effectiveInput);
  // 상가(CB) swap은 STEP 0.35 재구성 지점(단건 엔진 밖)에서 판정 → cbStep에서 result로 승격.
  // (calcTransferGain은 CB를 실가 모드로 보므로 swapApplied를 내지 않는다.)
  const swapApplied = gainSwapApplied || cbStep?.swapApplied;
  const swapComparison = gainSwapComparison ?? cbStep?.swapComparison;
  // 상가(CB) 경로는 STEP 0.35에서 useEstimatedAcquisition=false로 교체돼 calcTransferGain이
  // 특례 detail을 내지 않는다 → cbStep의 산출근거를 result로 승격(§164⑨ CB 배선, D16).
  const expropriationValuationDetail = gainExprDetail ?? cbStep?.expropriationValuationDetail;
  // 소유자 분리: 본인 신고분 양도차익만 추출 (소령 §166⑥, §168②)
  // splitDetail이 있고 selfOwns !== "both" 이면 본인 소유 파트의 gain만 사용
  const selfOwns = effectiveInput.selfOwns ?? "both";
  const ownerRawGain = splitDetail && selfOwns !== "both"
    ? (selfOwns === "building_only" ? splitDetail.building.gain : splitDetail.land.gain)
    : rawGain;

  // STEP 2a: 손실 → 0 (aggregate 엔진에서 skipLossFloor=true 시 음수 허용 — §102② 통산용)
  const transferGain = input.skipLossFloor ? ownerRawGain : Math.max(0, ownerRawGain);
  // 양도차익 산출근거 — 파생 입력(effectiveInput) 기준 통일. 경비는 실제 적용 필요경비(appliedExpenses).
  // (원본 input 기준 시 CB 환산은 취득가·개산공제가 0, §97② swap은 개산공제가 실제 경비와 어긋나 산식 불일치.)
  const gainFormula = buildGainFormula({
    swapApplied,
    useEstimatedAcquisition: effectiveInput.useEstimatedAcquisition,
    transferPrice: effectiveInput.transferPrice,
    acquisitionPrice: effectiveInput.acquisitionPrice,
    estimatedBase,
    appliedExpenses,
  });
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
    // ⚠️ acquisitionMethod 판정은 effectiveInput 기준 — finalize.ts penaltyBase와 동일 이유·동일 근거
    // (부담부증여는 §159 스텝이 정규화하나 원본 input에는 UI가 보존한 stale 산정방식이 남는다).
    let pb0 = effectiveInput.acquisitionMethod === "appraisal"
      ? (effectiveInput.appraisalValue ?? 0)
      : ((input.useEstimatedAcquisition || effectiveInput.usedEstimatedAcquisition)
          ? (estimatedBase || effectiveInput.estimatedBase || 0)
          : 0);
    // §114조의2① 손실(산출세액 0, ②) 경로도 증축부분 한정 base 적용 — 정상 경로 finalize와 동일 헬퍼(dual-truth 방지)
    pb0 = resolveExtensionPenaltyBase(input, pb0);
    const pr0 = calculateBuildingPenalty(effectiveInput, pb0);
    const pt0 = pr0?.penalty ?? 0;
    const lit0 = pt0 > 0 ? applyRate(pt0, 0.1) : 0;
    if (pt0 > 0) {
      steps.push({ label: "지방소득세", formula: `${pt0.toLocaleString()} × 10%`, amount: lit0, legalBasis: TRANSFER.LOCAL_INCOME_TAX });
    }
    /**
     * 🔑 **양도차손 경로도 국세기본법 §47의2~§47의4 가산세를 싣는다** (2026-08-13 F33).
     *
     * 「소득세법」 §92③3호는 양도소득 **총결정세액**을 「양도소득 결정세액에 제114조의2,
     * 제115조 및 「국세기본법」 제47조의2부터 제47조의4까지에 따른 가산세를 더하여」 계산하도록
     * 정한다. 종전 조기반환은 §114조의2만 싣고 국기법 가산세를 **통째로 버렸다** —
     * `penaltyDetail`이 undefined가 되어 산출근거 표시까지 사라졌다.
     *
     * 결정세액이 0이어도 base가 양수일 수 있는 축이 둘 있다:
     *   · §47의3① — 「초과신고한 **환급세액**」(`filingPenaltyDetails.excessRefundAmount`)
     *   · §47의4①1·2호 — 「납부하지 아니한 세액」·「초과환급받은 세액」(`delayedPaymentDetails.unpaidTax`)
     * 순수 차손이고 초과환급·미납이 없으면 `calculateFilingPenalty`가 base 0으로 0을 반환하므로
     * 종전과 값이 같다(조심 2012서2857 — 통산으로 세액이 소멸해도 그 이전의 과소신고·미납분
     * 가산세는 유지된다. 예정신고·납부의무는 확정신고·납부의무와 별개의 독립적 의무).
     *
     * ⚠️ **지방소득세 base는 §114조의2분(pt0)만이다** — 정상 경로(`transfer-tax-finalize.ts`
     *    STEP 10)·다건 집계(`transfer-tax-aggregate.ts`)와 같은 축을 유지한다. 신고불성실·
     *    납부지연분을 base에 넣으면 「지방세 산출세액 ≠ result.localIncomeTax」 불일치가 생긴다.
     *
     * §114조의2 step은 `emitPenaltySteps`가 「환산가액적용가산세 (§114조의2)」로 통합 emit한다
     * (정상 경로와 동일) — 종전의 별도 「신축·증축 가산세」 push는 여기서 중복이 되므로 없앴다.
     */
    const { penaltyDetail: lossPenaltyDetail, filingDelayedPenalty: lossFilingDelayed } =
      emitPenaltySteps(input, steps, 0, pt0, pb0, pr0?.note);
    const lossTotalTax = pt0 + lit0 + lossFilingDelayed;
    if (lossTotalTax > 0) {
      steps.push({
        label: "총 납부세액",
        formula: `가산세 합계 ${(pt0 + lossFilingDelayed).toLocaleString()} + 지방소득세 ${lit0.toLocaleString()}`,
        amount: lossTotalTax,
        legalBasis: TRANSFER.BUILDING_PENALTY,
      });
    }
    return {
      isExempt: false,
      /**
       * 🔑 **양도차손 경로에도 §89①3호 해당 여부를 실어야 한다** (2026-08-10 D-8).
       *
       * 이 조기반환은 「양도차익 ≤ 0」이라 세액이 0인 것이지 **비과세 판정이 없었던 것이
       * 아니다**. 빠뜨리면 §97의2②2호 자동 판정이 「B는 1세대1주택이 아니다」로 오판해
       * **이월과세를 잘못 배제**한다(anchor OH-2가 이 누락을 잡았다).
       */
      isPartialExempt: exemptionResult.isPartialExempt,
      // [F1] 경정 결과 양도차손(산출세액 0) → 조기반환. refund면 전액환급(determinedTax=0).
      amendmentDetail: input.amendment ? computeAmendment(input.amendment, 0) : undefined,
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
      penaltyBase: pt0 > 0 ? pb0 : 0,
      localIncomeTax: lit0,
      // 국기법 §47의2~§47의4분(lossFilingDelayed)은 지방소득세 base에 넣지 않는다 — 위 주석 참조.
      penaltyDetail: lossPenaltyDetail,
      totalTax: lossTotalTax,
      steps,
      /**
       * 🔴 **양도차손 경로에도 §159 명세를 싣는다** (2026-08-10 D-7a).
       *
       * 종전에는 이 조기반환에만 빠져 있어, 부담부증여로 양도차익이 0 이하가 되면
       * 결과 화면이 **산출근거를 통째로 잃었다**. 이월과세 증여세 상당액 산입(§97의2①3호)은
       * 한도까지 채우면 양도차익이 정확히 0이 되므로 이 경로를 **정상적으로** 탄다.
       */
      transferBurdenedGiftBreakdown,
      // 다건 집계는 `skipLossFloor=true`로 차손 자산도 이 경로를 태운 뒤 세율을 다시 구한다 —
      // 정상 경로와 같은 정밀 판정을 쓰도록 여기서도 echo한다 (F01).
      multiHouseSurchargeEvaluation: multiHouseSurchargeResult,
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
      splitDetail,
      steps,
    });
    if (rheResult) return rheResult;
    // B + applied=false: 특례 부존재면 임대주택 주택수 산입으로 "1채" 전제 무효 가능 — 침묵 비과세 소급 금지.
    if (isPrhpScenarioB(effectiveInput) && exemptionResult.isExempt) {
      warnings.push("장기임대주택 거주주택 특례(§155⑳) 요건 미충족 — 임대주택이 주택수에 산입될 수 있어 1세대1주택 전제(주택수 입력)를 재확인하세요. 일반 과세 경로로 계산되었습니다.");
    }
  }

  // STEP 3: 과세 양도차익 (12억 초과분 안분 — 부분과세인 경우)
  // 우선순위: burdenedGiftDenominator (부담부증여 — 해석 B) > totalPropertyTransferPrice (지분) > transferPrice (단독)
  // F-1 (2026-05-12): effectiveInput 사용 — STEP 0.48 burdenedGiftDenominator 오버라이드 반영.
  const taxableGain = resolveTaxableGain({
    effectiveInput,
    splitDetail,
    transferGain,
    isExempt: exemptionResult.isExempt,
    isPartialExempt: exemptionResult.isPartialExempt,
    steps,
  });

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
  /**
   * 「소득세법 시행령」 §159의4 표2 대상 축 — **§155 각 항 의제를 포함한 「1주택」** (2026-08-13 F10).
   *
   * `runHouseCountExclusionStep`이 §99의4·§98의9·감면주택·§155②③ 상속주택을 이미 주택수에서
   * 차감하지만, §155①(일시적 2주택)·④⑤(합가)·⑦(농어촌)·⑧(수도권 밖 부득이)은 주택수를 깎지 않고
   * `checkExemption` 내부 분기로만 판정한다. 그래서 12억 초과 고가주택 과세분에 표1(최대 30%)이
   * 적용됐다(실측: 표1 16% 총세액 23,633,500 ↔ 표2 64% 총세액 5,838,642).
   *
   * 술어는 **`checkExemption`의 판정 결과 하나**다 — 주택수를 깎는 방식은 `checkExemption`이
   * `householdHousingCount === 2`로 의제 분기를 게이팅하므로 의제 판정 자체를 도달 불가로 만든다.
   * 표2 **대상** 축에만 쓰고 중과·12억 안분 축은 불변이다.
   */
  const deemedOneHouseBy155 = exemptionResult.deemedOneHouseBy155 === true;
  // eslint-disable-next-line prefer-const -- deduction·rate는 STEP 4.05 §98의2 특칙에서 재할당
  let { deduction: longTermHoldingDeduction, rate: longTermHoldingRate, holdingPeriod, rental97LthdDetail, usageConversionDetail, exclusionReason: lthdExclusionReason, fbLthdFormula } =
    calcLongTermHoldingDeduction(taxableGain, exemptionJudgeInput, parsedRates.longTermHoldingRules, isSurchargeCase, suspendedResult, parsedRates.longTermRentalRules, splitDetail, deemedOneHouseBy155);
  // §154⑧3호: 표2 "대상 판정"용 통산 거주연수 (동일세대 상속 통산 반영) — rate calc와 동일 exemptionJudgeInput.
  // 거주분 공제율 표시는 실거주(residenceYearsForStep) 유지 — 대상판정/공제율 분리 (rate↔display drift 방지).
  const table2ResidenceYearsForStep = Math.floor(resolveExemptionResidenceMonths(exemptionJudgeInput) / 12);
  // STEP 4.05: §98의2 특칙 — 장특 = 양도차익 × §95② 표2 보유기간별 공제율 강제 (법 ①1호, P4).
  // 적격 선판정은 STEP 0.45 (중과 배제 5호 열거 — 동일 신호). 1세대1주택 표2(보유+거주)는
  // ①의 "각 표 외의 부분 본문 불구" 범위 밖 — 특례 적용 시 유지 (항상 ≥ 표2 보유 단독).
  let lthd982Applied = false;
  if (surchargeExclusionByReduction.appliedId === "unsold_98_2") {
    // 표2 대상 축은 위 STEP 4와 **같은 술어**를 쓴다 — 여기만 실제 주택수를 보면 §155 의제
    // 자산에서 「STEP 4는 표2인데 §98의2 특칙은 표2가 아니라고 본다」는 세 번째 진실이 생긴다.
    const isOneHouseSpecial982 =
      exemptionJudgeInput.isOneHousehold &&
      (exemptionJudgeInput.householdHousingCount === 1 || deemedOneHouseBy155) &&
      table2ResidenceYearsForStep >= 2 &&
      longTermHoldingDeduction > 0;
    if (!isOneHouseSpecial982) {
      const rate982 = holdingPeriod.years >= 3 ? Math.min(holdingPeriod.years * 0.04, 0.4) : 0;
      longTermHoldingDeduction = applyRate(taxableGain, rate982);
      longTermHoldingRate = rate982;
      lthd982Applied = true;
    }
  }
  pushLongTermHoldingSteps({
    steps,
    taxableGain,
    holdingPeriod,
    longTermHoldingRate,
    longTermHoldingDeduction,
    residenceYearsForStep: Math.floor(effectiveInput.residencePeriodMonths / 12),
    table2ResidenceYearsForStep,
    isOneHousehold: exemptionJudgeInput.isOneHousehold,
    // 표시 축도 계산 축과 맞춘다 — §159의4 의제 1세대1주택은 표2를 적용받으므로 산식 문구도
    // 표2(보유 4% + 거주 4%)여야 한다. 어긋나면 「공제율 64%인데 문구는 표1」 drift가 난다.
    householdHousingCount: deemedOneHouseBy155 ? 1 : exemptionJudgeInput.householdHousingCount,
    lthd982Applied,
    lthdExclusionReason,
    // §95⑤ 적용 시 보유분을 표1+표2로 나눠 표시한다 — 없으면 종전 표2 문구 그대로.
    usageConversionDetail,
    // §95④ 후단(가업상속) 적용 시 공제율 분해 문구로 대체한다.
    fbLthdFormula,
  });

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
    // 고가주택 가액 요건은 물건 전체 기준 — §89 12억 안분(:447-465)과 같은 소스를 쓴다.
    totalPropertyTransferPrice: input.totalPropertyTransferPrice,
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
  // 토지·건물 취득일이 다른 split 자산은 파트별 세율 + §104⑤ 비교과세 (transfer-tax-split-rate.ts)
  const taxResult = resolveSplitAwareTax({ taxBase, transferIncome, basicDeduction, splitDetail, parsedRates, taxRateInput, multiHouseSurchargeResult });
  steps.push(buildCalculatedTaxStep(taxResult, taxBase));

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
    splitDetailForRate: splitDetail,
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
    // §77의3·§77의2 — finalize가 필수로 돌려주는데 종전에는 이 두 키만 구조분해에서 빠져
    // 결과에 실리지 않았다(TransferTaxResult가 optional이라 TS가 못 잡는다). 그 결과
    // 상세 카드·다건 breakdown·별지84호 부표2 ⑲가 모두 undefined를 받았다.
    gbDesignatedLandDetail,
    replacementLandDetail,
    selfFarmingReductionDetail,
    rental97TaxDetail,
    determinedTax,
    penaltyTax,
    penaltyBase,
    localIncomeTax,
    penaltyDetail,
    totalTax,
    amendmentDetail,
  } = finalize;
  return {
    isExempt: false,
    // §89①3호 각 목에는 해당하나 12억 초과분만 과세되는 상태(고가주택). D-8 ②2호 판정이 읽는다.
    isPartialExempt: exemptionResult.isPartialExempt,
    exemptReason: exemptionResult.exemptReason,
    warnings: warnings.length > 0 ? warnings : undefined,
    transferGain,
    taxableGain,
    usedEstimatedAcquisition: usedEstimated,
    estimatedBase: usedEstimated ? estimatedBase : undefined,
    estimatedDeduction: usedEstimated ? estimatedDeduction : undefined,
    estimatedStdPriceAtAcquisition: effectiveInput.useEstimatedAcquisition && !splitDetail ? effectiveInput.standardPriceAtAcquisition : undefined,
    estimatedStdPriceAtTransfer: effectiveInput.useEstimatedAcquisition && !splitDetail ? effectiveInput.standardPriceAtTransfer : undefined,
    expenses: appliedExpenses,
    swapApplied,
    swapComparison,
    expropriationValuationDetail,
    auctionValuationDetail,
    housingExpropriationValuationDetail,
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
    rateSurchargeStatutoryExcluded: multiHouseSurchargeResult?.rateSurchargeStatutoryExcluded,
    // houses[] 정밀 판정 원본 echo — 다건 집계가 자산별 세액을 다시 구할 때 **같은 판정**을
    // 쓰도록 그대로 싣는다(표시용 multiHouseSurchargeDetail에는 surchargeApplicable·
    // surchargeType·isSurchargeSuspended가 없어 재사용할 수 없다). 세액 로직 불변 — F01.
    multiHouseSurchargeEvaluation: multiHouseSurchargeResult,
    nblSurchargeExcluded: taxResult.nblSurchargeExcluded,
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
    gbDesignatedLandDetail,
    replacementLandDetail,
    selfFarmingReductionDetail,
    rental97LthdDetail,
    usageConversionDetail,
    lthdExclusionReason,
    rental97TaxDetail,
    new994Detail,
    unsold989Detail,
    penaltyDetail,
    amendmentDetail,
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
