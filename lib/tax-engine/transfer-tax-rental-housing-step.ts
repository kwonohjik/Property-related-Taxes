/**
 * STEP 2.5 헬퍼 — 장기임대주택 보유자 거주주택 비과세 특례 (소령 §155⑳ + §161)
 *
 * transfer-tax.ts의 800줄 제한 준수를 위해 분리. 순수 함수 (DB 호출 없음).
 *
 * applied=true 시 TransferTaxResult를 반환(호출측이 즉시 return) — STEP 3 이후를 건너뜀.
 * applied=false 시 steps에 미적용 사유만 기록하고 null 반환(호출측 일반 경로 계속).
 *
 * 법령 근거: 소득세법 시행령 §155⑳ + §161
 */

import { applyRate, calculateHoldingPeriod, truncateToWon, calculateProgressiveTax } from "./tax-utils";
import { TRANSFER_RENTAL_HOUSING, NBL } from "./legal-codes/transfer";
import { calculateRentalHousingException } from "./transfer-tax/rental-housing-exception";
import { checkEligibility } from "./transfer-tax/rental-housing-exception/eligibility";
import { calcTable1Rate } from "./transfer-tax/rental-housing-exception/ltc-table-split";
import type {
  TransferTaxInput,
  CalculationStep,
  TransferTaxResult,
} from "./types/transfer.types";
import type { SplitGainResult } from "./types/transfer-split-gain.types";
import type { MultiHouseSurchargeResult } from "./multi-house-surcharge";
import { calcTax, computeBracketBreakdown, calcReductions } from "./transfer-tax-rate-calc";
import { applyReductionStatutoryCap } from "./transfer-tax-reduction-cap";
import { resolveTaxCreditRuralSurtax } from "./transfer-tax-rural-surtax";
import { ALL_INCOME_DEDUCTION_IDS } from "./transfer-reductions/income-deduction-router";
import { getReductionLegalBasis } from "./transfer-tax-helpers";
import type { RateGroup } from "./types/transfer-aggregate.types";
import {
  resolveAppurtenantLandExcess,
  resolveLandStatutoryAcquisitionDate,
  buildLandRateInput,
} from "./transfer-tax-appurtenant-land";
import { allocateBasicDeduction } from "./transfer-tax-aggregate-helpers";
import type { ParsedRates } from "./transfer-tax-helpers";
import { emitPenaltySteps } from "./transfer-tax-helpers";
import { resolveLTHDStartDate } from "./transfer-tax-finalize";
import { computeAmendment } from "./transfer-tax-amendment";

/**
 * §155⑳ 시나리오 B(임대→거주 전환 PHRP) 여부 — STEP 1a 전액 비과세 조기 반환 억제 게이트.
 * B는 §161①(직전거주주택 양도일 이후 기간분만 비과세) 안분이 필요하므로 일반 1세대1주택
 * 요건 충족이어도 조기 반환하면 안분 미도달 오답. A(거주주택 양도)는 eligibility 충족 시 전액 비과세가
 * 정답이므로 조기반환 가능하나, **미충족 시엔 조기반환하면 안 됨**(아래 isPrhpScenarioAIneligible).
 */
export function isPrhpScenarioB(effectiveInput: TransferTaxInput): boolean {
  return (
    effectiveInput.rentalHousingException?.applyException === true &&
    effectiveInput.rentalHousingException.scenario === "B"
  );
}

/**
 * §155⑳ 시나리오 A(거주주택 양도) + 임대주택 eligibility 미충족 여부 — STEP 1a 조기반환 억제 게이트.
 * A는 사용자가 householdHousingCount=1(임대주택 제외 전제)을 입력하면 checkExemption이 isExempt=true를
 * 내주는데, STEP 1a가 그대로 조기반환하면 STEP 2.5의 checkEligibility가 우회되어 임대 요건 미충족인데도
 * 전액 비과세되는 over-exemption 버그. 미충족 시 조기반환을 억제하면 STEP 2.5가 "적용 불가"(null)로
 * 정상 과세 경로에 넘긴다. eligible 케이스는 false 반환 → 현행 조기반환 유지(무변경).
 */
export function isPrhpScenarioAIneligible(effectiveInput: TransferTaxInput): boolean {
  const rhe = effectiveInput.rentalHousingException;
  if (rhe?.applyException !== true || rhe.scenario !== "A") return false;
  const holdYears = calculateHoldingPeriod(
    effectiveInput.acquisitionDate,
    effectiveInput.transferDate,
  ).years;
  const liveYears = Math.floor(effectiveInput.residencePeriodMonths / 12);
  // 거주주택 보유·거주 연수 = holdYears·liveYears (runRentalHousingExceptionStep와 동일 인자 관례)
  return !checkEligibility(rhe.rentalUnits, holdYears, liveYears).passed;
}

