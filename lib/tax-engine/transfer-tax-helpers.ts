/**
 * 양도소득세 기초 계산 헬퍼 (순수 함수)
 *
 * calculateTransferTax() 오케스트레이터가 조립하는 9개 헬퍼 중 기초 계산 담당.
 *   H-1: parseRatesFromMap       — DB 세율 Map 파싱
 *   H-2: checkExemption          — 비과세 판단 (E-1 ~ E-4)
 *   H-3: calcTransferGain        — 양도차익 계산
 *   H-4: calcOneHouseProration   — 12억 초과분 안분
 *   H-5: calcLongTermHoldingDeduction — 장기보유특별공제
 *   H-6: calcBasicDeduction      — 기본공제
 *
 * 세액·감면 계산 (H-6.5 ~ H-8)은 ./transfer-tax-rate-calc.ts 로 분리.
 */

import {
  applyRate,
  calculateEstimatedAcquisitionPrice,
  calculateHoldingPeriod,
  calculateProration,
} from "./tax-utils";
import { TaxRateNotFoundError } from "./tax-errors";
import { TRANSFER } from "./legal-codes";
import type { LthdExclusionReason } from "./legal-codes/transfer";
import { resolveLTHDStartDate } from "./transfer-tax-lthd-start";
import { resolveExemptionResidenceMonths } from "./transfer-tax-exemption";
import {
  resolveConversionDenominatorAtTransfer,
  type ExpropriationValuationDetail,
  type AuctionValuationDetail,
  type HousingExpropriationValuationDetail,
} from "./transfer-tax-expropriation-valuation";
import {
  parseDeductionRules,
  parseProgressiveRate,
  parseSurchargeRate,
  parseHouseCountExclusion,
  parseNonBusinessLandJudgment,
  parseLongTermRentalRuleSet,
  parseNewHousingMatrix,
  type DeductionRulesData,
  type OneHouseSpecialRulesData,
  type SurchargeRateData,
  type SurchargeSpecialRulesData,
  type HouseCountExclusionData,
  type RegulatedAreaHistoryData,
  type NonBusinessLandJudgmentSchemaData,
  type LongTermRentalRuleSet,
  type NewHousingMatrixData,
} from "./schemas/rate-table.schema";
import { toRegulatedAreaHistory } from "./data/regulated-areas";
import { getLongTermDeductionOverride } from "./rental-housing-reduction";
import { getRate } from "@/lib/db/tax-rates";
import type { TaxBracket } from "./types";
import type { TaxRatesMap } from "@/lib/db/tax-rates";
import type {
  TransferTaxInput,
  SplitGainResult,
  TransferTaxResult,
} from "./types/transfer.types";
import type {
  MultiHouseSurchargeResult,
} from "./multi-house-surcharge";
import { calcSplitGain } from "./transfer-tax-split-gain";
import { evaluateRental97Lthd } from "./transfer-reductions/rental-97-router";
import type { Rental97Result } from "./transfer-reductions/types";

// ============================================================
// 내부 파싱 결과 타입 — transfer-tax-rate-calc.ts 에서도 import
// ============================================================

export interface ParsedRates {
  brackets: TaxBracket[];
  longTermHoldingRules: Extract<DeductionRulesData, { type: "long_term_holding" }>;
  basicDeductionRules: Extract<DeductionRulesData, { type: "basic_deduction" }>;
  surchargeRates: SurchargeRateData;
  surchargeSpecialRules: SurchargeSpecialRulesData;
  oneHouseSpecialRules: OneHouseSpecialRulesData;
  selfFarmingRules?: Extract<DeductionRulesData, { type: "self_farming" }>;
  houseCountExclusionRules?: HouseCountExclusionData;
  regulatedAreaHistory?: RegulatedAreaHistoryData;
  nonBusinessLandJudgmentRules?: NonBusinessLandJudgmentSchemaData;
  longTermRentalRules?: LongTermRentalRuleSet;
  newHousingMatrix?: NewHousingMatrixData;
}

// ============================================================
// H-1: parseRatesFromMap — DB 세율 Map 파싱
// ============================================================

