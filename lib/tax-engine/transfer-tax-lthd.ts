/**
 * H-5: calcLongTermHoldingDeduction — 장기보유특별공제 (「소득세법」 §95②·⑤)
 *
 * 800줄 정책에 따라 `transfer-tax-helpers.ts`에서 분리(2026-08-05). 하위 호환을 위해
 * helpers가 재수출하므로 기존 import 경로는 그대로 쓸 수 있다.
 *
 * 분기 순서가 곧 법령 우선순위다:
 *   L-0  미등기 — 배제 (§95② 단서)
 *   L-0a 분양권·승계입주권 — 배제
 *   L-1  중과세 적용 중 — 배제
 *   L-1b 부수토지 일체과세 — 주택 기준 표1/표2
 *   L-1c 장기임대 특례율 우선
 *   L-2  §95⑤·⑥ 비주택 → 주택 용도변경 혼합 (표1 + 표2)
 *   L-2' §97의3·§97의4 장기임대 장특 특례
 *   L-3  1세대1주택 표2 / L-4 일반 표1
 */
import { format } from "date-fns";
import {
  applyRate,
  applyRateFraction,
  calculateHoldingPeriod,
  LTHD_CONVERSION_95_5_CUTOFF,
} from "./tax-utils";
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";
// 「소득세법」 §95⑤ 용도변경 — 기간 분해·보유분 공제율 leaf (UI 미리보기와 같은 함수를 쓴다)
import { calcUsagePeriodInfo } from "./usage-period-info";
import { calcConversionHoldingPct } from "./conversion-holding-pct";
// 「소득세법」 §95② 표1·표2 공제율 **정본**(3년 가드 내장). 사본을 새로 만들지 말 것.
import { calcLongTermRate } from "./transfer-tax-mixed-use-inheritance";
import { TRANSFER } from "./legal-codes";
import type { LthdExclusionReason } from "./legal-codes/transfer";
import { resolveLTHDStartDate } from "./transfer-tax-lthd-start";
import { resolveExemptionResidenceMonths } from "./transfer-tax-exemption";
import { getLongTermDeductionOverride } from "./rental-housing-reduction";
import { evaluateRental97Lthd } from "./transfer-reductions/rental-97-router";
import type { Rental97Result } from "./transfer-reductions/types";
import type { LongTermRentalRuleSet } from "./schemas/rate-table.schema";
import type { TransferTaxInput, SplitGainResult } from "./types/transfer.types";
import type { UsageConversionDetail } from "./types/transfer-result.types";
import type { ParsedRates } from "./transfer-tax-helpers";

interface LongTermHoldingResult {
  deduction: number;
  rate: number;
  holdingPeriod: { years: number; months: number };
  /** §97의3·§97의4 평가 결과 echo (Phase 2 — 2026-06-11). 평가 항목이 없으면 undefined. */
  rental97LthdDetail?: Rental97Result;
  /** 배제 사유 echo — 배제 경로(L-0·L-0a·L-1)에서만. 미배제(공제율 미달 포함)는 undefined. */
  exclusionReason?: LthdExclusionReason;
  /** §95⑤·⑥ 용도변경 혼합 공제 적용 내역 echo (L-2 분기에서만). 미적용은 undefined. */
  usageConversionDetail?: UsageConversionDetail;
}