/**
 * STEP 1a 전액 비과세 조기반환 허용 여부 — §155⑳ 두 억제 게이트를 결합(orchestrator 800줄 정책).
 * B 시나리오(§161 안분 필요)·A 시나리오 eligibility 미충족(over-exemption 차단) 시 false → STEP 2.5 위임.
 */
export function canEarlyReturnPrhp(effectiveInput: TransferTaxInput): boolean {
  return !isPrhpScenarioB(effectiveInput) && !isPrhpScenarioAIneligible(effectiveInput);
}

export interface RentalHousingStepArgs {
  /** carryover 등 보정 완료된 유효 입력 */
  effectiveInput: TransferTaxInput;
  /** 원본 입력 (가산세 입력 filingPenaltyDetails/delayedPaymentDetails 참조용) */
  input: TransferTaxInput;
  /** 양도차익 (STEP 2 결과) */
  transferGain: number;
  /** 환산취득가 사용 여부 */
  usedEstimated: boolean;
  /** 환산취득가 (분리 표기용) */
  estimatedBase: number;
  /** 개산공제 (분리 표기용) */
  estimatedDeduction: number;
  parsedRates: ParsedRates;
  multiHouseSurchargeResult?: MultiHouseSurchargeResult;
  /**
   * 토지·건물 분리 계산 결과 (STEP 2). 주택 부수토지 **배율 초과분**을 비사업용 토지로
   * 분리(§104의3①5호)하려면 토지분 양도차익이 필요하다 — 없으면 분리하지 않는다.
   */
  splitDetail?: SplitGainResult;
  /** 계산 단계 배열 (push 부수효과) */
  steps: CalculationStep[];
}

/**
 * 주택 부수토지 **배율 초과분**(「소득세법」 제104조의3 제1항 제5호 비사업용 토지) 분리 결과.
 *
 * §155⑳은 거주주택을 "국내에 1개의 주택을 소유하고 있는 것으로 보아 **제154조제1항을
 * 적용**"할 뿐이다 — 비과세 범위는 §154①과 그 위임인 §154⑦(정착면적 × 지역별 배율)이 정하므로,
 * **배율 초과분은 특례의 의제 대상 밖**이다(§155①·§155②와 같은 문형이며 일반 경로
 * `applyHousingLandExclusions`가 이미 그렇게 구현돼 있다).
 */
interface AppurtenantExcessSplit {
  /** 배율 초과분 양도차익 — 12억 안분 대상이 아니라 전액 과세 */
  gain: number;
  /** 표1 장기보유특별공제액(「소득세법」 §95② 표1 — 보유연수 × 2%, 최대 30%) */
  longTermDeduction: number;
  longTermRate: number;
  /** 배율 초과분 양도소득금액 = gain − longTermDeduction */
  income: number;
  holdingYears: number;
  /** 한도 면적(정착면적 × 배율)·초과 면적·적용 배율 — 결과 카드 표시용 */
  limitArea: number;
  excessArea: number;
  multiplier: number;
  /** §104①8호(누진 + 10%p)를 적용할 세율 판정 입력 */
  rateInput: TransferTaxInput;
  step: CalculationStep;
}

/**
 * 배율 초과분을 분리한다. 대상이 아니거나 불변식이 깨지면 `null`(종전 경로 유지 — 안전측).
 *
 * 파트 세율 입력은 split 정본(`computeSplitPartTax`의 `non_business_land` seed)과 **같은 형태**다:
 * `propertyType`을 토지로 두어 `calcTax`의 주택 단기세율(70%/60%) 분기에 걸리지 않게 하고,
 * §104② 기산일은 주택 부수토지의 `max` 규칙이 아니라 **토지 본래 취득일**을 쓴다.
 */
function splitAppurtenantExcess(
  input: TransferTaxInput,
  splitDetail: SplitGainResult | undefined,
  transferGain: number,
): AppurtenantExcessSplit | null {
  if (!splitDetail) return null;
  const excess = resolveAppurtenantLandExcess(input);
  if (!excess) return null;
  const basisDate = resolveLandStatutoryAcquisitionDate(input);
  if (!basisDate) return null;

  const landGain = Math.max(0, splitDetail.land.gain);
  const gain = Math.floor(landGain * excess.nonBizRatio);
  // 불변식 — 초과분이 자산 양도차익 전부를 삼키면 「주택분」이 사라진다. 조용히 clamp하지 않고
  // 분리를 포기해 종전 경로로 후퇴한다(`computeSplitPartTax`의 게이트와 같은 규약).
  if (gain <= 0 || gain >= transferGain) return null;

  const holdingYears = splitDetail.land.holdingYears;
  const longTermRate = calcTable1Rate(holdingYears);
  const longTermDeduction = applyRate(gain, longTermRate);

  return {
    gain,
    longTermRate,
    longTermDeduction,
    income: gain - longTermDeduction,
    holdingYears,
    limitArea: excess.limitArea,
    excessArea: excess.excessArea,
    multiplier: excess.multiplier,
    rateInput: {
      ...buildLandRateInput(input, basisDate),
      propertyType: "land",
      isNonBusinessLand: true,
      // 자산 단위 면적안분 비율은 이 파트에 의미가 없다 — 이미 초과분만 떼어냈다.
      nonBusinessLandAreaRatio: undefined,
    },
    step: {
      label: "부수토지 배율 초과분 분리 (비사업용 토지)",
      formula:
        `배율 초과분 ${excess.excessArea.toFixed(2)}㎡(한도 정착면적 × ${excess.multiplier}배 = ` +
        `${excess.limitArea.toFixed(2)}㎡)는 「소득세법」 제104조의3 제1항 제5호의 비사업용 토지 — ` +
        `§155⑳ 특례(§154① 적용 의제)의 대상이 아니므로 양도차익 ${gain.toLocaleString()}을 ` +
        `분리해 전액 과세 (장기보유특별공제는 §95② 표1 ${Math.round(longTermRate * 100)}% ` +
        `${longTermDeduction.toLocaleString()})`,
      amount: gain - longTermDeduction,
      legalBasis: NBL.MAIN,
    },
  };
}

