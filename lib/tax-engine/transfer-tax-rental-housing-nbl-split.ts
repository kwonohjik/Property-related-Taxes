/**
 * STEP 2.5 헬퍼 — §155⑳ 거주주택 특례의 **주택 부수토지 배율 초과분 분리**와 §104⑤ 비교과세.
 *
 * `transfer-tax-rental-housing-step.ts` 800줄 정책 분리 — 로직은 그대로 옮겼다. 순수 함수(DB 호출 없음).
 */
import { applyRate, calculateProgressiveTax } from "./tax-utils";
import { NBL, TRANSFER } from "./legal-codes/transfer";
import { calcTable1Rate } from "./transfer-tax/rental-housing-exception/ltc-table-split";
import type { TransferTaxInput, CalculationStep } from "./types/transfer.types";
import type { SplitGainResult } from "./types/transfer-split-gain.types";
import type { MultiHouseSurchargeResult } from "./multi-house-surcharge";
import { calcTax, computeBracketBreakdown } from "./transfer-tax-rate-calc";
import type { RateGroup } from "./types/transfer-aggregate.types";
import {
  resolveAppurtenantLandExcess,
  resolveLandStatutoryAcquisitionDate,
  isLaterAcquiredLandExemptExcluded,
  laterLandExclusionReason,
  buildNblPartRateInput,
} from "./transfer-tax-appurtenant-land";
import { allocateBasicDeductionAcrossParts } from "./transfer-tax-aggregate-helpers";
import { calcOneHouseProration, type ParsedRates } from "./transfer-tax-helpers";
import { highValueExcessLandTaxableGain } from "./high-value-excess-land";
import type { HighValueExcessRulingTrace } from "./transfer-tax/rental-housing-exception/types";

/**
 * 주택 부수토지 **배율 초과분**(「소득세법」 제104조의3 제1항 제5호 비사업용 토지) 분리 결과.
 *
 * §155⑳은 거주주택을 "국내에 1개의 주택을 소유하고 있는 것으로 보아 **제154조제1항을
 * 적용**"할 뿐이다 — 비과세 범위는 §154①과 그 위임인 §154⑦(정착면적 × 지역별 배율)이 정하므로,
 * **배율 초과분은 특례의 의제 대상 밖**이다(§155①·§155②와 같은 문형이며 일반 경로
 * `applyHousingLandExclusions`가 이미 그렇게 구현돼 있다).
 */