export function parseRatesFromMap(rates: TaxRatesMap): ParsedRates {
  const progressiveRecord = getRate(rates, "transfer", "progressive_rate");
  if (!progressiveRecord) {
    throw new TaxRateNotFoundError("양도소득세 누진세율(progressive_rate:_default)이 없습니다");
  }
  const { brackets } = parseProgressiveRate(progressiveRecord.rateTable);
  const normalizedBrackets: TaxBracket[] = brackets.map((b) => ({
    min: b.min,
    max: b.max ?? null,
    rate: b.rate,
    deduction: b.deduction,
  }));

  const lthdRecord = getRate(rates, "transfer", "deduction", "long_term_holding");
  if (!lthdRecord) throw new TaxRateNotFoundError("장기보유특별공제 규칙(deduction:long_term_holding)이 없습니다");
  const lthdRules = parseDeductionRules(lthdRecord.deductionRules);
  if (lthdRules.type !== "long_term_holding") throw new TaxRateNotFoundError("장기보유특별공제 규칙 타입 오류");

  const basicRecord = getRate(rates, "transfer", "deduction", "basic");
  if (!basicRecord) throw new TaxRateNotFoundError("기본공제 규칙(deduction:basic)이 없습니다");
  const basicRules = parseDeductionRules(basicRecord.deductionRules);
  if (basicRules.type !== "basic_deduction") throw new TaxRateNotFoundError("기본공제 규칙 타입 오류");

  const surchargeRecord = getRate(rates, "transfer", "surcharge");
  if (!surchargeRecord) throw new TaxRateNotFoundError("중과세율(surcharge:_default)이 없습니다");
  const surchargeRates = parseSurchargeRate(surchargeRecord.rateTable);
  const surchargeSpecialRules = surchargeRecord.specialRules as SurchargeSpecialRulesData;

  const oneHouseRecord = getRate(rates, "transfer", "special", "one_house_exemption");
  if (!oneHouseRecord) throw new TaxRateNotFoundError("1세대1주택 특례(special:one_house_exemption)가 없습니다");
  const oneHouseSpecialRules = oneHouseRecord.specialRules as OneHouseSpecialRulesData;

  const selfFarmingRecord = getRate(rates, "transfer", "deduction", "self_farming");
  let selfFarmingRules: ParsedRates["selfFarmingRules"] | undefined;
  if (selfFarmingRecord) {
    const parsed = parseDeductionRules(selfFarmingRecord.deductionRules);
    if (parsed.type === "self_farming") selfFarmingRules = parsed;
  }

  const houseCountRecord = getRate(rates, "transfer", "special", "house_count_exclusion");
  let houseCountExclusionRules: HouseCountExclusionData | undefined;
  if (houseCountRecord?.specialRules) {
    houseCountExclusionRules = parseHouseCountExclusion(houseCountRecord.specialRules);
  }

  // 조정대상지역 이력 — 정적 데이터 우선 사용 (DB 키 없어도 동작).
  // DB 키(transfer:special:regulated_areas)는 optional로 남기고 미사용.
  // 정밀 판정(isRegulatedByBjdCode)은 data/regulated-areas.ts 단일 소스로 처리.
  const regulatedAreaHistory: RegulatedAreaHistoryData = toRegulatedAreaHistory();

  const nonBizLandRecord = getRate(rates, "transfer", "special", "non_business_land_judgment");
  let nonBusinessLandJudgmentRules: NonBusinessLandJudgmentSchemaData | undefined;
  if (nonBizLandRecord?.specialRules) {
    nonBusinessLandJudgmentRules = parseNonBusinessLandJudgment(nonBizLandRecord.specialRules);
  }

  const longTermRentalRecord = getRate(rates, "transfer", "deduction", "long_term_rental_v2");
  let longTermRentalRules: LongTermRentalRuleSet | undefined;
  if (longTermRentalRecord?.deductionRules) {
    longTermRentalRules = parseLongTermRentalRuleSet(longTermRentalRecord.deductionRules);
  }

  const newHousingRecord = getRate(rates, "transfer", "deduction", "new_housing_matrix");
  let newHousingMatrix: NewHousingMatrixData | undefined;
  if (newHousingRecord?.deductionRules) {
    newHousingMatrix = parseNewHousingMatrix(newHousingRecord.deductionRules);
  }

  return {
    brackets: normalizedBrackets,
    longTermHoldingRules: lthdRules,
    basicDeductionRules: basicRules,
    surchargeRates,
    surchargeSpecialRules,
    oneHouseSpecialRules,
    selfFarmingRules,
    houseCountExclusionRules,
    regulatedAreaHistory,
    nonBusinessLandJudgmentRules,
    longTermRentalRules,
    newHousingMatrix,
  };
}

