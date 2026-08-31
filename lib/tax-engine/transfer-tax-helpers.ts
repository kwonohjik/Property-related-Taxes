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
  computeEstimatedDeduction,
  calculateEstimatedAcquisitionPrice,
  calculateProration,
} from "./tax-utils";
import { TaxRateNotFoundError } from "./tax-errors";
import { TRANSFER } from "./legal-codes";
// 로컬 변수명 `estimatedDeductionRate`와 충돌하므로 별칭. 신규 import는 한 줄 한 named(ESLint --fix 함정).
import { estimatedDeductionRate as resolveEstimatedDeductionRate } from "./legal-codes";
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

/**
 * §88 10호 「분양권」 정의 시행일 — §89② 판정의 분양권 축 취득일 게이트.
 *
 * §104⑦ 주택 수 산정이 쓰는 값과 **같은 DB 값**을 공유한다
 * (`multi-house-surcharge-count.ts` — 진실을 둘로 만들지 않는다).
 * 규칙이 로드되지 않았으면 `undefined` — 그때 §89② 판정은 분양권 축을 건드리지 않는다.
 */
export function presaleRightStartDate(parsed: ParsedRates): Date | undefined {
  const raw = parsed.houseCountExclusionRules?.presaleRightStartDate;
  return raw ? new Date(raw) : undefined;
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
  resolveDeemedOneHouseBy155,
  qualifiesUnavoidableOutsideCapital,
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

  // 개산공제율 (소득세법 시행령 §163⑥): 토지 1호·건물 2호 = 3/100, §104③ 미등기양도자산 3/1000.
  // 🔴 2026-08-23 정정 — 종전에는 리터럴 `0.03`을 써서 **자산 종류를 전혀 보지 않았다**.
  //    입주권·분양권은 법 §94①2호 **가목**이라 §163⑥**4호 = 1/100**인데 3%가 붙었다
  //    (분양권은 ⑧ validate 통과·⑤ UI 노출로 **도달 가능한 활성 결함**이었다 — 취득기준시가
  //    3억이면 개산공제 9,000,000 vs 법정 3,000,000 = **6,000,000 과대**).
  //    같은 파일의 `estimatedDeductionRate()` 주석이 이미 「리터럴 0.03 금지」를 명시했는데
  //    이 지점만 규칙 밖에 있었다. 이제 단일 함수를 경유한다.
  // ⚠️ base는 `computeEstimatedDeduction`이 **지분 기준시가**로 축소한다 —
  //    `standardPriceAtAcquisition`은 물건 전체(100%) 값이고, 같은 필요경비 산식의 다른 항인
  //    환산취득가액은 `transferPrice`를 통해 이미 지분 스케일이라 §97②2호 가목의 **합계액**이
  //    한쪽만 100%면 어긋난다(설계: transfer-fractional-lump-sum-deduction.plan.md §1).
  const estimatedDeductionRate = resolveEstimatedDeductionRate(
    input.isUnregistered,
    input.propertyType,
  );

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
    const deduction = computeEstimatedDeduction(
      input.standardPriceAtAcquisition ?? 0,
      estimatedDeductionRate,
      input.ownershipRatio,
    );
    acquisitionCostBase = estimated;
    estimatedBase = estimated;
    estimatedDeduction = deduction;
    usedEstimated = true;
  } else if (input.acquisitionMethod === "appraisal") {
    // 감정가액 모드: 소득세법 시행령 §163⑥에 따라 환산취득가와 동일하게 개산공제 자동 적용.
    const appraisal = input.appraisalValue ?? input.acquisitionPrice;
    const deduction = computeEstimatedDeduction(
      input.standardPriceAtAcquisition ?? 0,
      estimatedDeductionRate,
      input.ownershipRatio,
    );
    acquisitionCostBase = appraisal;
    estimatedBase = appraisal;
    estimatedDeduction = deduction;
    usedEstimated = true;
  } else if (input.acquisitionMethod === "salesCase") {
    // 매매사례가액 모드(소득세법 시행령 §176의2③1호 — 취득가액 추계 1순위):
    // §163⑫(§97①1호나목 매매사례가액)·§97②2호·§163⑥에 따라 환산취득가·감정가액과
    // 동일하게 필요경비 개산공제(취득시 기준시가 × 3%)를 자동 적용한다.
    const salesCase = input.similarSalesValue ?? input.acquisitionPrice;
    const deduction = computeEstimatedDeduction(
      input.standardPriceAtAcquisition ?? 0,
      estimatedDeductionRate,
      input.ownershipRatio,
    );
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
// 800줄 정책 준수를 위해 ./transfer-tax-lthd.ts 로 분리. 하위 호환 위해 재수출.
// ============================================================

export { calcLongTermHoldingDeduction } from "./transfer-tax-lthd";

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
import { resolveTypeLegalBasis } from "./transfer-tax-aggregate-pickers";

/**
 * 감면 유형별 법령 조문 (감면세액 step legalBasis용).
 *
 * ## 🔴 종전에는 **화면 라벨 문자열**을 키로 조회했다 (D1-12)
 * 라벨 단일 소스(`transfer-reduction-type-labels.ts`)가 조문 병기·괄호 표기로 표준화되면서
 * 이 맵의 키와 어긋났고, 실측 결과 **31개 라벨 중 28개가 undefined**로 떨어졌다.
 * 살아 있던 3개(`장기임대주택`·`신축주택`·`미분양주택`)조차 레거시 type 경로에 대응했고,
 * 주 경로인 §69 자경농지(`"자경농지 (§69)"` vs 키 `"자경농지"`)·§77 공익수용
 * (괄호 앞 **공백 1칸** 차이)도 MISS였다. `useLegacyRates` 분기는 도달 불가 dead branch였다.
 *
 * ⇒ 조회 키를 **내부 id**(`reductionTypeApplied`)로 바꾸고, 이미 존재하는 id 기반 resolver
 *   `resolveTypeLegalBasis`(집계 경로에서 쓰던 것)를 **단일 소스**로 위임한다.
 *   그 resolver의 default가 `REDUCTION_METADATA[type].article`이라 신규 조문도 자동으로 잡힌다
 *   (B3 D8-02에서 심어 둔 경로).
 *
 * ⚠️ 표시 라벨을 키로 쓰면 라벨을 다듬을 때마다 조용히 끊긴다 — 이 결함이 그 실례다.
 */
export function getReductionLegalBasis(
  /** 내부 id (`reductionTypeApplied`). **표시 라벨이 아니다.** */
  reductionTypeId: string | undefined,
  useLegacyRates: boolean | undefined,
  /**
   * D1-11 — id만으로 조문을 특정할 수 없는 경우의 확정값(레거시 임대 4유형).
   * `calcReductions`가 후보 선택 시점에 계산해 내보낸다.
   */
  legalBasisOverride?: string,
): string | undefined {
  if (legalBasisOverride) return legalBasisOverride;
  if (!reductionTypeId) return undefined;
  // §77 공익수용만 경과규정 병기가 있다 — 그 분기는 여기서 유지한다.
  if (reductionTypeId === "public_expropriation" && useLegacyRates) {
    return `${TRANSFER.REDUCTION_PUBLIC_EXPROPRIATION} + ${TRANSFER.REDUCTION_PUBLIC_EXPROPRIATION_TRANSITIONAL}`;
  }
  return resolveTypeLegalBasis(reductionTypeId);
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
    rateSurchargeStatutoryExcluded: result.rateSurchargeStatutoryExcluded,
  };
}

// ============================================================
// H-12: emitPenaltySteps — transfer-tax-penalty-steps.ts로 분리 (800줄 정책, 2026-06-11)
// 외부 import 호환 re-export.
// ============================================================

export { emitPenaltySteps, type PenaltyEmissionResult } from "./transfer-tax-penalty-steps";