/**
 * 두 파트는 **같은 자산·같은 납세자**라 세율군 우선순위(다건 엔진이 자산 간 순서를 정하는 장치)가
 * 의미 없다 — split 정본(`PART_RATE_GROUP`)과 같이 한 군으로 두고 한계세율로만 결정하게 한다.
 */
const PRHP_PART_RATE_GROUP: RateGroup = "progressive";

/**
 * §104⑤ 비교과세 — 「주택분」과 「배율 초과 비사업용 토지분」 2파트.
 *
 * [법령] 「소득세법」 제104조 제5항 — MAX(**1호** 과세표준 합계액에 §55① 세율을 적용한 산출세액,
 *   **2호** 자산별 산출세액 합계). 본문 **후단**이 "한 필지의 토지가 제104조의3에 따른 비사업용
 *   토지와 그 외의 토지로 구분되는 경우에는 **각각을 별개의 자산으로 보아**" 계산하도록 정한다.
 *
 * **신규 세율 로직이 0이다** — 각 파트를 `calcTax`에 그대로 위임하므로 §104①8호(+10%p)·
 * §104① 후단·§104⑦은 정본이 수행한다. `computePartialNblTax`(한 필지 중 일부만 비사업용)와
 * 같은 구조다.
 */
function resolveClause5Tax(args: {
  housingIncome: number;
  nbl: AppurtenantExcessSplit;
  basicDeduction: number;
  /** 자산 단위 과세표준 = (주택분 + 비사토분) − 기본공제 */
  taxBase: number;
  input: TransferTaxInput;
  parsedRates: ParsedRates;
  multiHouseSurchargeResult?: MultiHouseSurchargeResult;
}): ReturnType<typeof calcTax> {
  const { housingIncome, nbl, basicDeduction, taxBase, input, parsedRates, multiHouseSurchargeResult } = args;
  // 배율 초과분을 이미 떼어냈으므로 남은 주택분은 §104의3①5호가 규정한 부분이 아니다 → 중과 제외
  // (split 정본 `computeSplitPartTax`의 `land` seed와 같은 처리).
  const housingRateInput: TransferTaxInput = {
    ...input,
    isNonBusinessLand: false,
    nonBusinessLandAreaRatio: undefined,
  };

  // 기본공제는 세액이 가장 크게 줄어드는 파트에 귀속(§103② · "MAX_BENEFIT") — split 정본과 동일.
  // 배분 이득은 한계세율이 결정하고 그 값은 `calcTax`의 `appliedRate`가 담고 있다.
  const preHousing = calcTax(housingIncome, parsedRates, housingRateInput, multiHouseSurchargeResult);
  const preNbl = calcTax(nbl.income, parsedRates, nbl.rateInput, multiHouseSurchargeResult);
  const allocation = allocateBasicDeduction(
    [
      { idx: 0, rateGroup: PRHP_PART_RATE_GROUP, income: housingIncome, transferDate: input.transferDate, rate: preHousing.appliedRate },
      { idx: 1, rateGroup: PRHP_PART_RATE_GROUP, income: nbl.income, transferDate: input.transferDate, rate: preNbl.appliedRate },
    ],
    basicDeduction,
    "MAX_BENEFIT",
  );
  const allocated = (idx: number) => allocation.find((a) => a.idx === idx)?.amount ?? 0;
  const housingBase = Math.max(0, housingIncome - allocated(0));
  // 마지막 파트가 잔액을 흡수해 `Σ 파트 과세표준 = 자산 과세표준` 불변식을 지킨다
  // (memory `feedback_floor_residual_absorption`).
  const nblBase = Math.max(0, taxBase - housingBase);

  const housingPart = calcTax(housingBase, parsedRates, housingRateInput, multiHouseSurchargeResult);
  const nblPart = calcTax(nblBase, parsedRates, nbl.rateInput, multiHouseSurchargeResult);
  const clause2 = housingPart.calculatedTax + nblPart.calculatedTax;
  // 1호 — 과세표준 **합계액**에 §55① 세율만. 가산 항이 없다.
  const clause1 = calculateProgressiveTax(taxBase, parsedRates.brackets);

  if (clause1 >= clause2) {
    const { baseRate, deduction } = computeBracketBreakdown(taxBase, parsedRates.brackets);
    return {
      calculatedTax: clause1,
      appliedRate: baseRate,
      progressiveDeduction: deduction,
      surchargeSuspended: false,
      shortTermNote:
        `배율 초과 부수토지 분리(소득세법 §104⑤ 본문 후단): 합산 누진세액 ` +
        `${clause1.toLocaleString()}이 별개 자산별 합계 ${clause2.toLocaleString()}보다 크다`,
    };
  }
  return {
    calculatedTax: clause2,
    // 표시용 적용세율은 파트 최고세율 (누진공제는 파트별로 달라 합산 표시 불가)
    appliedRate: Math.max(housingPart.appliedRate, nblPart.appliedRate),
    progressiveDeduction: 0,
    surchargeSuspended: false,
    // 비사업용 토지 중과 사실을 자산 단위로 끌어올린다 — 결과 카드의 배지·법령근거가 사라지지 않도록.
    surchargeType: nblPart.surchargeType,
    surchargeRate: nblPart.surchargeRate,
    ...(nblPart.nblSurchargeExcluded ? { nblSurchargeExcluded: true } : {}),
    shortTermNote:
      `파트별 세율(소득세법 §104⑤2호·본문 후단): 주택분 ` +
      `${Math.round(housingPart.appliedRate * 100)}% ${housingPart.calculatedTax.toLocaleString()} + ` +
      `배율 초과 토지(비사업용) ${Math.round(nblPart.appliedRate * 100)}% ` +
      `${nblPart.calculatedTax.toLocaleString()} (합산 누진세액 ${clause1.toLocaleString()}과 비교한 큰 세액)`,
  };
}

