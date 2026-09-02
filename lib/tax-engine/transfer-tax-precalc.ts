/**
 * 양도세 STEP 0 ~ 0.48 — **취득가액·입력 정규화 전처리**
 *
 * `transfer-tax.ts`가 853줄로 파일 크기 정책(트리거 800·착지 ≤700)을 넘겨 분리했다(CB-08).
 * 이 파일은 `calculateTransferTax`가 본 계산(STEP 0.5~11)에 들어가기 **전에** 입력을 확정하는
 * 단계들만 모은다 — 순서가 곧 규약이라 한 덩어리로 옮겼다:
 *
 *   STEP 0     세율 파싱
 *   STEP 0.4   1990.8.30. 이전 취득 토지 기준시가 환산 (소칙 §80)
 *   STEP 0.45  상속 부동산 취득가액 의제 (소령 §176조의2④·§163⑨)
 *   STEP 0.42  가업상속공제 §97의2④ 의제 취득가액 — **조기 반환**
 *   STEP 0.46  외부 취득가액 override
 *   STEP 0.47  동일조정기간 내 취득·양도 기준시가 환산 (소령 §164⑧·소칙 §80①~⑤)
 *   STEP 0.475 배우자등 이월과세 §97의2 (시나리오 A/B 비교·채택)
 *   STEP 0.48  부담부증여 §159
 *   + §99의4①·§98의9① 「그 주택 취득 전에 보유하던」 판정용 일반주택 취득일 (D4-05)
 *
 * 🔑 **옮긴 것은 위치뿐이다.** 단계 순서·술어·주석·조기 반환 지점 모두 그대로다.
 *   STEP 0.42는 이 함수 안에서 반환값을 낼 수 없으므로 `{ earlyReturn }`으로 되돌려
 *   호출부가 그대로 return한다 — 조기 반환이 하류 단계를 건너뛴다는 성질이 바뀌면
 *   안 되기 때문이다(memory `feedback_early_return_branch_skips_pipeline_stages`).
 *
 * ⚠️ `steps`·`warnings`는 호출부 배열을 그대로 받아 push한다(참조 전달). 복사본을 넘기면
 *   전처리 단계의 계산근거가 결과에서 조용히 사라진다.
 */

import { calculatePre1990LandValuation } from "./pre-1990-land-valuation";
import type { Pre1990LandValuationResult } from "./pre-1990-land-valuation";
import {
  runInheritedAcquisitionStep,
  type InheritedAcquisitionStepResult,
} from "./inheritance-acquisition-helpers";
import { applyFamilyBusinessCgtStep } from "./transfer-tax-family-business";
import { resolveAcquisitionOverride } from "./transfer-tax-acquisition-override";
import type { TransferTaxAcquisitionOptions } from "./transfer-tax-acquisition-override";
import { runSameAdjustmentPeriodStep } from "./transfer-tax-same-period-step";
import { calcCarryoverScenarios } from "./transfer-tax-carryover";
import { pickRateBasisFacts } from "./transfer-rate-holding-basis";
import { runBurdenedGiftStep } from "./transfer-tax-burdened-gift-step";
import { resolveSurchargeExclusionByReduction } from "./transfer-reductions/income-deduction-router";
import {
  runMultiHouseSurchargeStep,
  runNonBusinessLandStep,
  runCommercialAppurtenantLandStep,
} from "./transfer-tax-judgment-steps";
import { parseRatesFromMap } from "./transfer-tax-helpers";
import { TRANSFER } from "./legal-codes";
import type { TaxRatesMap } from "@/lib/db/tax-rates";
import type {
  TransferTaxInput,
  TransferTaxResult,
  CalculationStep,
  CarryoverTaxationDetail,
} from "./types/transfer.types";
import type { TransferBurdenedGiftBreakdown } from "./types/transfer.types";