// ============================================================
// H-2: 비과세 판단 — checkExemption·meetsOneHouseHoldingResidence·resolveExemptionProviso
// 800줄 정책 준수를 위해 ./transfer-tax-exemption.ts 로 분리. 하위 호환 위해 재수출.
// ============================================================

export {
  checkExemption,
  meetsOneHouseHoldingResidence,
  resolveExemptionProviso,
  resolveWasRegulatedAtAcquisition,
  resolveExemptionResidenceMonths,
} from "./transfer-tax-exemption";

// ============================================================
// H-3: calcTransferGain — 양도차익 계산
// ============================================================

interface TransferGainResult {
  gain: number;
  usedEstimated: boolean;
  estimatedBase: number;
  estimatedDeduction: number;
  expenses: number;
  splitDetail?: SplitGainResult;
  /** 필요경비 산정 모드 */
  necessaryExpenseMode?: "actual" | "estimated_with_deduction" | "swap_to_direct";
  /** §97② 단서 swap 발동 여부 */
  swapApplied?: boolean;
  /** swap 비교 정보 (환산/감정가액 모드에서만) */
  swapComparison?: {
    /** 환산취득가(or 감정가액) + 개산공제 */
    estimatedSide: number;
    /** 자본적지출 + 양도비 */
    directSide: number;
    chosen: "estimated" | "direct";
  };
  /** #3 공익수용 환산 양도시 기준시가 min[] 특례 산출근거 (Record) */
  expropriationValuationDetail?: ExpropriationValuationDetail;
  /** §164⑨ 2호 공매·경락(총액 2후보) / 1호 주택 총액(총액 3후보) 산출근거 */
  auctionValuationDetail?: AuctionValuationDetail;
  housingExpropriationValuationDetail?: HousingExpropriationValuationDetail;
}

/**
 * 소득세법 §97② 2호 본문/단서 적용 — 필요경비 결정.
 * - 실가 모드: capExp + trExp 직접 차감 (legacy `expenses` fallback)
 * - 환산/감정가액 모드 (본문): 개산공제만 인정
 * - 환산/감정가액 모드 (단서): 환산+개산 < 자본+양도비 → 자본+양도비를 필요경비로 swap
 *
 * swap 발동 조건: `capitalExpenditure` 또는 `transferExpense` 중 하나라도 명시 입력 + directSide > estimatedSide.
 * 동률(==)은 본문 적용 (단서는 "적은 경우" 명시).
 */