/**
 * §155⑳ 특례가 쓰는 **12억 고가주택 판정·안분 분모**(`calculateRentalHousingException`의 `S`).
 *
 * 이 저장소의 12억 분모 정본은 「물건 전체 양도가액」이다 —
 * `calcOneHouseProration`(`transfer-tax-helpers.ts`) · `resolveTaxableGain`(`transfer-tax-taxable-gain.ts`) ·
 * `checkExemption`(`transfer-tax-exemption.ts`)이 모두 같은 축을 쓴다. 지분 모드는 `transferPrice`에
 * **본인 지분 안분액**을 싣고 총 물건가는 `totalPropertyTransferPrice`로 따로 전달한다
 * (`lib/calc/transfer-tax-api.ts` 지분 분기).
 *
 * 종전에는 이 경로만 `transferPrice`를 그대로 봐서, 총 20억 물건의 1/2 지분(본인 10억)이
 * 12억 이하로 판정돼 RH-A1(전액 비과세)로 빠졌다 — 일반 경로는 같은 입력에서 부분과세였다.
 *
 * ⚠️ `burdenedGiftDenominator`(부담부증여 — 소령 §159 해석 B: 분모 = 증여가액 C)는 이 체인에
 *   **넣지 않는다**. 「부담부증여 × §155⑳」 조합의 도달성이 확인되지 않았고, 그 조합에서 분모를
 *   바꾸면 검증되지 않은 축이 함께 움직인다. 부담부증여 입력에서는 현행(`transferPrice`)을 그대로
 *   유지해 **동작 변화 0**을 보장한다(별도 검토 대상).
 */
function resolveHighValueDenominator(effectiveInput: TransferTaxInput): number {
  if (effectiveInput.burdenedGiftDenominator !== undefined) return effectiveInput.transferPrice;
  return effectiveInput.totalPropertyTransferPrice ?? effectiveInput.transferPrice;
}

/**
 * STEP 2.5: 장기임대주택 거주주택 비과세 특례 처리.
 * gain 계산 완료 후 호출. 호출측은 `if (effectiveInput.rentalHousingException?.applyException)` 가드 후 호출.
 */