export function calcLongTermHoldingDeduction(
  taxableGain: number,
  input: TransferTaxInput,
  rules: ParsedRates["longTermHoldingRules"],
  isSurcharge: boolean,
  isSuspended: boolean,
  longTermRentalRules?: LongTermRentalRuleSet,
  splitDetail?: SplitGainResult,
): LongTermHoldingResult {
  // L-0: 미등기 — 배제
  if (input.isUnregistered) {
    return { deduction: 0, rate: 0, holdingPeriod: { years: 0, months: 0 }, exclusionReason: "unregistered" };
  }

  // L-0a: 분양권·승계입주권 — 배제
  if (input.propertyType === "presale_right") {
    return { deduction: 0, rate: 0, holdingPeriod: { years: 0, months: 0 }, exclusionReason: "presale_right" };
  }
  if (input.propertyType === "right_to_move_in" && input.isSuccessorRightToMoveIn === true) {
    return { deduction: 0, rate: 0, holdingPeriod: { years: 0, months: 0 }, exclusionReason: "successor_right_to_move_in" };
  }

  // L-1: 중과세 적용 중(유예 해제)이면 배제
  if (isSurcharge && !isSuspended) {
    return { deduction: 0, rate: 0, holdingPeriod: { years: 0, months: 0 }, exclusionReason: "multi_house_surcharge" };
  }

  // L-1b: 부수토지 일체과세 (landNature === "appurtenant_to_housing")
  // — 포괄적 일체과세 원칙: primary 주택의 보유기간·거주기간 기준 표 1/2 적용
  // — 단기보유(1년 미만 → 70%, 1~2년 → 60%) 시에는 LTHD 배제 (세율에서 이미 처리됨)
  // — 2년 이상 보유 시 주택 기준 LTHD 적용 (primaryContextForCompanionRate에서 holdingMonths 사용)
  if (
    input.propertyType === "land" &&
    input.landNature === "appurtenant_to_housing" &&
    input.primaryContextForCompanionRate
  ) {
    const ctx = input.primaryContextForCompanionRate;
    // primary 주택 보유기간 기준
    const primaryHoldingYears = Math.floor(ctx.holdingMonths / 12);
    // 2026-07-29 정정(#591 감사 R7 — **세액 변경**): 게이트가 24개월(2년)이라
    //   주 주택 2~3년 보유 구간에서 **존재하지 않는 장기보유특별공제**가 부여됐다.
    //   §95②의 진입요건은 **보유기간 3년 이상**이며, 같은 함수의 일반 경로
    //   `rateForYears`도 `years < 3 → 0` 게이트를 갖고 있다(내부 불일치였다).
    //   24개월 게이트는 "2년 미만 = 단기세율"이라는 **다른 규칙**을 LTHD 요건으로
    //   착각한 것이다 — 단기세율 여부와 LTHD 3년 요건은 별개 판정이다.
    if (ctx.holdingMonths < 36) {
      const holding = calculateHoldingPeriod(input.acquisitionDate, input.transferDate);
      return { deduction: 0, rate: 0, holdingPeriod: { years: holding.years, months: holding.months } };
    }
    // 2년 이상: primary 주택 기준 LTHD 계산
    // 부수토지는 1세대1주택 여부·거주기간을 주택과 공유
    const isOneHouseSingleForCompanion =
      input.isOneHousehold && input.householdHousingCount === 1;
    const residenceYears = Math.floor(input.residencePeriodMonths / 12); // 실거주(거주분 공제율)
    const table2ResidenceYears = Math.floor(resolveExemptionResidenceMonths(input) / 12); // 통산(대상 판정)
    // 표2(1세대1주택 — 보유분 4% + 실거주분 4%, 각 40% 캡) / 표1(일반 보유 × 2%, 30% 캡).
    // 정본 위임 — 외곽 `holdingMonths < 36` return이 정본의 3년 가드와 등가라 중복 판정 없음.
    const companionRate = calcLongTermRate(
      primaryHoldingYears,
      residenceYears,
      isOneHouseSingleForCompanion && table2ResidenceYears >= 2,
    );
    const deduction = companionRate > 0 ? applyRate(taxableGain, companionRate) : 0;
    const holding = calculateHoldingPeriod(input.acquisitionDate, input.transferDate);
    return {
      deduction,
      rate: companionRate,
      holdingPeriod: { years: holding.years, months: holding.months },
    };
  }

  // L-1c: 장기임대주택 특례율 우선 적용
  if (input.rentalReductionDetails && longTermRentalRules) {
    const override = getLongTermDeductionOverride(
      input.rentalReductionDetails,
      longTermRentalRules,
    );
    if (override.hasOverride) {
      const holding = calculateHoldingPeriod(input.acquisitionDate, input.transferDate);
      const deduction = applyRate(taxableGain, override.overrideRate);
      return {
        deduction,
        rate: override.overrideRate,
        holdingPeriod: { years: holding.years, months: holding.months },
      };
    }
  }

  const isOneHouseSingle =
    input.isOneHousehold && input.householdHousingCount === 1;
  const residenceYears = Math.floor(input.residencePeriodMonths / 12); // 실거주(표2 거주분 공제율)
  // §154⑧3호: 표2 "대상 판정"은 동일세대 상속 통산 거주 (공제율은 실거주 residenceYears 유지).
  const table2ResidenceYears = Math.floor(resolveExemptionResidenceMonths(input) / 12);

  // L-2: 「소득세법」 §95⑤·⑥ — 비주택으로 보유하다 주택으로 용도변경한 뒤 양도하는 경우.
  //   보유분 = 비주택 기간 표1 + 주택 기간 표2 (합계 40% 한도 — 같은 항 1호 단서)
  //   거주분 = 표2 거주분 (주택으로 보유한 기간 중의 거주기간 — 같은 항 2호)
  // 게이트는 §95⑤ 본문("제89조 제1항 제3호 각 목의 어느 하나에 해당하는 자산")이 여는
  // 표2 대상 요건과 같다 — 시행령 §159의4가 §95⑤을 명시 포함한다.
  // 배제 경로(L-0 미등기·L-0a 분양권·L-1 중과·L-1b 부수토지·L-1c 임대특례)는 위에서 이미 return했다.
  if (
    input.nonHousingToHousingConversion &&
    input.transferDate >= LTHD_CONVERSION_95_5_CUTOFF &&
    isOneHouseSingle &&
    table2ResidenceYears >= 2 &&
    !splitDetail // 토지·건물 분리취득과는 병용하지 않는다 (validation과 이중 방어)
  ) {
    const conv = input.nonHousingToHousingConversion;
    const info = calcUsagePeriodInfo(
      input.acquisitionDate,
      conv.residentialUseStartDate,
      input.transferDate,
    );
    // 폼 경로는 validation이 막지만 엔진 단독 호출(단위 테스트·자산별 직접 호출)은 거치지 않는다.
    // 기간 분해가 불가능한 날짜는 조용히 무시하지 않고 드러낸다.
    if (!info) {
      throw new TaxCalculationError(
        TaxErrorCode.INVALID_DATE,
        `주거용 사용 개시일은 취득일 이후·양도일 이전이어야 합니다 (${TRANSFER.CONVERSION_HOUSING_PERIOD_START}).`,
        {
          acquisitionDate: input.acquisitionDate,
          residentialUseStartDate: conv.residentialUseStartDate,
          transferDate: input.transferDate,
        },
      );
    }

    const { table1Pct, table2HoldingPct, holdingPct, capped } = calcConversionHoldingPct(
      info.t1HoldingYears,
      info.t2HoldingYears,
    );

    // 거주분 — 표2 거주 8% 칸의 "(보유기간 3년 이상에 한정함)"은 **총 보유기간** 기준이다(V-4 확정).
    //   ① §95④ — "제2항에서 규정하는 자산의 보유기간은 취득일부터 양도일까지". 표2는 제2항의 표다.
    //   ② §95⑥ — 재정의 대상은 「주택으로 보유한 기간」이라는 별개 개념어이고 "보유기간"은 건드리지 않았다.
    //   ③ §95⑤ 첫머리는 "제2항 **단서**에도 불구하고" — 본문의 "보유기간 3년 이상" 대상 요건은 살아 있다.
    //   ④ §95⑤2호가 특정한 것은 거주기간 열에 **대입할 값**뿐이고 단서의 요건은 언급이 없다.
    // 반대해석(주택 보유기간 기준)은 ⑤1호가 표2 보유기간 열에 주택 기간을 대입하는 점을 근거로 하나,
    // 명문 없이 공제를 8%p 줄이는 방향이라 채택하지 않는다. 예규·심판례는 2026-08-05 현재 0건.
    const totalHolding = calculateHoldingPeriod(input.acquisitionDate, input.transferDate);
    const residencePct = totalHolding.years < 3 ? 0 : Math.min(residenceYears * 4, 40);

    const totalPct = holdingPct + residencePct;
    return {
      // 정수 % + 분수 연산 — 표1(2% 배수) + 표2(4% 배수) 합이 소수로는 부정확해진다
      // (0.22 + 0.12 = 0.33999999999999997 → 1원 과소). conversion-holding-pct.ts 참조.
      deduction: applyRateFraction(taxableGain, totalPct, 100),
      rate: totalPct / 100, // 표시용
      holdingPeriod: { years: totalHolding.years, months: totalHolding.months },
      usageConversionDetail: {
        residentialUseStartDate: format(conv.residentialUseStartDate, "yyyy-MM-dd"),
        nonHousingYears: info.t1HoldingYears,
        housingYears: info.t2HoldingYears,
        table1Pct,
        table2HoldingPct,
        residencePct,
        holdingRateCapped: capped,
        residenceMonthsTrimmed: conv.residenceMonthsTrimmed,
      },
    };
  }

  // 공제율 산식 (L-3/L-4 통합 헬퍼) — `calcLongTermRate` 정본 위임.
  //   L-3: 1세대1주택 표2(§95② 별표) — 보유분·거주분 각 40% 캡 후 합산.
  //        대상 판정은 통산(table2ResidenceYears), 공제율 거주분은 실거주(residenceYears).
  //   L-4: 일반 표1 — 보유 × 2%, 30% 캡.
  //   3년 가드는 정본에 내장돼 있다.
  const rateForYears = (years: number): number =>
    calcLongTermRate(years, residenceYears, isOneHouseSingle && table2ResidenceYears >= 2);

  // 토지/건물 분리 케이스 — 각각 보유연수 적용 후 합산
  if (splitDetail) {
    const selfOwns = splitDetail.selfOwns ?? "both";
    const ownsLand = selfOwns !== "building_only";
    const ownsBuilding = selfOwns !== "land_only";

    // 1세대1주택 12억 초과 안분: 본인 소유 파트 양도가액 기준
    const THRESHOLD = 1_200_000_000;
    const selfTransferPrice = selfOwns === "building_only"
      ? splitDetail.building.transferPrice
      : selfOwns === "land_only"
        ? splitDetail.land.transferPrice
        : input.transferPrice;
    const isProratedSplit = isOneHouseSingle && selfTransferPrice > THRESHOLD;
    const proratePartGain = (g: number): number => {
      if (!isProratedSplit || g <= 0) return g;
      return Math.floor(g * (selfTransferPrice - THRESHOLD) / selfTransferPrice);
    };

    // 파트별 과세 양도차익 — 호출부가 미리 확정해 두었으면(G-3 부수토지 비과세 제외 등) 그 값을
    // 따른다. 여기서 다시 안분하면 STEP 3의 과세 양도차익과 어긋난다(이중 진실).
    const landTaxableGain = ownsLand
      ? (splitDetail.land.taxableGainAfterProration ?? proratePartGain(splitDetail.land.gain))
      : 0;
    const buildingTaxableGain = ownsBuilding
      ? (splitDetail.building.taxableGainAfterProration ?? proratePartGain(splitDetail.building.gain))
      : 0;

    const landRate = ownsLand ? rateForYears(splitDetail.land.holdingYears) : 0;
    const buildingRate = ownsBuilding ? rateForYears(splitDetail.building.holdingYears) : 0;
    const landDed = ownsLand ? applyRate(Math.max(landTaxableGain, 0), landRate) : 0;
    const buildingDed = ownsBuilding ? applyRate(Math.max(buildingTaxableGain, 0), buildingRate) : 0;

    // SplitPartResult 에 공제율·공제액 채우기 (참조 수정)
    // 과세 양도차익도 함께 역기입 — 소비자(파트별 세율 §104⑤)가 `gain`(안분 전)과
    // `longTermDeduction`(안분 후) 축을 섞지 않도록 한다.
    splitDetail.land.taxableGainAfterProration = landTaxableGain;
    splitDetail.building.taxableGainAfterProration = buildingTaxableGain;
    splitDetail.land.longTermRate = landRate;
    splitDetail.land.longTermDeduction = landDed;
    splitDetail.building.longTermRate = buildingRate;
    splitDetail.building.longTermDeduction = buildingDed;

    // 배율 초과 부수토지(비사업용 토지) 파트 — 「소득세법」 제95조 제2항 **표1**(일반)을 쓴다.
    // 1세대1주택 표2는 비과세 대상 주택·부수토지 전용이고, 배율 초과분은 §104의3①5호로
    // 비사업용 토지이므로 대상이 아니다. 보유연수는 토지 본래 보유연수.
    const nb = splitDetail.nonBusinessLandPart;
    let nbDed = 0;
    if (nb) {
      const nbTaxableGain = nb.taxableGainAfterProration ?? nb.gain;
      const nbRate = calcLongTermRate(nb.holdingYears, 0, false); // 표1 — 정본 위임(3년 가드 내장)
      nbDed = applyRate(Math.max(nbTaxableGain, 0), nbRate);
      nb.taxableGainAfterProration = nbTaxableGain;
      nb.longTermRate = nbRate;
      nb.longTermDeduction = nbDed;
    }

    const anchorDate = selfOwns === "land_only" && input.landAcquisitionDate
      ? input.landAcquisitionDate
      : input.acquisitionDate;
    const anchorHolding = calculateHoldingPeriod(anchorDate, input.transferDate);
    return {
      deduction: landDed + buildingDed + nbDed,
      rate: 0, // 단일 공제율 없음 (혼합) — splitDetail.land/building.longTermRate 참조
      holdingPeriod: { years: anchorHolding.years, months: anchorHolding.months },
    };
  }

  // 단일 취득일 — 사례 35: 다주택 용도변경 시 LTHD 기산일 = conversionDate (사전법규재산 2022-684)
  const holding = calculateHoldingPeriod(resolveLTHDStartDate(input), input.transferDate);
  const holdingPeriod = { years: holding.years, months: holding.months };

  const rate = rateForYears(holding.years);

  // L-2': 장기임대 §97의3 (장특 70% 대체) / §97의4 (추가율 가산) — Phase 2 (2026-06-11)
  // reductions[]의 rental_97_3/rental_97_4 본 필드 항목을 평가. 임대분 안분은 조특령 §97의3⑤.
  const rental97Eval = evaluateRental97Lthd(input.reductions, {
    transferDate: input.transferDate,
    acquisitionDate: input.acquisitionDate,
    stdPriceAtAcquisition: input.standardPriceAtAcquisition,
    stdPriceAtTransfer: input.standardPriceAtTransfer,
  });
  if (
    rental97Eval?.isEligible &&
    rental97Eval.effectCategory === "long_term_holding_special" &&
    rental97Eval.overrideRate !== undefined
  ) {
    // §97의3: 임대기간 분 양도차익 × 70% + 비임대분 × 일반율 (ratio=1이면 전액 70%)
    const positiveGain = Math.max(taxableGain, 0);
    const rentalGain = applyRate(positiveGain, rental97Eval.rentalGainRatio);
    const nonRentalGain = positiveGain - rentalGain;
    const deduction = applyRate(rentalGain, rental97Eval.overrideRate) + applyRate(nonRentalGain, rate);
    const blendedRate =
      rental97Eval.overrideRate * rental97Eval.rentalGainRatio + rate * (1 - rental97Eval.rentalGainRatio);
    return { deduction, rate: blendedRate, holdingPeriod, rental97LthdDetail: rental97Eval };
  }
  if (
    rental97Eval?.isEligible &&
    rental97Eval.effectCategory === "long_term_holding_additional" &&
    rental97Eval.additionalRate !== undefined
  ) {
    // §97의4: 보유기간별 공제율(§95② 표)에 추가율 가산 — 기본 공제율이 0(보유 3년 미만)이면 가산 불가
    if (rate > 0) {
      const combined = rate + rental97Eval.additionalRate;
      return {
        deduction: applyRate(taxableGain, combined),
        rate: combined,
        holdingPeriod,
        rental97LthdDetail: rental97Eval,
      };
    }
    return { deduction: 0, rate: 0, holdingPeriod, rental97LthdDetail: rental97Eval };
  }

  if (rate > 0) {
    const deduction = applyRate(taxableGain, rate);
    return { deduction, rate, holdingPeriod, rental97LthdDetail: rental97Eval };
  }

  return { deduction: 0, rate: 0, holdingPeriod, rental97LthdDetail: rental97Eval };
}