function calcNecessaryExpense(
  input: TransferTaxInput,
  estimatedBase: number,
  estimatedDeduction: number,
  isEstimatedMode: boolean,
): {
  expensesApplied: number;
  mode: "actual" | "estimated_with_deduction" | "swap_to_direct";
  swap?: TransferGainResult["swapComparison"];
} {
  const capExp = input.capitalExpenditure ?? 0;
  const trExp = input.transferExpense ?? 0;
  const directSide = capExp + trExp;
  const swapEligible =
    input.capitalExpenditure !== undefined || input.transferExpense !== undefined;

  if (!isEstimatedMode) {
    // 실가 모드 — 자본+양도비 직접 차감. 분리 입력 없으면 legacy expenses 사용.
    return {
      expensesApplied: swapEligible ? directSide : input.expenses,
      mode: "actual",
    };
  }

  const estimatedSide = estimatedBase + estimatedDeduction;

  // §97② 2호 단서는 취득가액을 '환산취득가액'으로 하는 경우에 한정한다.
  // (감정가액·매매사례가액 모드는 단서 대상 아님 — 본문 = 취득가액 + 개산공제만 적용.)
  const isConversionMode = input.useEstimatedAcquisition === true;
  if (isConversionMode && swapEligible && directSide > estimatedSide) {
    // §97② 2호 단서 — 가목(환산취득가액+개산공제) < 나목(자본적지출+양도비)인 경우
    // 나목의 금액을 '필요경비'로 한다. 필요경비 전체가 나목이므로 환산취득가액은
    // 별도 차감하지 않는다(양도차익 = 양도가액 − 나목). 차감 제외는 calcTransferGain에서 처리.
    return {
      expensesApplied: directSide,
      mode: "swap_to_direct",
      swap: { estimatedSide, directSide, chosen: "direct" },
    };
  }

  // 본문 — 환산 + 개산공제만 (legacy expenses 차감 안 함)
  return {
    expensesApplied: estimatedDeduction,
    mode: "estimated_with_deduction",
    swap: swapEligible
      ? { estimatedSide, directSide, chosen: "estimated" }
      : undefined,
  };
}

export function calcTransferGain(input: TransferTaxInput): TransferGainResult {
  // 토지/건물 취득일 분리 케이스 — 각각 양도차익 계산 후 합산
  const splitResult = calcSplitGain(input);
  if (splitResult) {
    const totalGain = splitResult.land.gain + splitResult.building.gain;
    const flooredGain = input.skipLossFloor ? totalGain : Math.max(0, totalGain);
    const totalDeduction = splitResult.land.appraisalDeduction + splitResult.building.appraisalDeduction;
    const totalExpenses = splitResult.land.directExpenses + splitResult.building.directExpenses;
    const usedEstimated =
      input.useEstimatedAcquisition ||
      input.acquisitionMethod === "appraisal" ||
      input.acquisitionMethod === "salesCase";
    return {
      gain: flooredGain,
      usedEstimated,
      estimatedBase: usedEstimated
        ? splitResult.land.acquisitionPrice + splitResult.building.acquisitionPrice
        : 0,
      estimatedDeduction: totalDeduction,
      expenses: totalExpenses,
      splitDetail: splitResult,
      necessaryExpenseMode: usedEstimated ? "estimated_with_deduction" : "actual",
      // 토지/건물 split swap은 자산 단위 적용 — calcSplitGain 내부 처리는 별도 PR
    };
  }

  let estimatedBase = 0;
  let estimatedDeduction = 0;
  let acquisitionCostBase: number;
  let usedEstimated = false;
  let expropriationValuationDetail: ExpropriationValuationDetail | undefined;
  let auctionValuationDetail: AuctionValuationDetail | undefined, housingExpropriationValuationDetail: HousingExpropriationValuationDetail | undefined;

  // 개산공제율 (소득세법 시행령 §163⑥1호·2호가목): 토지·건물·주택 = 3/100.
  // 단, §104③ 미등기양도자산은 3/1000(0.3%).
  const estimatedDeductionRate = input.isUnregistered ? 0.003 : 0.03;

  if (input.useEstimatedAcquisition) {
    // #3 §164⑨ 특례 — 양도시 기준시가(환산 분모)를 1호(per-sqm·주택총액)·2호(공매경락) 배타로 확정.
    const conv = resolveConversionDenominatorAtTransfer(input);
    expropriationValuationDetail = conv.expropriationValuationDetail;
    auctionValuationDetail = conv.auctionValuationDetail; housingExpropriationValuationDetail = conv.housingExpropriationValuationDetail;
    const estimated = calculateEstimatedAcquisitionPrice(
      input.transferPrice,
      input.standardPriceAtAcquisition ?? 0,
      conv.denominator,
    );
    const deduction = applyRate(input.standardPriceAtAcquisition ?? 0, estimatedDeductionRate);
    acquisitionCostBase = estimated;
    estimatedBase = estimated;
    estimatedDeduction = deduction;
    usedEstimated = true;
  } else if (input.acquisitionMethod === "appraisal") {
    // 감정가액 모드: 소득세법 시행령 §163⑥에 따라 환산취득가와 동일하게 개산공제 자동 적용.
    const appraisal = input.appraisalValue ?? input.acquisitionPrice;
    const deduction = applyRate(input.standardPriceAtAcquisition ?? 0, estimatedDeductionRate);
    acquisitionCostBase = appraisal;
    estimatedBase = appraisal;
    estimatedDeduction = deduction;
    usedEstimated = true;
  } else if (input.acquisitionMethod === "salesCase") {
    // 매매사례가액 모드(소득세법 시행령 §176의2③1호 — 취득가액 추계 1순위):
    // §163⑫(§97①1호나목 매매사례가액)·§97②2호·§163⑥에 따라 환산취득가·감정가액과
    // 동일하게 필요경비 개산공제(취득시 기준시가 × 3%)를 자동 적용한다.
    const salesCase = input.similarSalesValue ?? input.acquisitionPrice;
    const deduction = applyRate(input.standardPriceAtAcquisition ?? 0, estimatedDeductionRate);
    acquisitionCostBase = salesCase;
    estimatedBase = salesCase;
    estimatedDeduction = deduction;
    usedEstimated = true;
  } else {
    acquisitionCostBase = input.acquisitionPrice;
  }

  const necessary = calcNecessaryExpense(input, estimatedBase, estimatedDeduction, usedEstimated);
  // §97② 2호 단서 swap(나목 채택) 시 필요경비 = 자본적지출+양도비 단독이므로
  // 환산취득가액(acquisitionCostBase)은 차감하지 않는다(양도차익 = 양도가액 − 나목).
  const acqCostForGain = necessary.mode === "swap_to_direct" ? 0 : acquisitionCostBase;
  const gain = input.transferPrice - acqCostForGain - necessary.expensesApplied;
  const flooredGain = input.skipLossFloor ? gain : Math.max(0, gain);
  return {
    gain: flooredGain,
    usedEstimated,
    estimatedBase,
    estimatedDeduction,
    expenses: necessary.expensesApplied,
    necessaryExpenseMode: necessary.mode,
    swapApplied: necessary.mode === "swap_to_direct",
    swapComparison: necessary.swap,
    expropriationValuationDetail,
    auctionValuationDetail,
    housingExpropriationValuationDetail,
  };
}