export interface AppurtenantExcessSplit {
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
export function splitAppurtenantExcess(
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
    rateInput: buildNblPartRateInput(input, basisDate),
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
 * G-3 — 주택보다 **나중에 취득**해 영 §154① 보유요건에 못 미치는 부수토지분(배율 초과분 제외)을 특례 경로에서도 비과세 범위에서 뗀 결과.
 *
 * §155⑳은 거주주택을 「1개의 주택을 소유하고 있는 것으로 보아 제154조제1항을 적용」할 뿐이라 비과세 범위는 §154①이 정한다 — 일반 경로는 같은 술어
 * (`isLaterAcquiredLandExemptExcluded`)로 이 토지분을 12억 안분 없이 전액 과세한다(`applyHousingLandExclusions`). 특례가 주택 수 의제만 하고 이 범위를
 * 바꾸지 않으므로 특례 on/off가 같은 사실에서 같은 세액이 되려면 이 경로도 같은 술어로 토지분을 떼어야 한다.
 * 토지분이 빠진 뒤 특례(A1·A2)가 적용되는 주택분은 **건물분**뿐이다 — 일반 경로와 같이 건물 양도차익의 음수는 0으로 본다(토지 손실로 상쇄하지 않는다).
 *
 * 장기보유특별공제는 토지 본래 보유연수(보유요건 미달 = 3년 미만)의 표1이라 0이다 — 일반 경로(`calcLongTermHoldingDeduction` split 분기)가 같은 값을 낸다.
 * 대상이 아니면 `null`(종전 경로 유지).
 */
export interface LaterLandExcludedSplit {
  /** 비과세에서 빠져 전액 과세되는 토지분 양도차익(배율 초과분 제외) */
  gain: number;
  longTermRate: number;
  longTermDeduction: number;
  /** 토지분 양도소득금액 = gain − longTermDeduction */
  income: number;
  holdingYears: number;
  /** 특례(A1·A2)가 적용되는 주택분 양도차익 = 건물분(음수는 0) */
  housingGain: number;
  step: CalculationStep | null;
}

export function splitLaterAcquiredLand(
  input: TransferTaxInput,
  splitDetail: SplitGainResult | undefined,
  /** 이미 떼어낸 배율 초과분 양도차익(없으면 0) */
  nonBusinessGain: number,
): LaterLandExcludedSplit | null {
  if (!splitDetail) return null;
  if (!isLaterAcquiredLandExemptExcluded(input)) return null;
  const gain = Math.max(0, splitDetail.land.gain) - nonBusinessGain;
  const holdingYears = splitDetail.land.holdingYears;
  const longTermRate = calcTable1Rate(holdingYears);
  const longTermDeduction = applyRate(gain, longTermRate);
  const housingGain = Math.max(0, splitDetail.building.gain);
  return {
    gain,
    longTermRate,
    longTermDeduction,
    income: gain - longTermDeduction,
    holdingYears,
    housingGain,
    step:
      gain > 0
        ? {
            label: "부수토지 비과세 제외 (§155⑳ 특례 경로)",
            formula:
              `${laterLandExclusionReason(input, gain)} — §155⑳은 거주주택을 1주택으로 보아 제154조제1항을 적용할 뿐이라 이 토지분은 특례 대상 주택분에 넣지 않았습니다 · ` +
              `특례 대상 주택분(건물) 양도차익 ${housingGain.toLocaleString()}`,
            amount: gain - longTermDeduction,
            legalBasis: TRANSFER.ONE_HOUSE_EXEMPT,
          }
        : null,
  };
}

/**
 * G-3 토지분이 빠진 특례 결과의 **파트별 세율 판정 입력**(`resolveSplitAwareTax`가 읽는 `splitDetail` 사본).
 *
 * 일반 경로는 나중 취득 토지분(보유 2년 미만 — 단기세율)과 건물분(오래 보유 — 누진세율)을 파트별 §104② 기산일로 나눠 §104⑤ 비교과세를 한다.
 * 특례 경로도 같은 사실에서 같은 세율을 적용해야 하므로 같은 함수에 파트 소득금액을 넘긴다 — 건물 파트 = 특례 적용 후 과세대상 양도소득금액
 * (`housingIncome` — 장기보유특별공제·12억 안분이 끝난 값이라 공제 0으로 싣는다), 토지 파트 = G-3 토지분, 배율 초과분은 별도 파트.
 * 원본 `splitDetail`(결과 카드·신고서가 읽는 파트 echo)은 건드리지 않는다.
 */
export function buildRentalPartRateDetail(
  splitDetail: SplitGainResult,
  args: { housingIncome: number; laterLand: LaterLandExcludedSplit; nbl: AppurtenantExcessSplit | null },
): SplitGainResult {
  const { housingIncome, laterLand, nbl } = args;
  return {
    ...splitDetail,
    land: { ...splitDetail.land, taxableGainAfterProration: laterLand.gain, longTermDeduction: laterLand.longTermDeduction },
    building: { ...splitDetail.building, taxableGainAfterProration: housingIncome, longTermDeduction: 0 },
    nonBusinessLandPart: nbl
      ? {
          limitArea: nbl.limitArea,
          excessArea: nbl.excessArea,
          appliedMultiplier: nbl.multiplier,
          gain: nbl.gain,
          taxableGainAfterProration: nbl.gain,
          holdingYears: nbl.holdingYears,
          longTermRate: nbl.longTermRate,
          longTermDeduction: nbl.longTermDeduction,
        }
      : undefined,
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
export function resolveClause5Tax(args: Clause5Args): ReturnType<typeof calcTax> {
  return resolveClause5TaxDetailed(args).result;
}

export interface Clause5Args {
  housingIncome: number;
  /** 배율 초과분 — 이 함수가 읽는 것은 소득금액과 세율 판정 입력뿐이다(다건이 echo로 재구성할 수 있게 좁혔다) */
  nbl: Pick<AppurtenantExcessSplit, "income" | "rateInput">;
  basicDeduction: number;
  /** 자산 단위 과세표준 = (주택분 + 비사토분) − 기본공제 */
  taxBase: number;
  input: TransferTaxInput;
  parsedRates: ParsedRates;
  multiHouseSurchargeResult?: MultiHouseSurchargeResult;
}

/** `resolveClause5Tax`가 낸 파트 1건의 내역 — 다건 §104⑤ 호별 합산이 파트 단위로 읽는다. */
export interface Clause5PartDetail {
  income: number;
  allocatedBasicDeduction: number;
  taxBase: number;
  /** 파트 `calcTax` 결과 그대로 */
  tax: ReturnType<typeof calcTax>;
  /** 파트 세율 판정에 쓴 입력 — 재구성하지 않고 그대로 싣는다(dual-truth 방지) */
  rateInput: TransferTaxInput;
}

export interface Clause5Detail {
  result: ReturnType<typeof calcTax>;
  housing: Clause5PartDetail;
  nbl: Clause5PartDetail;
  /** §104⑤1호 — 과세표준 합계액에 §55① 세율 */
  clause1: number;
  /** §104⑤2호 — 파트별 산출세액의 합 */
  clause2: number;
}

/** `resolveClause5Tax`와 같은 계산 — 세액 외에 파트 내역을 함께 돌려준다(단건은 `result`만 쓴다). */
export function resolveClause5TaxDetailed(args: Clause5Args): Clause5Detail {
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
  const allocation = allocateBasicDeductionAcrossParts(
    [
      { idx: 0, income: housingIncome, rate: preHousing.appliedRate },
      { idx: 1, income: nbl.income, rate: preNbl.appliedRate },
    ],
    basicDeduction,
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

  const detail = {
    housing: {
      income: housingIncome,
      allocatedBasicDeduction: allocated(0),
      taxBase: housingBase,
      tax: housingPart,
      rateInput: housingRateInput,
    },
    nbl: {
      income: nbl.income,
      allocatedBasicDeduction: allocated(1),
      taxBase: nblBase,
      tax: nblPart,
      rateInput: nbl.rateInput,
    },
    clause1,
    clause2,
  };
  if (clause1 >= clause2) {
    const { baseRate, deduction } = computeBracketBreakdown(taxBase, parsedRates.brackets);
    return {
      ...detail,
      result: {
        calculatedTax: clause1,
        appliedRate: baseRate,
        progressiveDeduction: deduction,
        surchargeSuspended: false,
        shortTermNote:
          `배율 초과 부수토지 분리(소득세법 §104⑤ 본문 후단): 합산 누진세액 ` +
          `${clause1.toLocaleString()}이 별개 자산별 합계 ${clause2.toLocaleString()}보다 크다`,
      },
    };
  }
  return {
    ...detail,
    result: {
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
    },
  };
}


/**
 * A2(거주주택 고가주택 양도) + 배율 초과 부수토지 — 기획재정부 재산세제과-915(2011.10.27.) 회신 방식의 과세 양도차익(표2 장기보유특별공제 적용 전).
 *
 * §155⑳은 거주주택을 「1개의 주택을 소유하고 있는 것으로 보아 제154조제1항을 적용」할 뿐이라 고가주택 안분(영 §160①)은 일반 1세대1주택과 같은 산식이다 —
 * 단일 주택 경로(`applyHousingLandExclusions`)와 **같은 leaf**(`highValueExcessLandTaxableGain`)·같은 안분 함수(`calcOneHouseProration`)를 쓴다.
 * 기준면적 이내 토지분 = max(0, 전체 부수토지 양도차익의 안분값 − 초과분 양도차익), 건물분 = 안분값. 초과분(`nbl.gain`)은 이 특례 밖(비사업용 토지 — 별도 파트)이다.
 * 토지·건물 양도차익은 분리 계산 결과(`splitDetail`)가 정한다 — 음수는 단일 경로와 같이 0으로 본다.
 *
 * ⚠️ A 시나리오 전용이다. B 시나리오(§161 안분)와의 결합 순서는 법령·해석례에 근거가 없어 적용하지 않는다(호출부가 고지).
 */
export function buildRentalHighValueExcessRuling(
  input: Pick<TransferTaxInput, "transferDate" | "transferPrice" | "totalPropertyTransferPrice" | "burdenedGiftDenominator">,
  splitDetail: SplitGainResult,
  nbl: Pick<AppurtenantExcessSplit, "gain">,
): HighValueExcessRulingTrace {
  const prorate = (gain: number) =>
    calcOneHouseProration(input.transferDate, gain, input.transferPrice, input.totalPropertyTransferPrice, input.burdenedGiftDenominator);
  const wholeLandGain = Math.max(0, splitDetail.land.gain);
  const buildingGain = Math.max(0, splitDetail.building.gain);
  const landTaxableGain = highValueExcessLandTaxableGain({ landGain: wholeLandGain, excessGain: nbl.gain, prorate });
  const buildingTaxableGain = prorate(buildingGain);
  return {
    wholeLandGain,
    wholeLandProrated: prorate(wholeLandGain),
    excessGain: nbl.gain,
    landTaxableGain,
    buildingTaxableGain,
    taxableBeforeLthd: landTaxableGain + buildingTaxableGain,
  };
}