export interface PreCalcResult {
  /** STEP 0.42 가업상속공제가 낸 결과 — 있으면 호출부가 그대로 return 한다 */
  earlyReturn?: TransferTaxResult;
  parsedRates: ReturnType<typeof parseRatesFromMap>;
  input: TransferTaxInput;
  workingInput: TransferTaxInput;
  pre1990LandResult?: Pre1990LandValuationResult;
  inheritedAcquisitionStep?: InheritedAcquisitionStepResult;
  carryoverDetail?: CarryoverTaxationDetail;
  transferBurdenedGiftBreakdown?: TransferBurdenedGiftBreakdown;
  hceGeneralHouseAcquisitionDate: Date;
}

export function runPreCalculationSteps(
  rawInput: TransferTaxInput,
  rates: TaxRatesMap,
  options: TransferTaxAcquisitionOptions | undefined,
  steps: CalculationStep[],
  warnings: string[],
  /** 재귀 주입 — STEP 0.42·0.475가 본 엔진을 다시 부른다 */
  calculateTransferTax: (
    rawInput: TransferTaxInput,
    rates: TaxRatesMap,
    options?: TransferTaxAcquisitionOptions,
  ) => TransferTaxResult,
): PreCalcResult {
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
  // 여기서는 함수 반환값이 다르므로 그대로 return할 수 없다 — 호출부가 return 하도록 싣는다.
  if (fbResult)
    return {
      earlyReturn: fbResult,
      parsedRates,
      input,
      workingInput: input,
      pre1990LandResult,
      inheritedAcquisitionStep,
      hceGeneralHouseAcquisitionDate: input.acquisitionDate,
    };
  // STEP 0.46: 외부 취득가액 override 적용 (options 없으면 no-op)
  input = resolveAcquisitionOverride(input, options);
  // STEP 0.47: 동일조정기간 내 취득·양도 → 양도당시 기준시가 환산 (소령 §164⑧·소칙 §80①~⑤).
  //   기준시가가 확정된 직후의 **단일 정규화 지점**이다 — 여기서 치환하면 환산취득가액·
  //   기준시가 과세·감면 안분·LTHD·중과 판정이 전부 자동으로 따라온다.
  //   sameAdjustmentPeriod 미제공이거나 요건 미충족이면 undefined → no-op(회귀 0).
  const samePeriodStep = runSameAdjustmentPeriodStep(input);
  if (samePeriodStep) {
    input = samePeriodStep.updatedInput;
    steps.push(samePeriodStep.step);
  }
  let workingInput = input;
  // STEP 0.475: 배우자등 이월과세 §97조의2 (carryoverTaxation 없으면 skip, 재귀 시 자동 skip)
  let carryoverDetail: CarryoverTaxationDetail | undefined;
  if (rawInput.acquisitionCause === "carryover_gift" && rawInput.carryoverTaxation) {
    const carryoverResult = calcCarryoverScenarios(
      workingInput,
      rates,
      // calculateTransferTax를 주입 — 재귀 호출 시 carryoverTaxation=undefined이므로 무한 루프 없음
      calculateTransferTax,
      // ②3호 비교 결과 강제 — 다건 엔진(신고단위 비교)만 지정한다. 단건은 undefined.
      options?.carryoverScenarioOverride,
    );
    if (carryoverResult) {
      // [echo] 채택 시나리오가 실제로 쓴 §104② 기산 사실. **단건 세액 불변**(바로 아래에서
      // workingInput이 되는 그 입력을 되비출 뿐) — 소비자는 다건 엔진이다
      // (타입 주석 `CarryoverTaxationDetail.adoptedRateBasis` 참조).
      carryoverDetail = {
        ...carryoverResult.detail,
        adoptedRateBasis: pickRateBasisFacts(carryoverResult.adoptedInput),
      };
      // 채택 시나리오 입력으로 workingInput 교체 → 이후 STEP 0.5~11이 그대로 통과
      workingInput = carryoverResult.adoptedInput;
      steps.push({
        label: "배우자등 이월과세 판정",
        formula: carryoverResult.detail.isEligible
          ? `Scenario A(결정세액 ${carryoverResult.detail.scenarioA.determinedTax.toLocaleString()}) vs B(${carryoverResult.detail.scenarioB.determinedTax.toLocaleString()}) → ${carryoverResult.detail.adoptedScenario} 채택${
              // 다건 신고에서는 판정이 **신고 전체 결정세액**(§92③2호)으로 이뤄진다.
              // 그 사실을 적지 않으면 위 두 금액만 보고 「작은 쪽이 채택됐다」는 오독이 생긴다.
              options?.carryoverScenarioOverride ? " (신고 전체 결정세액 비교 · §92③2호)" : ""
            }`
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

  /**
   * §99의4①·§98의9①의 「그 주택 취득 **전에 보유하던** 다른 주택」 판정용 일반주택 취득일 (D4-05).
   *
   * 두 조문의 보유 주체는 **1세대**다. 이월과세(소득세법 §97의2①)는 취득가액만 의제하고
   * 취득시기를 의제하지 않으므로, 시나리오 A의 `workingInput.acquisitionDate`(증여자 취득일)로
   * 판정하면 안 된다 — STEP 0.45가 같은 이유로 이미 원본 `input`을 쓴다.
   *
   * 다만 **배우자 증여는 예외**다. 소득세법 §88 6호는 1세대를 「거주자 및 그 배우자가 그들과
   * 같은 주소 또는 거소에서 생계를 같이 하는 자와 함께 구성하는 가족단위」로 정의해 배우자를
   * 세대 구성의 축으로 둔다 ⇒ 배우자로부터의 증여는 세대가 바뀌지 않아 세대의 보유 개시일이
   * 증여자 취득일이다. 직계존비속은 동일세대일 수도 별도세대일 수도 있고 엔진에 그 사실이
   * 들어오지 않으므로, 양도자 본인의 취득일을 기준으로 둔다(동일세대였다는 예외 사실은
   * 납세자가 입증할 영역).
   */
  const hceGeneralHouseAcquisitionDate =
    input.houseCountExclusionAcquisitionDate ??
    (input.carryoverTaxation && input.carryoverTaxation.donorRelation === "spouse"
      ? input.carryoverTaxation.donorAcquisitionDate
      : input.acquisitionDate);
  return {
    parsedRates,
    input,
    workingInput,
    pre1990LandResult,
    inheritedAcquisitionStep,
    carryoverDetail,
    transferBurdenedGiftBreakdown,
    hceGeneralHouseAcquisitionDate,
  };
}


/**
 * STEP 0.45 ~ 0.62 — **중과·비사업용 판정 전처리**
 *
 * `runPreCalculationSteps`가 입력을 확정한 뒤, STEP 0.65(재개발 분기)·STEP 1(비과세) 앞에
 * 놓이는 판정들이다. 같은 이유(파일 크기 정책 · CB-08)로 함께 옮겼다.
 *
 *   STEP 0.45 차감형 감면주택 중과 배제 선판정 (소령 §167의3①5호·§167의10①2호)
 *   STEP 0.5  다주택 중과 판정
 *   STEP 0.6  비사업용 토지 판정
 *   STEP 0.62 상업용건물·오피스텔 부수토지 기준면적 초과분 (지령 §101①2호·§101②)
 *
 * 🔑 옮긴 것은 위치뿐이다. `effectiveInput`은 호출부에서 **후속 STEP이 재할당**하므로
 *   `let`으로 받아야 한다 — const로 받으면 STEP 0.35 환산 등이 막힌다.
 */
export function runSurchargeAndLandSteps(
  input: TransferTaxInput,
  workingInput: TransferTaxInput,
  parsedRates: ReturnType<typeof parseRatesFromMap>,
  steps: CalculationStep[],
): {
  /** STEP 4.05 §98의2 특칙이 downstream에서 다시 읽는다 — 같은 신호를 두 번 만들지 않는다 */
  surchargeExclusionByReduction: ReturnType<typeof resolveSurchargeExclusionByReduction>;
  multiHouseSurchargeResult: ReturnType<typeof runMultiHouseSurchargeStep>;
  nonBusinessLandJudgment: ReturnType<typeof runNonBusinessLandStep>["nonBusinessLandJudgment"];
  effectiveInput: TransferTaxInput;
} {
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
  return {
    surchargeExclusionByReduction,
    multiHouseSurchargeResult,
    nonBusinessLandJudgment,
    effectiveInput,
  };
}