// ============================================================
// H-4: calcOneHouseProration — 12억 초과분 안분
// ============================================================

/**
 * 1세대1주택 12억 초과분 과세 양도차익 안분.
 *
 * @param gain 전체 양도차익 (지분 모드 시 이 자산 지분 / 부담부증여 시 채무 양도 단위 ×B/C 적용 후)
 * @param transferPrice 양도가액 (지분 모드 시 이 자산 지분 / 부담부증여 시 채무 양도가)
 * @param totalPropertyTransferPrice 총 물건 양도가액 (지분 모드 — 12억 안분 분모)
 * @param burdenedGiftDenominator 부담부증여 12억 안분 분모 — F-1 (2026-05-12).
 *   D-0-2 해석 B: 분모 = 증여가액 C (= max(보충적·담보·임대) 평가값).
 *   국세청 해석례 5건 (ntstDcmId=010000000000028078 등) 인용.
 *
 * 산식: 과세 양도차익 = floor(gain × (분모 - 12억) / 분모)
 *   - 부담부증여: 분모 = burdenedGiftDenominator (giftValuation C). gain은 ×B/C 적용 후 채무 양도 단위.
 *     결과 = gain_burdened × (C-12억)/C = (C-A-est)×B/C × (C-12억)/C
 *   - 지분: 분모 = totalPropertyTransferPrice (총 물건가)
 *   - 단독: 분모 = transferPrice
 *
 * 우선순위: burdenedGiftDenominator > totalPropertyTransferPrice > transferPrice
 */