export function runRentalHousingExceptionStep(
  args: RentalHousingStepArgs,
): TransferTaxResult | null {
  const {
    effectiveInput, input, transferGain, usedEstimated,
    estimatedBase, estimatedDeduction, parsedRates, multiHouseSurchargeResult, splitDetail, steps,
  } = args;

  const holdPeriod = calculateHoldingPeriod(effectiveInput.acquisitionDate, effectiveInput.transferDate);
  const holdYears = holdPeriod.years;
  const liveYears = Math.floor(effectiveInput.residencePeriodMonths / 12);
  // 배율 초과 부수토지는 §154①(→§154⑦)의 「이에 딸린 토지」가 아니므로 §155⑳ 의제 대상 밖이다.
  // 특례 계산에 넣기 **전에** 떼어내야 12억 안분·표2 장특이 그 부분에 잘못 미치지 않는다
  // (일반 경로 `applyHousingLandExclusions`의 ①→② 순서와 같다).
  const nbl = splitAppurtenantExcess(effectiveInput, splitDetail, transferGain);
  const housingGain = transferGain - (nbl?.gain ?? 0);
  const rhe = calculateRentalHousingException(
    effectiveInput.rentalHousingException!,
    housingGain,
    resolveHighValueDenominator(effectiveInput),
    holdYears,
    liveYears,
    holdYears,    // 거주주택 보유연수 (B 시나리오 시 PHRP 보유연수와 동일)
    liveYears,    // 거주주택 거주연수
  );

  // applied=false: 미적용 사유를 steps에 기록하여 결과 화면에서 노출 (침묵 실패 차단)
  if (!rhe.applied) {
    const reasons = [
      ...rhe.eligibility.residenceFailReasons,
      ...rhe.eligibility.failReasons.map((r) => r.message),
    ];
    const reasonText =
      reasons.length > 0 ? reasons.join(" · ") : "장기임대주택 거주주택 비과세 특례 요건 미충족";
    steps.push({
      label: "장기임대주택 거주주택 비과세 특례 — 적용 불가",
      formula: reasonText,
      amount: 0,
      legalBasis: TRANSFER_RENTAL_HOUSING.PIT_RD_155_20,
    });
    return null;
  }

  // ── 특례 적용: taxableGain을 특례 결과로 대체하고 최종 결과 반환 ──
  steps.push({
    label: "장기임대주택 보유자 거주주택 비과세 특례",
    formula: `§155⑳ + §161 — ${rhe.scenarioId} 시나리오 적용`,
    amount: rhe.taxableGain,
    legalBasis: TRANSFER_RENTAL_HOUSING.PIT_RD_155_20,
  });
  // 2026-07-29 정정(#591 감사 R7 — **세액 변경**): 이 조기반환 경로가 기본공제를
  //   연 한도(250만) **전액**으로 고정해 `annualBasicDeductionUsed`(같은 해 기사용분)를
  //   무시했다. 같은 해 다른 양도에서 이미 공제받았어도 250만원을 다시 전액 공제해
  //   과세표준·세액이 과소했다.
  //   소득세법 §103①은 기본공제를 **소득별로 해당 과세기간에 각각 연 250만원** 한도로
  //   규정하므로 잔여 = max(0, 연한도 − 기사용분)이다. 공제액은 과세대상 양도소득금액도
  //   넘을 수 없다(min).
  const rheBasicDeductionRemaining = Math.max(
    0,
    parsedRates.basicDeductionRules.annualLimit - (effectiveInput.annualBasicDeductionUsed ?? 0),
  );
  // 과세 대상 양도소득금액 = 특례 적용 후 **주택분** + 분리된 **배율 초과 비사업용 토지분**.
  const totalTaxableIncome = rhe.taxableGain + (nbl?.income ?? 0);
  const rheBasicDeduction = Math.min(rheBasicDeductionRemaining, Math.max(0, totalTaxableIncome));
  const rheTaxBase = truncateToWon(Math.max(0, totalTaxableIncome - rheBasicDeduction));
  // 배율 초과분이 분리됐으면 §104⑤ 비교과세, 아니면 종전 자산 단위 단일 세율(회귀 0).
  const rheTaxResult = nbl
    ? resolveClause5Tax({
        housingIncome: rhe.taxableGain,
        nbl,
        basicDeduction: rheBasicDeduction,
        taxBase: rheTaxBase,
        input: effectiveInput,
        parsedRates,
        multiHouseSurchargeResult,
      })
    : calcTax(rheTaxBase, parsedRates, effectiveInput, multiHouseSurchargeResult);
  if (nbl) {
    steps.push(nbl.step);
    // §104⑤ 비교과세를 수행했으면 그 사실을 노출한다 — 종전 특례 경로는 산출세액 단계를
    // 아예 emit하지 않아 파트별 세율·비교 결과가 침묵했다(분리가 있을 때만 추가 — 회귀 0).
    steps.push({
      label: "산출세액",
      formula:
        `과세표준 ${rheTaxBase.toLocaleString()} × 세율 ` +
        `${Math.round(rheTaxResult.appliedRate * 100)}%` +
        (rheTaxResult.progressiveDeduction
          ? ` - 누진공제 ${rheTaxResult.progressiveDeduction.toLocaleString()}`
          : "") +
        (rheTaxResult.shortTermNote ? ` (${rheTaxResult.shortTermNote})` : ""),
      amount: rheTaxResult.calculatedTax,
      legalBasis: NBL.MAIN,
    });
    // 결과 카드·신고서가 파트 내역을 읽는다 — 일반 경로(`applyHousingLandExclusions`)와 같은 형태.
    if (splitDetail) {
      splitDetail.nonBusinessLandPart = {
        limitArea: nbl.limitArea,
        excessArea: nbl.excessArea,
        appliedMultiplier: nbl.multiplier,
        gain: nbl.gain,
        taxableGainAfterProration: nbl.gain,
        holdingYears: nbl.holdingYears,
        longTermRate: nbl.longTermRate,
        longTermDeduction: nbl.longTermDeduction,
      };
    }
  }

  // §161 비과세 양도소득금액 = §95① 양도소득금액 − 과세대상 양도소득금액.
  // 명세서 카드 "비과세 양도소득금액 (소령 §161①)" 행에서 step.formula 자동 매핑.
  const nontaxableGainAmount = Math.max(0, rhe.formulaTrace.gain95Table1 - rhe.taxableGain);
  if (nontaxableGainAmount > 0) {
    steps.push({
      label: "비과세 양도소득금액 (소령 §161①)",
      formula: `§95① 양도소득금액 ${rhe.formulaTrace.gain95Table1.toLocaleString()} − 과세대상 양도소득금액 ${rhe.taxableGain.toLocaleString()} = ${nontaxableGainAmount.toLocaleString()}`,
      amount: nontaxableGainAmount,
      legalBasis: TRANSFER_RENTAL_HOUSING.PIT_RD_155_20,
    });
  }

  /**
   * ── 조특법 감면 (F08) ──────────────────────────────────────────────────
   *
   * 🔴 종전에는 이 경로가 `finalizeTransferTax`를 거치지 않는다는 **구현상의 이유로**
   *    사용자가 고른 감면을 한 줄의 안내도 없이 0으로 만들었다(실측: §77 공익수용
   *    **80,660,250**이 특례를 끄면 잡히고 켜면 0).
   *
   * **병용을 막는 명문이 없다.** 「조세특례제한법」 §127(중복지원의 배제)은 ⑦에서
   * 「둘 이상의 **감면규정**이 동시 적용되면 하나를 선택」이라고 정할 뿐, 「소득세법 시행령」
   * §155⑳ 비과세 특례와 감면의 병용을 배제하는 규정은 두지 않았다. 비과세분은 애초에
   * 과세대상이 아니고, **과세되는 부분**(고가주택 초과분·배율 초과 부수토지분)에 대해
   * 감면을 적용하는 구조 자체는 일반 경로와 다르지 않다.
   * ⇒ 근거 없이 0으로 만드는 것이 오히려 정당화되지 않는다.
   *
   * ## 두 축을 가른다
   *
   * · **세액감면형**(§69 자경농지·§77 공익수용·§77의2 대토·§97 시리즈 등) — 산출세액에서
   *   감면세액을 빼는 구조라 이 경로에도 **그대로 적용된다**. 일반 경로와 **같은 함수**
   *   (`calcReductions`)와 **같은 한도 규칙**(`applyReductionStatutoryCap`)을 쓴다.
   * · **차감형·하이브리드**({@link ALL_INCOME_DEDUCTION_IDS} 11종 — §99의3·§99·§98 시리즈) —
   *   **양도소득금액을 차감**하는 구조인데, 그것을 「소득세법 시행령」 §161 안분의 **앞/뒤
   *   어디에 얹을지 정한 명문이 없다**. 추정으로 자리를 정하면 조용히 틀린다.
   *   ⇒ 계산에 넣지 않고 **넣지 않았다는 사실을 표시**한다(종전 고지 유지).
   *
   * ✅ **농특세는 붙는다**(2026-08-23 `0b8aa295`로 별건 해소). 「농어촌특별세법」 §5①1호가
   *    조특법 감면세액 × 20%를 정하고 비과세는 시행령 §4가 **열거**한 것뿐이다.
   *    판정표는 `transfer-tax-rural-surtax.ts` **단일 소스**를 단건·이 경로·다건이 공유한다 —
   *    한 곳만 고치면 같은 감면이 경로에 따라 갈린다.
   *
   * 계획서: `docs/00-pm/transfer-review-2026-08-open-items.plan.md` §F08
   */
  const allReductions = input.reductions ?? [];
  const incomeDeductionIds = new Set<string>(ALL_INCOME_DEDUCTION_IDS);
  /** 차감형·하이브리드 — 이 경로가 계산하지 않는 축(§161 안분 위치 명문 부재). */
  const deferredReductions = allReductions.filter((r) => incomeDeductionIds.has(r.type));
  /** 세액감면형 — 일반 경로와 동일하게 계산한다. */
  const taxCreditReductions = allReductions.filter((r) => !incomeDeductionIds.has(r.type));

  const reductionResult = calcReductions(
    rheTaxResult.calculatedTax,
    taxCreditReductions,
    parsedRates.selfFarmingRules,
    effectiveInput.rentalReductionDetails,
    parsedRates.longTermRentalRules,
    // 신축주택(§99·§99의3)은 차감형이라 여기 넘기지 않는다 — 위 축 분리와 일관.
    undefined,
    parsedRates.newHousingMatrix,
    effectiveInput.transferDate,
    // 감면대상 소득 안분의 분모 — 이 경로의 **과세대상** 양도소득금액(장특 반영 후).
    Math.max(0, totalTaxableIncome),
    rheBasicDeduction,
    rheTaxBase,
    effectiveInput.acquisitionDate,
    effectiveInput.standardPriceAtAcquisition,
    effectiveInput.standardPriceAtTransfer,
    effectiveInput.assetContractDate,
  );

  const cap = applyReductionStatutoryCap({
    reductionAmount: reductionResult.reductionAmount,
    reductionTypeApplied: reductionResult.reductionTypeApplied,
    transferYear: effectiveInput.transferDate.getFullYear(),
    priorUsage: effectiveInput.priorReductionUsage ?? [],
  });
  const rheReductionAmount = cap.cappedAmount;

  if (rheReductionAmount > 0 || reductionResult.reductionType) {
    steps.push({
      label: "감면세액",
      formula: reductionResult.reductionType
        ? `${reductionResult.reductionType} 감면 ${rheReductionAmount.toLocaleString()}`
        : "감면 없음",
      amount: rheReductionAmount,
      // D1-12 — **id**를 넘긴다(라벨 아님).
      legalBasis: getReductionLegalBasis(
        reductionResult.reductionTypeApplied,
        reductionResult.publicExpropriationDetail?.useLegacyRates,
        reductionResult.reductionLegalBasisOverride,
      ),
    });
  }
  if (cap.step) steps.push(cap.step);

  const reductionNotice =
    deferredReductions.length > 0
      ? `선택한 감면 중 ${deferredReductions.length}건(양도소득금액 차감형)은 이 계산에 반영되지 않았습니다 — 거주주택 비과세 특례(소득세법 시행령 §155⑳)의 §161 안분과 차감 순서를 정한 규정이 없습니다. 「조세특례제한법」 §99·§99의3은 고가주택 배제 단서가 명문이므로 적용 대상이 아닙니다.`
      : undefined;
  if (reductionNotice) {
    steps.push({
      label: "조특법 감면 — 미반영 (차감형)",
      formula: reductionNotice,
      amount: 0,
      legalBasis: TRANSFER_RENTAL_HOUSING.PIT_RD_155_20,
    });
  }

  // L-2 (2026-06-03): 특례 경로는 finalizeTransferTax를 거치지 않으므로
  // 신고불성실·납부지연 가산세를 emitPenaltySteps로 직접 반영 (미입력 시 no-op).
  /**
   * 농어촌특별세 — 일반 경로(STEP 8.8)와 **같은 판정표**를 쓴다(`transfer-tax-rural-surtax.ts`).
   * 여기서만 빼면 같은 감면이 특례 여부에 따라 농특세가 달라진다.
   */
  const rheSurtaxVerdict = resolveTaxCreditRuralSurtax({
    reductionTypeApplied: reductionResult.reductionTypeApplied,
    reductionAmount: rheReductionAmount,
    isSelfCultivatedExpropriatedLand: effectiveInput.isSelfCultivatedExpropriatedLand,
  });
  if (rheSurtaxVerdict.surtax > 0) {
    steps.push({
      label: "농어촌특별세 (감면세액 × 20%)",
      formula: `감면세액 ${rheReductionAmount.toLocaleString()} × 20% = ${rheSurtaxVerdict.surtax.toLocaleString()} — ${rheSurtaxVerdict.reason}`,
      amount: rheSurtaxVerdict.surtax,
      legalBasis: rheSurtaxVerdict.legalBasis,
    });
  }

  const rheDeterminedTax = Math.max(0, rheTaxResult.calculatedTax - rheReductionAmount);
  const rheLocalIncomeTax = applyRate(rheDeterminedTax, 0.1);
  const { penaltyDetail, filingDelayedPenalty } = emitPenaltySteps(
    input,
    steps,
    rheDeterminedTax,
    0,
    0,
    undefined,
  );

  // 수정신고(경정) — 이 경로도 finalize STEP 12.5·재개발 Step H.5와 **동형**이어야 한다.
  // 특례가 적용되면 `finalizeTransferTax`를 거치지 않으므로 종전에는 `input.amendment`가 있어도
  // `amendmentDetail`이 undefined로 반환돼 결과 화면에서 추가납부세액이 통째로 사라졌다
  // (양도차손 조기반환이 `transfer-tax.ts:371`에서 같은 이유로 이 필드를 명시적으로 싣는다).
  // 인자 축은 finalize와 동일한 「감면 전 결정세액」 — 이 경로는 감면이 없어 산출세액과 같다.
  // `amendmentDetail`은 totalTax에 반영되지 않는 echo이므로 세액은 불변이다.
  const amendmentDetail = input.amendment
    ? computeAmendment(input.amendment, rheDeterminedTax)
    : undefined;
  if (amendmentDetail) {
    for (const s of amendmentDetail.steps) steps.push({ ...s, sub: s.sub ?? true });
  }

  return {
    amendmentDetail,
    // 결과 화면 상단 경고 — steps를 펼치지 않아도 보이게 한다(F08).
    ...(reductionNotice ? { warnings: [reductionNotice] } : {}),
    // 배율 초과분이 남아 있으면 자산 전체가 비과세된 것이 아니다(그 부분은 전액 과세된다).
    isExempt: totalTaxableIncome === 0,
    exemptReason: totalTaxableIncome === 0 ? "장기임대주택 보유자 거주주택 비과세 (§155⑳)" : undefined,
    transferGain,
    taxableGain: totalTaxableIncome,
    splitDetail,
    usedEstimatedAcquisition: usedEstimated,
    // 환산취득가·개산공제 분리 표기를 위해 result에 명시 (FilingFormTable 환산 분기 진입 조건)
    estimatedBase: usedEstimated ? estimatedBase : undefined,
    estimatedDeduction: usedEstimated ? estimatedDeduction : undefined,
    // 주택분 장특(종전 산식 — 표1 기준 · 분모만 배율 초과분 제외분으로 바뀐다) + 비사토분 표1 장특.
    longTermHoldingDeduction: (rhe.formulaTrace.gain95Table1 > 0
      ? housingGain - rhe.formulaTrace.gain95Table1
      : 0) + (nbl?.longTermDeduction ?? 0),
    // 장기보유공제율 — 0 강제 시 결과 카드에 "0%"로 잘못 표시되므로 실제 공제율 산출
    longTermHoldingRate: transferGain > 0 && rhe.formulaTrace.gain95Table1 > 0
      ? ((housingGain - rhe.formulaTrace.gain95Table1) + (nbl?.longTermDeduction ?? 0)) / transferGain
      : 0,
    lthdStartDate: resolveLTHDStartDate(effectiveInput),
    nontaxableGainAmount,
    basicDeduction: rhe.taxableGain > 0 ? rheBasicDeduction : 0,
    taxBase: rheTaxBase,
    appliedRate: rheTaxResult.appliedRate,
    progressiveDeduction: rheTaxResult.progressiveDeduction,
    calculatedTax: rheTaxResult.calculatedTax,
    isSurchargeSuspended: false,
    /**
     * 감면 fan-out — **다건(aggregate) 전파**까지 포함한다(F08).
     *
     * `transfer-tax-aggregate.ts` M-8은 `reductionTypeApplied`·`reducibleIncome`을 보고
     * 유형별로 합산해 §133 한도를 다시 적용한다. 종전처럼 0을 반환하면 다건 신고에서
     * 이 자산의 감면만 **조용히 사라진다** — 단건에서 고쳐도 다건에서 되살아나는 결함이 된다.
     */
    reductionAmount: rheReductionAmount,
    reductionType: reductionResult.reductionType,
    reductionTypeApplied: reductionResult.reductionTypeApplied,
    reducibleIncome: reductionResult.reducibleIncome,
    aggregateReductionRate: reductionResult.aggregateReductionRate,
    rentalReductionDetail: reductionResult.rentalReductionDetail,
    publicExpropriationDetail: reductionResult.publicExpropriationDetail,
    gbDesignatedLandDetail: reductionResult.gbDesignatedLandDetail,
    replacementLandDetail: reductionResult.replacementLandDetail,
    selfFarmingReductionDetail: reductionResult.selfFarmingReductionDetail,
    rental97TaxDetail: reductionResult.rental97TaxDetail,
    determinedTax: rheDeterminedTax,
    penaltyTax: 0,
    penaltyBase: 0,
    localIncomeTax: rheLocalIncomeTax,
    /**
     * [echo] 농특세 — 종전에는 `totalTax`에만 넣고 이 키를 빠뜨렸다 (D10-03).
     *
     * 이 경로는 `transfer-tax.ts`에서 조기반환해 echo를 채우는 `finalizeTransferTax`를
     * 건너뛴다. 그래서 소비층(`reduction-eligible-income.ts`의 `resolveRuralSurtax` ·
     * `ResultPdfDocument.tsx`)이 `undefined`를 보고 **차감형 detail 합(=0)** 으로 떨어졌고,
     * 이 경로는 차감형을 애초에 계산하지 않으므로 항상 0이었다 —
     * 결과 카드·신고서·PDF의 농특세 칸이 0인데 총 납부세액에는 포함돼 「항목 합 ≠ 총액」이 됐다.
     * 형제 경로 `transfer-tax-redevelopment.ts`가 같은 결함을 이미 고쳤다.
     */
    ruralSurtax: rheSurtaxVerdict.surtax,
    totalTax: rheDeterminedTax + rheLocalIncomeTax + filingDelayedPenalty + rheSurtaxVerdict.surtax,
    steps,
    rentalHousingExceptionDetail: rhe,
    penaltyDetail,
  };
}