export function calcOneHouseProration(
  gain: number,
  transferPrice: number,
  totalPropertyTransferPrice?: number,
  burdenedGiftDenominator?: number,
): number {
  const threshold = 1_200_000_000;
  const denominator = burdenedGiftDenominator ?? totalPropertyTransferPrice ?? transferPrice;
  if (denominator <= threshold) return gain;
  return calculateProration(gain, denominator - threshold, denominator);
}

// ============================================================
// H-5: calcLongTermHoldingDeduction — 장기보유특별공제
// ============================================================

interface LongTermHoldingResult {
  deduction: number;
  rate: number;
  holdingPeriod: { years: number; months: number };
  /** §97의3·§97의4 평가 결과 echo (Phase 2 — 2026-06-11). 평가 항목이 없으면 undefined. */
  rental97LthdDetail?: Rental97Result;
  /** 배제 사유 echo — 배제 경로(L-0·L-0a·L-1)에서만. 미배제(공제율 미달 포함)는 undefined. */
  exclusionReason?: LthdExclusionReason;
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
    // 2년 미만이면 단기세율 적용 → LTHD 배제
    if (ctx.holdingMonths < 24) {
      const holding = calculateHoldingPeriod(input.acquisitionDate, input.transferDate);
      return { deduction: 0, rate: 0, holdingPeriod: { years: holding.years, months: holding.months } };
    }
    // 2년 이상: primary 주택 기준 LTHD 계산
    // 부수토지는 1세대1주택 여부·거주기간을 주택과 공유
    const isOneHouseSingleForCompanion =
      input.isOneHousehold && input.householdHousingCount === 1;
    const residenceYears = Math.floor(input.residencePeriodMonths / 12); // 실거주(거주분 공제율)
    const table2ResidenceYears = Math.floor(resolveExemptionResidenceMonths(input) / 12); // 통산(대상 판정)
    let companionRate: number;
    if (isOneHouseSingleForCompanion && table2ResidenceYears >= 2) {
      // 표 2 (1세대1주택, §95② 별표): 보유분 4% + 거주분 4%(실거주), 각 40% 캡
      const holdingPart = Math.min(primaryHoldingYears * 0.04, 0.40);
      const residencePart = Math.min(residenceYears * 0.04, 0.40);
      companionRate = holdingPart + residencePart;
    } else {
      // 표 1 (일반): 보유 × 2%, 최대 30%
      companionRate = Math.min(primaryHoldingYears * 0.02, 0.30);
    }
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

  // 공제율 산식 (L-3/L-4 통합 헬퍼)
  const rateForYears = (years: number): number => {
    if (years < 3) return 0;
    if (isOneHouseSingle && table2ResidenceYears >= 2) {
      // L-3: 1세대1주택 표2 (소득세법 §95② 별표) — 보유분·거주분 각 40% 캡 후 합산.
      // 대상은 통산(table2ResidenceYears), 공제율 거주분은 상속개시일부터 실거주(residenceYears).
      const holdingPart = Math.min(years * 0.04, 0.40);
      const residencePart = Math.min(residenceYears * 0.04, 0.40);
      return holdingPart + residencePart;
    }
    // L-4: 일반 (보유 × 2%, 최대 30%)
    return Math.min(years * 0.02, 0.30);
  };

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

    const landTaxableGain = ownsLand ? proratePartGain(splitDetail.land.gain) : 0;
    const buildingTaxableGain = ownsBuilding ? proratePartGain(splitDetail.building.gain) : 0;

    const landRate = ownsLand ? rateForYears(splitDetail.land.holdingYears) : 0;
    const buildingRate = ownsBuilding ? rateForYears(splitDetail.building.holdingYears) : 0;
    const landDed = ownsLand ? applyRate(Math.max(landTaxableGain, 0), landRate) : 0;
    const buildingDed = ownsBuilding ? applyRate(Math.max(buildingTaxableGain, 0), buildingRate) : 0;

    // SplitPartResult 에 공제율·공제액 채우기 (참조 수정)
    splitDetail.land.longTermRate = landRate;
    splitDetail.land.longTermDeduction = landDed;
    splitDetail.building.longTermRate = buildingRate;
    splitDetail.building.longTermDeduction = buildingDed;

    const anchorDate = selfOwns === "land_only" && input.landAcquisitionDate
      ? input.landAcquisitionDate
      : input.acquisitionDate;
    const anchorHolding = calculateHoldingPeriod(anchorDate, input.transferDate);
    return {
      deduction: landDed + buildingDed,
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

// ============================================================
// H-6: calcBasicDeduction — 기본공제
// ============================================================

export function calcBasicDeduction(
  taxableGain: number,
  longTermDed: number,
  annualUsed: number,
  isUnregistered: boolean,
  rules: ParsedRates["basicDeductionRules"],
): number {
  if (isUnregistered && rules.excludeUnregistered) return 0;

  const remaining = rules.annualLimit - annualUsed;
  if (remaining <= 0) return 0;

  const afterLTH = taxableGain - longTermDed;
  if (afterLTH <= 0) return 0;

  return Math.min(remaining, afterLTH);
}

// ============================================================
// H-0.35: 상업용건물·오피스텔 환산취득가 사전 처리 — transfer-tax-commercial-step.ts로 분리 (800줄 정책, 2026-07-20)
// 외부 import 호환 re-export.
// ============================================================

export {
  runCommercialBuildingStep,
  applyCommercialBuildingStep,
  type CommercialBuildingStepResult,
} from "./transfer-tax-commercial-step";

/**
 * 감면 유형별 법령 조문 매핑 (감면세액 step legalBasis용).
 * transfer-tax.ts의 인라인 상수를 분리하여 800줄 정책 준수.
 */
export function getReductionLegalBasis(
  reductionType: string | undefined,
  useLegacyRates: boolean | undefined,
): string | undefined {
  if (!reductionType) return undefined;
  const map: Record<string, string> = {
    "자경농지":                TRANSFER.REDUCTION_SELF_FARMING,
    "자경농지(§69·상속인 경작기간 합산 §66⑪)": `${TRANSFER.REDUCTION_SELF_FARMING} + ${TRANSFER.REDUCTION_SELF_FARMING_INHERITED}`,
    "자경농지(§69·편입일 부분감면 §66⑤⑥)":  `${TRANSFER.REDUCTION_SELF_FARMING} + ${TRANSFER.REDUCTION_SELF_FARMING_INCORP}`,
    "장기임대주택":            TRANSFER.REDUCTION_LONG_RENTAL,
    "신축주택":                TRANSFER.REDUCTION_NEW_HOUSING,
    "미분양주택":              TRANSFER.REDUCTION_UNSOLD_HOUSING,
    "공익사업용 토지 수용(§77)": useLegacyRates
      ? `${TRANSFER.REDUCTION_PUBLIC_EXPROPRIATION} + ${TRANSFER.REDUCTION_PUBLIC_EXPROPRIATION_TRANSITIONAL}`
      : TRANSFER.REDUCTION_PUBLIC_EXPROPRIATION,
  };
  return map[reductionType];
}

/**
 * 다주택 중과세 상세 판정 결과를 TransferTaxResult 형태로 변환.
 * transfer-tax.ts의 return 객체 인라인 블록을 분리하여 800줄 정책 준수.
 */
export function buildMultiHouseSurchargeDetail(
  result: MultiHouseSurchargeResult,
): NonNullable<TransferTaxResult["multiHouseSurchargeDetail"]> {
  return {
    effectiveHouseCount: result.effectiveHouseCount,
    rawHouseCount: result.rawHouseCount,
    excludedHouses: result.excludedHouses,
    exclusionReasons: result.exclusionReasons,
    isRegulatedAtTransfer: result.isRegulatedAtTransfer,
    warnings: result.warnings,
    excludedPresaleRights: result.excludedPresaleRights,
  };
}

// ============================================================
// H-12: emitPenaltySteps — transfer-tax-penalty-steps.ts로 분리 (800줄 정책, 2026-06-11)
// 외부 import 호환 re-export.
// ============================================================

export { emitPenaltySteps, type PenaltyEmissionResult } from "./transfer-tax-penalty-steps";
