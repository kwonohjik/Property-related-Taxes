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
  truncateToThousand,
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
  parseLongTermRentalRuleSet,
  parseNewHousingMatrix,
  type LongTermRentalRuleSet,
  type NewHousingMatrixData,
} from "./schemas/rate-table.schema";
import { getRate } from "@/lib/db/tax-rates";
import type { TaxBracket } from "./types";
import type { TaxRatesMap } from "@/lib/db/tax-rates";

// ============================================================
// 1-A. 타입 정의
// ============================================================

export interface TransferTaxInput {
  /** 물건 종류 */
  propertyType: "housing" | "land" | "building" | "right_to_move_in" | "presale_right";
  /** 양도가액 (원, 정수) */
  transferPrice: number;
  /** 양도일 */
  transferDate: Date;
  /** 취득가액 (0이면 환산취득가 사용) */
  acquisitionPrice: number;
  /** 취득일 */
  acquisitionDate: Date;
  /** 필요경비 */
  expenses: number;
  /** 환산취득가 사용 여부 */
  useEstimatedAcquisition: boolean;
  /** 취득시 기준시가 (환산취득가 사용 시 필수) */
  standardPriceAtAcquisition?: number;
  /** 양도시 기준시가 (환산취득가 사용 시 필수) */
  standardPriceAtTransfer?: number;
  /** 세대 보유 주택 수 */
  householdHousingCount: number;
  /** 거주기간 (월) */
  residencePeriodMonths: number;
  /** 양도일 기준 조정대상지역 여부 */
  isRegulatedArea: boolean;
  /** 취득일 기준 조정대상지역 여부 */
  wasRegulatedAtAcquisition: boolean;
  /** 미등기 여부 */
  isUnregistered: boolean;
  /** 비사업용 토지 여부 */
  isNonBusinessLand: boolean;
  /**
   * 조합원입주권 승계취득 여부 (propertyType === "right_to_move_in" 일 때만 의미).
   * true = 승계조합원 (장특공제 배제), false/미지정 = 원조합원.
   * 소득세법 §95② 단서: 조합원입주권은 원조합원에 한해 장기보유특별공제 적용.
   */
  isSuccessorRightToMoveIn?: boolean;
  /** 1세대 여부 */
  isOneHousehold: boolean;
  /** 일시적 2주택 정보 */
  temporaryTwoHouse?: {
    previousAcquisitionDate: Date;
    newAcquisitionDate: Date;
  };
  /** 취득 원인 (매매·상속·증여). 미지정 시 매매로 간주. */
  acquisitionCause?: "purchase" | "inheritance" | "gift";
  /**
   * 상속 시 피상속인 취득일 — 단기보유 단일세율 판정 보유기간 통산용.
   * 소득세법 §95④: 상속받은 자산은 피상속인이 그 자산을 취득한 날을 자산의 취득일로 본다.
   * 장기보유특별공제 보유기간에는 적용하지 않음 (LTHD는 상속개시일 기산 유지).
   */
  decedentAcquisitionDate?: Date;
  /**
   * 증여 시 증여자 취득일 — 단기보유 단일세율 판정 보유기간 통산용 (이월과세 패턴).
   * 장기보유특별공제 보유기간에는 적용하지 않음.
   */
  donorAcquisitionDate?: Date;
  /** 조세특례 감면 목록 */
  reductions: TransferReduction[];
  /** 당해 연도 기사용 기본공제 (원) */
  annualBasicDeductionUsed: number;
  /**
   * 세대 보유 주택 상세 목록 (선택)
   * 제공 시 주택 수 산정 엔진을 통해 정밀 계산.
   * 미제공 시 householdHousingCount 사용 (하위 호환).
   */
  houses?: HouseInfo[];
  /**
   * 세대 보유 분양권/입주권 목록 (선택)
   * houses 제공 시 함께 전달 권장.
   */
  presaleRights?: PresaleRight[];
  /** 일시적 2주택 정보 (houses 제공 시 사용) */
  multiHouseTemporaryTwoHouse?: {
    previousHouseId: string;
    newHouseId: string;
  };
  /** 혼인합가 정보 */
  marriageMerge?: {
    marriageDate: Date;
  };
  /** 동거봉양 합가 정보 */
  parentalCareMerge?: {
    mergeDate: Date;
  };
  /** 양도 주택 ID (houses 제공 시) */
  sellingHouseId?: string;
  /**
   * 비사업용 토지 상세 정보 (선택)
   * 제공 시 judgeNonBusinessLand()로 정밀 판정 후 isNonBusinessLand 덮어씀.
   * 미제공 시 isNonBusinessLand 플래그 그대로 사용 (하위 호환).
   */
  nonBusinessLandDetails?: NonBusinessLandInput;

  // ── §114조의2 가산세 판정용 필드 ──
  /** 취득가 산정 방식 (actual: 실거래가, estimated: 환산취득가, appraisal: 감정가액) */
  acquisitionMethod?: "actual" | "estimated" | "appraisal";
  /** 감정가액 (acquisitionMethod === "appraisal" 시) */
  appraisalValue?: number;
  /** 본인 신축·증축 여부 */
  isSelfBuilt?: boolean;
  /** 신축(new) / 증축(extension) */
  buildingType?: "new" | "extension";
  /** 신축일 또는 증축 완공일 */
  constructionDate?: Date;
  /** 증축 바닥면적 합계 (㎡) */
  extensionFloorArea?: number;
  /**
   * 장기임대주택 감면 상세 정보 (선택)
   * 제공 시 calculateRentalReduction()으로 정밀 감면 판정.
   * 미제공 시 reductions[] 배열의 long_term_rental 항목으로 단순 처리 (하위 호환).
   */
  rentalReductionDetails?: RentalReductionInput;
  /**
   * 신축주택·미분양주택 감면 상세 정보 (선택)
   * 제공 시 determineNewHousingReduction()으로 정밀 감면 판정 (조문 매트릭스 기반).
   * 미제공 시 reductions[] 배열의 new_housing/unsold_housing 항목으로 단순 처리 (하위 호환).
   */
  newHousingDetails?: NewHousingReductionInput;
  /** 신고불성실가산세 입력 (선택, 미제공 시 가산세 계산 생략) */
  filingPenaltyDetails?: FilingPenaltyInput;
  /** 지연납부가산세 입력 (선택, 미제공 시 가산세 계산 생략) */
  delayedPaymentDetails?: DelayedPaymentInput;
  /**
   * 기본공제 스킵 (§103). aggregate 엔진에서 호출 시 true로 세팅.
   * default false → 기존 동작 유지.
   */
  skipBasicDeduction?: boolean;
  /**
   * 양도차익 음수 바닥 처리 생략 (§102② 차손 통산용).
   * aggregate 엔진에서 호출 시 true로 세팅하여 음수 `gain` 반환.
   * default false → 기존 `Math.max(0, gain)` 동작 유지.
   */
  skipLossFloor?: boolean;
}

export type TransferReduction =
  | { type: "self_farming"; farmingYears: number }
  | { type: "long_term_rental"; rentalYears: number; rentIncreaseRate: number }
  | { type: "new_housing"; region: "metropolitan" | "non_metropolitan" }
  | { type: "unsold_housing"; region: "metropolitan" | "non_metropolitan" };

export interface CalculationStep {
  /** 단계명 (예: '양도차익 계산') */
  label: string;
  /** 산식 설명 */
  formula: string;
  /** 결과 금액 */
  amount: number;
  /** 법적 근거 조문 (P2: 결과 시각화용) */
  legalBasis?: string;
  /** 세부 항목 여부 — 들여쓰기로 표시 */
  sub?: boolean;
}

export interface TransferTaxResult {
  /** 전액 비과세 여부 */
  isExempt: boolean;
  /** 비과세 사유 */
  exemptReason?: string;
  /** 양도차익 */
  transferGain: number;
  /** 과세 양도차익 (12억 초과분 안분 후) */
  taxableGain: number;
  /** 환산취득가 사용 여부 */
  usedEstimatedAcquisition: boolean;
  /** 장기보유특별공제액 */
  longTermHoldingDeduction: number;
  /** 장기보유특별공제율 */
  longTermHoldingRate: number;
  /** 기본공제 */
  basicDeduction: number;
  /** 과세표준 (소득세법 §92 — 원 단위) */
  taxBase: number;
  /** 적용 세율 */
  appliedRate: number;
  /** 누진공제액 */
  progressiveDeduction: number;
  /** 산출세액 */
  calculatedTax: number;
  /** 중과세 유형 */
  surchargeType?: string;
  /** 추가 세율 */
  surchargeRate?: number;
  /** 중과세 유예 여부 */
  isSurchargeSuspended: boolean;
  /** 총 감면세액 */
  reductionAmount: number;
  /** 감면 유형 */
  reductionType?: string;
  /** 결정세액 (원 미만 절사) */
  determinedTax: number;
  /** §114조의2 신축·증축 가산세 (환산취득가액 or 감정가액 × 5%) */
  penaltyTax: number;
  /** 지방소득세 ((결정세액 + 가산세) × 10%) */
  localIncomeTax: number;
  /** 총 납부세액 */
  totalTax: number;
  /** 계산 과정 steps */
  steps: CalculationStep[];
  /**
   * 다주택 중과세 상세 판정 결과 (houses[] 제공 시만 포함)
   * UI에서 제외 주택 목록·배제 사유 표시용
   */
  multiHouseSurchargeDetail?: {
    effectiveHouseCount: number;
    rawHouseCount: number;
    excludedHouses: ExcludedHouse[];
    exclusionReasons: ExclusionReason[];
    isRegulatedAtTransfer: boolean;
    warnings: string[];
  };
  /**
   * 비사업용 토지 판정 상세 결과 (nonBusinessLandDetails 제공 시만 포함)
   * UI에서 사업용/비사업용 판정 근거 표시용
   */
  nonBusinessLandJudgmentDetail?: NonBusinessLandJudgment;
  /**
   * 장기임대 감면 상세 결과 (rentalReductionDetails 제공 시만 포함)
   * UI에서 감면 자격·감면율·위반 사유 표시용
   */
  rentalReductionDetail?: RentalReductionResult;
  /**
   * 신축주택·미분양주택 감면 상세 결과 (newHousingDetails 제공 시만 포함)
   * UI에서 매칭 조문·감면율·5년 안분 결과 표시용
   */
  newHousingReductionDetail?: NewHousingReductionResult;
  /**
   * 신고불성실·지연납부 가산세 상세 결과
   * filingPenaltyDetails 또는 delayedPaymentDetails 제공 시만 포함
   */
  penaltyDetail?: TransferTaxPenaltyResult;
}

// ============================================================
// 내부 파싱 결과 타입
// ============================================================

interface ParsedRates {
  brackets: TaxBracket[];
  longTermHoldingRules: Extract<DeductionRulesData, { type: "long_term_holding" }>;
  basicDeductionRules: Extract<DeductionRulesData, { type: "basic_deduction" }>;
  surchargeRates: SurchargeRateData;
  surchargeSpecialRules: SurchargeSpecialRulesData;
  oneHouseSpecialRules: OneHouseSpecialRulesData;
  selfFarmingRules?: Extract<DeductionRulesData, { type: "self_farming" }>;
  /** 주택 수 산정 배제 규칙 (optional — 없으면 householdHousingCount 사용) */
  houseCountExclusionRules?: HouseCountExclusionData;
  /** 조정대상지역 이력 (optional — 없으면 isRegulatedArea 플래그 사용) */
  regulatedAreaHistory?: RegulatedAreaHistoryData;
  /** 비사업용 토지 판정 기준 (optional — 없으면 DEFAULT_NON_BUSINESS_LAND_RULES 사용) */
  nonBusinessLandJudgmentRules?: NonBusinessLandJudgmentSchemaData;
  /** 장기임대주택 감면 규칙 V2 (optional) */
  longTermRentalRules?: LongTermRentalRuleSet;
  /** 신축주택·미분양주택 감면 매트릭스 (optional) */
  newHousingMatrix?: NewHousingMatrixData;
}

// ============================================================
// H-1: parseRatesFromMap — DB 세율 Map 파싱
// ============================================================

export function parseRatesFromMap(rates: TaxRatesMap): ParsedRates {
  // 누진세율
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

  // 장기보유특별공제
  const lthdRecord = getRate(rates, "transfer", "deduction", "long_term_holding");
  if (!lthdRecord) {
    throw new TaxRateNotFoundError("장기보유특별공제 규칙(deduction:long_term_holding)이 없습니다");
  }
  const lthdRules = parseDeductionRules(lthdRecord.deductionRules);
  if (lthdRules.type !== "long_term_holding") {
    throw new TaxRateNotFoundError("장기보유특별공제 규칙 타입 오류");
  }

  // 기본공제
  const basicRecord = getRate(rates, "transfer", "deduction", "basic");
  if (!basicRecord) {
    throw new TaxRateNotFoundError("기본공제 규칙(deduction:basic)이 없습니다");
  }
  const basicRules = parseDeductionRules(basicRecord.deductionRules);
  if (basicRules.type !== "basic_deduction") {
    throw new TaxRateNotFoundError("기본공제 규칙 타입 오류");
  }

  // 중과세율
  const surchargeRecord = getRate(rates, "transfer", "surcharge");
  if (!surchargeRecord) {
    throw new TaxRateNotFoundError("중과세율(surcharge:_default)이 없습니다");
  }
  const surchargeRates = parseSurchargeRate(surchargeRecord.rateTable);
  const surchargeSpecialRules = surchargeRecord.specialRules as SurchargeSpecialRulesData;

  // 1세대1주택 특례
  const oneHouseRecord = getRate(rates, "transfer", "special", "one_house_exemption");
  if (!oneHouseRecord) {
    throw new TaxRateNotFoundError("1세대1주택 특례(special:one_house_exemption)가 없습니다");
  }
  const oneHouseSpecialRules = oneHouseRecord.specialRules as OneHouseSpecialRulesData;

  // 자경농지 감면 (선택적)
  const selfFarmingRecord = getRate(rates, "transfer", "deduction", "self_farming");
  let selfFarmingRules: ParsedRates["selfFarmingRules"] | undefined;
  if (selfFarmingRecord) {
    const parsed = parseDeductionRules(selfFarmingRecord.deductionRules);
    if (parsed.type === "self_farming") {
      selfFarmingRules = parsed;
    }
  }

  // 주택 수 산정 배제 규칙 (선택적 — 없으면 householdHousingCount 사용)
  const houseCountRecord = getRate(rates, "transfer", "special", "house_count_exclusion");
  let houseCountExclusionRules: HouseCountExclusionData | undefined;
  if (houseCountRecord?.specialRules) {
    houseCountExclusionRules = parseHouseCountExclusion(houseCountRecord.specialRules);
  }

  // 조정대상지역 이력 (선택적 — 없으면 isRegulatedArea 플래그 사용)
  const regulatedAreaRecord = getRate(rates, "transfer", "special", "regulated_areas");
  let regulatedAreaHistory: RegulatedAreaHistoryData | undefined;
  if (regulatedAreaRecord?.specialRules) {
    regulatedAreaHistory = parseRegulatedAreaHistory(regulatedAreaRecord.specialRules);
  }

  // 비사업용 토지 판정 기준 (선택적 — 없으면 DEFAULT_NON_BUSINESS_LAND_RULES 사용)
  const nonBizLandRecord = getRate(rates, "transfer", "special", "non_business_land_judgment");
  let nonBusinessLandJudgmentRules: NonBusinessLandJudgmentSchemaData | undefined;
  if (nonBizLandRecord?.specialRules) {
    nonBusinessLandJudgmentRules = parseNonBusinessLandJudgment(nonBizLandRecord.specialRules);
  }

  // 장기임대주택 감면 규칙 V2 (선택적)
  const longTermRentalRecord = getRate(rates, "transfer", "deduction", "long_term_rental_v2");
  let longTermRentalRules: LongTermRentalRuleSet | undefined;
  if (longTermRentalRecord?.deductionRules) {
    longTermRentalRules = parseLongTermRentalRuleSet(longTermRentalRecord.deductionRules);
  }

  // 신축주택·미분양주택 감면 매트릭스 (선택적)
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
// H-2: checkExemption — 비과세 판단 (E-1 ~ E-4)
// ============================================================

interface ExemptionResult {
  isExempt: boolean;
  isPartialExempt: boolean;
  exemptReason?: string;
}

export function checkExemption(
  input: TransferTaxInput,
  oneHouseRules: OneHouseSpecialRulesData,
): ExemptionResult {
  const { one_house_exemption: rule, temporary_two_house: twoHouseRule } = oneHouseRules;

  // 전제 조건: 1세대 + 주택
  if (!input.isOneHousehold || input.propertyType !== "housing") {
    return { isExempt: false, isPartialExempt: false };
  }

  const holding = calculateHoldingPeriod(input.acquisitionDate, input.transferDate);

  // E-3: 일시적 2주택
  if (input.householdHousingCount === 2 && input.temporaryTwoHouse && twoHouseRule) {
    const { previousAcquisitionDate, newAcquisitionDate } = input.temporaryTwoHouse;

    // 종전 주택의 보유요건 검증 (시행령 §155① — 종전 주택이 §154① 요건 충족 전제)
    // 종전 주택 보유기간 = previousAcquisitionDate ~ transferDate
    const prevHolding = calculateHoldingPeriod(previousAcquisitionDate, input.transferDate);
    if (prevHolding.years < rule.minHoldingYears) {
      return { isExempt: false, isPartialExempt: false };
    }

    // 처분 기한 계산
    let deadlineYears = twoHouseRule.disposalDeadlineYears; // 비조정: 3년
    if (input.isRegulatedArea) {
      // [C1 수정] 부칙 적용 기준: 양도일(transferDate)이 완화 시행일 이후이면 완화 기한 적용
      // 소득세법 시행령 §155 ① 개정 부칙: "시행일(2022-05-10) 이후 종전 주택을 양도하는 경우"
      const relaxDate = twoHouseRule.regulatedAreaRelaxDate
        ? new Date(twoHouseRule.regulatedAreaRelaxDate)
        : null;
      if (relaxDate && input.transferDate >= relaxDate) {
        deadlineYears = twoHouseRule.regulatedAreaRelaxDeadlineYears ?? twoHouseRule.regulatedAreaDeadlineYears;
      } else {
        deadlineYears = twoHouseRule.regulatedAreaDeadlineYears;
      }
    }
    // addYears 사용: setFullYear은 2월 29일(윤년) 취득 시 처분기한이 1일 연장되는 버그 있음
    const deadline = addYears(newAcquisitionDate, deadlineYears);
    if (input.transferDate <= deadline) {
      return { isExempt: true, isPartialExempt: false, exemptReason: "일시적 2주택 비과세" };
    }
  }

  // 1세대1주택: 1채 조건
  if (input.householdHousingCount !== 1) {
    return { isExempt: false, isPartialExempt: false };
  }

  // E-4: 2017.8.3 이전 취득 경과규정 (취득 당시 비조정이면 2년 보유만으로 비과세)
  const prePolicyDate = new Date(rule.prePolicyDate);
  const isPrePolicy = input.acquisitionDate < prePolicyDate;
  const isRegulatedAtAcquisition = input.wasRegulatedAtAcquisition;

  // 거주 요건 판단
  // 비과세 거주요건은 취득일 기준 조정대상지역 여부로 판단 (시행령 §154①)
  // isRegulatedArea(양도일 기준)가 아닌 wasRegulatedAtAcquisition(취득일 기준) 사용
  const residenceYears = Math.floor(input.residencePeriodMonths / 12);
  const meetsResidence =
    !input.wasRegulatedAtAcquisition ||
    (isPrePolicy && !isRegulatedAtAcquisition) ||
    residenceYears >= rule.regulatedAreaMinResidenceYears;

  // 보유 요건
  const meetsHolding = holding.years >= rule.minHoldingYears;

  if (!meetsHolding || !meetsResidence) {
    return { isExempt: false, isPartialExempt: false };
  }

  // E-1: 전액 비과세 (양도가 12억 이하)
  if (input.transferPrice <= rule.maxExemptPrice) {
    return { isExempt: true, isPartialExempt: false, exemptReason: "1세대1주택 비과세" };
  }

  // E-2: 부분과세 (양도가 12억 초과)
  return { isExempt: false, isPartialExempt: true, exemptReason: "1세대1주택 고가주택" };
}

// ============================================================
// H-3: calcTransferGain — 양도차익 계산
// ============================================================

interface TransferGainResult {
  gain: number;
  usedEstimated: boolean;
  /** 환산취득가액 본체 (개산공제 미포함) 또는 실거래 취득가액 */
  estimatedBase: number;
  /** 개산공제액 (취득 당시 기준시가 × 3%) — 일반 취득가 방식이면 0 */
  estimatedDeduction: number;
  /** 실거래가 방식 필요경비 */
  expenses: number;
}

export function calcTransferGain(input: TransferTaxInput): TransferGainResult {
  let acquisitionCost: number;
  let estimatedBase = 0;
  let estimatedDeduction = 0;
  let usedEstimated = false;

  if (input.useEstimatedAcquisition) {
    const estimated = calculateEstimatedAcquisitionPrice(
      input.transferPrice,
      input.standardPriceAtAcquisition ?? 0,
      input.standardPriceAtTransfer ?? 0,
    );
    // 개산공제 = 취득 당시 기준시가 × 3% (소득세법 §97①②)
    const deduction = applyRate(input.standardPriceAtAcquisition ?? 0, 0.03);
    acquisitionCost = estimated + deduction;
    estimatedBase = estimated;
    estimatedDeduction = deduction;
    usedEstimated = true;
  } else {
    acquisitionCost = input.acquisitionPrice;
  }

  const gain = input.transferPrice - acquisitionCost - input.expenses;
  // §102② 차손 통산용: skipLossFloor=true이면 음수 허용
  const flooredGain = input.skipLossFloor ? gain : Math.max(0, gain);
  return {
    gain: flooredGain,
    usedEstimated,
    estimatedBase,
    estimatedDeduction,
    expenses: input.expenses,
  };
}

// ============================================================
// H-4: calcOneHouseProration — 12억 초과분 안분
// ============================================================

export function calcOneHouseProration(gain: number, transferPrice: number): number {
  const threshold = 1_200_000_000;
  if (transferPrice <= threshold) return gain;
  // 과세 양도차익 = 양도차익 × (양도가 - 12억) / 양도가
  return calculateProration(gain, transferPrice - threshold, transferPrice);
}

// ============================================================
// H-5: calcLongTermHoldingDeduction — 장기보유특별공제
// ============================================================

interface LongTermHoldingResult {
  deduction: number;
  rate: number;
  /** 보유기간 (표시용) — 예: { years: 7, months: 4 } */
  holdingPeriod: { years: number; months: number };
}

export function calcLongTermHoldingDeduction(
  taxableGain: number,
  input: TransferTaxInput,
  rules: ParsedRates["longTermHoldingRules"],
  isSurcharge: boolean,
  isSuspended: boolean,
  longTermRentalRules?: LongTermRentalRuleSet,
): LongTermHoldingResult {
  // L-0: 미등기 — 장기보유특별공제 배제 (소득세법 §95② 단서)
  if (input.isUnregistered) {
    return { deduction: 0, rate: 0, holdingPeriod: { years: 0, months: 0 } };
  }

  // L-0a: propertyType 가드 (소득세법 §95② 단서)
  //   - 분양권(presale_right): 장기보유특별공제 대상 아님
  //   - 조합원입주권(right_to_move_in) + 승계조합원: 원조합원에 한해 적용되므로 배제
  if (input.propertyType === "presale_right") {
    return { deduction: 0, rate: 0, holdingPeriod: { years: 0, months: 0 } };
  }
  if (input.propertyType === "right_to_move_in" && input.isSuccessorRightToMoveIn === true) {
    return { deduction: 0, rate: 0, holdingPeriod: { years: 0, months: 0 } };
  }

  // L-1: 중과세 적용 중(유예 해제)이면 공제 배제
  if (isSurcharge && !isSuspended) {
    return { deduction: 0, rate: 0, holdingPeriod: { years: 0, months: 0 } };
  }

  // L-1b: 비사업용 토지 — 장기보유특별공제 배제 (소득세법 §95 ② 단서)
  if (input.isNonBusinessLand) {
    return { deduction: 0, rate: 0, holdingPeriod: { years: 0, months: 0 } };
  }

  // L-1c: 장기임대주택 특례율 — 일반 공제 대신 특례율(50%/70%) 우선 적용
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

  // (L-0에서 미등기를 이미 처리함 — dead code 제거, I2 수정)

  const holding = calculateHoldingPeriod(input.acquisitionDate, input.transferDate);
  const holdingPeriod = { years: holding.years, months: holding.months };
  const residenceYears = Math.floor(input.residencePeriodMonths / 12);

  // L-3: 1세대1주택 특례
  //   조건: 1세대 1주택 + 보유기간 3년 이상 + 거주기간 2년 이상 (소득세법 §95②)
  //   공제율: 보유기간 × 4% + 거주기간 × 4% (80% 한도)
  const ONE_HOUSE_HOLDING_RATE = 0.04;   // 보유 연 4%
  const ONE_HOUSE_RESIDENCE_RATE = 0.04; // 거주 연 4%
  const ONE_HOUSE_MAX_RATE = 0.80;       // 최대 80%
  const ONE_HOUSE_MIN_HOLDING_YEARS = 3; // 보유 3년 이상 (소득세법 §95②)
  const ONE_HOUSE_MIN_RESIDENCE_YEARS = 2;

  if (
    input.isOneHousehold &&
    input.householdHousingCount === 1 &&
    holding.years >= ONE_HOUSE_MIN_HOLDING_YEARS &&
    residenceYears >= ONE_HOUSE_MIN_RESIDENCE_YEARS
  ) {
    const holdingRate = holding.years * ONE_HOUSE_HOLDING_RATE;
    const residenceRate = residenceYears * ONE_HOUSE_RESIDENCE_RATE;
    const rate = Math.min(holdingRate + residenceRate, ONE_HOUSE_MAX_RATE);
    const deduction = applyRate(taxableGain, rate);
    return { deduction, rate, holdingPeriod };
  }

  // L-4: 일반 (보유기간 3년 이상, 미등기 제외) — 소득세법 §95②
  //   공제율: 보유기간 × 2% (30% 한도)
  const GENERAL_HOLDING_RATE = 0.02;  // 보유 연 2%
  const GENERAL_MAX_RATE = 0.30;      // 최대 30%
  const GENERAL_MIN_HOLDING_YEARS = 3;

  if (holding.years >= GENERAL_MIN_HOLDING_YEARS) {
    const rate = Math.min(holding.years * GENERAL_HOLDING_RATE, GENERAL_MAX_RATE);
    const deduction = applyRate(taxableGain, rate);
    return { deduction, rate, holdingPeriod };
  }

  // 보유기간 3년 미만
  return { deduction: 0, rate: 0, holdingPeriod };
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
  // 미등기 시 기본공제 0
  if (isUnregistered && rules.excludeUnregistered) {
    return 0;
  }

  const remaining = rules.annualLimit - annualUsed;
  if (remaining <= 0) return 0;

  // 과세 양도차익 - 장기보유공제 = 공제 적용 가능 금액
  const afterLTH = taxableGain - longTermDed;
  if (afterLTH <= 0) return 0;

  return Math.min(remaining, afterLTH);
}

// ============================================================
// H-6.5: calculateBuildingPenalty — 소득세법 §114조의2 가산세
// ============================================================

export function calculateBuildingPenalty(
  input: TransferTaxInput,
  acquisitionPriceForPenalty: number,
): { penalty: number; note: string } | null {
  if (!input.isSelfBuilt) return null;

  const method = input.acquisitionMethod;
  const transferDate = input.transferDate;

  // 2018.1.1 이후 양도분부터 적용
  if (transferDate < new Date("2018-01-01")) return null;

  const isPenaltyMethod =
    method === "estimated" ||
    (method === "appraisal" && transferDate >= new Date("2020-01-01"));
  if (!isPenaltyMethod) return null;

  if (input.buildingType === "extension") {
    // 증축: 2020.1.1 이후 양도 + 바닥면적 85㎡ 초과
    if (transferDate < new Date("2020-01-01")) return null;
    if ((input.extensionFloorArea ?? 0) <= 85) return null;
  }

  if (!input.constructionDate) return null;
  const constructionMs = input.constructionDate.getTime();
  const transferMs = transferDate.getTime();
  const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
  const yearsHeld = (transferMs - constructionMs) / msPerYear;
  if (yearsHeld >= 5) return null;

  const penalty = applyRate(acquisitionPriceForPenalty, 0.05);
  const typeLabel = input.buildingType === "extension" ? "증축" : "신축";
  const methodLabel = method === "appraisal" ? "감정가액" : "환산취득가액";
  return {
    penalty,
    note: `${typeLabel} 5년 이내 양도 + ${methodLabel} 적용`,
  };
}

// ============================================================
// H-7: calcTax — 세액 결정 (T-1 ~ T-4)
// ============================================================

interface CalcTaxResult {
  calculatedTax: number;
  surchargeType?: string;
  surchargeRate?: number;
  appliedRate: number;
  progressiveDeduction: number;
  surchargeSuspended: boolean;
  /** 단기보유 특례세율 적용 시 표시 문구 (예: "보유기간 2년 미만 특례세율 적용") */
  shortTermNote?: string;
}

export function calcTax(
  taxBase: number,
  parsedRates: ParsedRates,
  input: TransferTaxInput,
  multiHouseSurchargeResult?: MultiHouseSurchargeResult,
): CalcTaxResult {
  const { brackets, surchargeRates, surchargeSpecialRules } = parsedRates;

  // T-1: 미등기 70% 단일세율
  if (input.isUnregistered && surchargeRates.unregistered) {
    const flatRate = surchargeRates.unregistered.flatRate;
    return {
      calculatedTax: applyRate(taxBase, flatRate),
      appliedRate: flatRate,
      progressiveDeduction: 0,
      surchargeSuspended: false,
    };
  }

  // 다주택 중과세 유예 판단
  // houses[] 제공 시: determineMultiHouseSurcharge 결과 사용
  // 미제공 시: householdHousingCount + isRegulatedArea 플래그 사용 (하위 호환)
  const isSurchargeCase = multiHouseSurchargeResult
    ? multiHouseSurchargeResult.surchargeType !== "none"
    : (input.propertyType === "housing" || input.propertyType === "right_to_move_in" || input.propertyType === "presale_right") &&
      input.isRegulatedArea &&
      input.householdHousingCount >= 2;

  const suspended = multiHouseSurchargeResult
    ? multiHouseSurchargeResult.isSurchargeSuspended
    : isSurchargeCase
      ? isSurchargeSuspended(
          surchargeSpecialRules,
          input.transferDate,
          input.householdHousingCount >= 3 ? "multi_house_3plus" : "multi_house_2",
        )
      : false;

  // 부동소수점 오차 제거: 세율은 소수점 4자리(0.01% 단위)로 정규화
  const roundRate = (r: number) => Math.round(r * 10000) / 10000;

  // T-2: 비사업용 토지 누진 + 10%p
  if (input.isNonBusinessLand && surchargeRates.non_business_land) {
    const additionalRate = surchargeRates.non_business_land.additionalRate;
    const progressiveTax = calculateProgressiveTax(taxBase, brackets);
    // 적용 구간 세율 추출 (표시용)
    const bracket = brackets.find((b) => taxBase <= (b.max ?? Infinity));
    const baseRate = bracket?.rate ?? brackets[brackets.length - 1].rate;
    const surchargeAmount = applyRate(taxBase, additionalRate);
    return {
      calculatedTax: progressiveTax + surchargeAmount,
      surchargeType: "non_business_land",
      surchargeRate: roundRate(additionalRate),
      appliedRate: roundRate(baseRate + additionalRate),
      progressiveDeduction: bracket?.deduction ?? 0,
      surchargeSuspended: false,
    };
  }

  // T-3: 다주택 중과세 (유예 해제 + 배제 없음 시)
  // houses[] 제공 시: surchargeApplicable (유예·배제 모두 반영한 최종 값) 사용
  // 미제공 시: isSurchargeCase && !suspended 기존 로직
  const surchargeApplicable = multiHouseSurchargeResult
    ? multiHouseSurchargeResult.surchargeApplicable
    : isSurchargeCase && !suspended;

  const effectiveSurchargeType = multiHouseSurchargeResult?.surchargeType
    ?? (input.householdHousingCount >= 3 ? "multi_house_3plus" : "multi_house_2");

  // T-2.5: 단기보유 특례세율 (소득세법 §104①2~3호, 7~8호)
  // 주택·입주권·분양권: 1년 미만 70%, 1~2년 미만 60%
  // 일반 건물·토지: 1년 미만 50%, 1~2년 미만 40%
  //
  // 보유기간 통산 (소득세법 §95④):
  //   - 상속: 피상속인 취득일부터 양도일까지로 통산
  //   - 증여: 증여자 취득일부터 양도일까지로 통산 (이월과세 패턴 단순화 적용)
  //   - LTHD(장기보유특별공제) 보유기간에는 적용 금지 — 그쪽은 acquisitionDate 그대로 유지
  const rateBasisAcquisitionDate =
    input.acquisitionCause === "inheritance" && input.decedentAcquisitionDate
      ? input.decedentAcquisitionDate
      : input.acquisitionCause === "gift" && input.donorAcquisitionDate
        ? input.donorAcquisitionDate
        : input.acquisitionDate;
  const holdingForRate = calculateHoldingPeriod(rateBasisAcquisitionDate, input.transferDate);
  const holdingMonthsTotal = holdingForRate.years * 12 + holdingForRate.months;
  const isHousingLikeProp =
    input.propertyType === "housing" ||
    input.propertyType === "right_to_move_in" ||
    input.propertyType === "presale_right";
  const shortTermFlatRate =
    holdingMonthsTotal < 12 ? (isHousingLikeProp ? 0.70 : 0.50) :
    holdingMonthsTotal < 24 ? (isHousingLikeProp ? 0.60 : 0.40) :
    null;
  const shortTermNote =
    holdingMonthsTotal < 12 ? "보유기간 1년 미만 특례세율 적용" :
    holdingMonthsTotal < 24 ? "보유기간 2년 미만 특례세율 적용" :
    undefined;

  if (shortTermFlatRate !== null) {
    const shortTermTax = applyRate(taxBase, shortTermFlatRate);
    // §104③: 다주택 중과세율과 비교하여 더 높은 세율 적용
    if (surchargeApplicable && effectiveSurchargeType !== "none") {
      const surchargeInfoST = effectiveSurchargeType === "multi_house_3plus"
        ? surchargeRates.multi_house_3plus
        : surchargeRates.multi_house_2;
      if (surchargeInfoST) {
        const additionalRateST = surchargeInfoST.additionalRate;
        const progressiveTaxST = calculateProgressiveTax(taxBase, brackets);
        const bracketST = brackets.find((b) => taxBase <= (b.max ?? Infinity));
        const baseRateST = bracketST?.rate ?? brackets[brackets.length - 1].rate;
        const surchargeTaxST = progressiveTaxST + applyRate(taxBase, additionalRateST);
        if (surchargeTaxST > shortTermTax) {
          return {
            calculatedTax: surchargeTaxST,
            surchargeType: effectiveSurchargeType,
            surchargeRate: roundRate(additionalRateST),
            appliedRate: roundRate(baseRateST + additionalRateST),
            progressiveDeduction: bracketST?.deduction ?? 0,
            surchargeSuspended: false,
            shortTermNote,
          };
        }
      }
    }
    return {
      calculatedTax: shortTermTax,
      appliedRate: shortTermFlatRate,
      progressiveDeduction: 0,
      surchargeSuspended: false,
      shortTermNote,
    };
  }

  if (surchargeApplicable && effectiveSurchargeType !== "none") {
    const surchargeInfo = effectiveSurchargeType === "multi_house_3plus"
      ? surchargeRates.multi_house_3plus
      : surchargeRates.multi_house_2;

    if (surchargeInfo) {
      const additionalRate = surchargeInfo.additionalRate;
      const progressiveTax = calculateProgressiveTax(taxBase, brackets);
      const bracket = brackets.find((b) => taxBase <= (b.max ?? Infinity));
      const baseRate = bracket?.rate ?? brackets[brackets.length - 1].rate;
      const surchargeAmount = applyRate(taxBase, additionalRate);
      return {
        calculatedTax: progressiveTax + surchargeAmount,
        surchargeType: effectiveSurchargeType,
        surchargeRate: roundRate(additionalRate),
        appliedRate: roundRate(baseRate + additionalRate),
        progressiveDeduction: bracket?.deduction ?? 0,
        surchargeSuspended: false,
      };
    }
  }

  // T-4: 일반 누진세율 (또는 유예/배제로 일반세율 적용)
  const progressiveTax = calculateProgressiveTax(taxBase, brackets);
  const bracket = brackets.find((b) => taxBase <= (b.max ?? Infinity));
  const baseRate = bracket?.rate ?? brackets[brackets.length - 1].rate;

  return {
    calculatedTax: progressiveTax,
    appliedRate: baseRate,
    progressiveDeduction: bracket?.deduction ?? 0,
    surchargeSuspended: suspended,
  };
}

// ============================================================
// H-8: calcReductions — 감면 계산 (R-1 ~ R-4)
// ============================================================

interface ReductionsResult {
  reductionAmount: number;
  reductionType?: string;
}

export function calcReductions(
  calculatedTax: number,
  reductions: TransferReduction[],
  selfFarmingRules: ParsedRates["selfFarmingRules"] | undefined,
  rentalReductionDetails?: RentalReductionInput,
  longTermRentalRules?: LongTermRentalRuleSet,
  newHousingDetails?: NewHousingReductionInput,
  newHousingMatrix?: NewHousingMatrixData,
): ReductionsResult & {
  rentalReductionDetail?: RentalReductionResult;
  newHousingReductionDetail?: NewHousingReductionResult;
} {
  if (reductions.length === 0 && !rentalReductionDetails && !newHousingDetails) {
    return { reductionAmount: 0 };
  }

  // [I3 수정] 조특법 §127 ② 감면 중복 배제: 동일 자산에 복수 감면이 해당될 때 납세자에게 유리한 1건만 적용
  // 각 감면 후보를 개별 계산 후 최대값 1건 선택
  interface ReductionCandidate { amount: number; type: string; }
  const candidates: ReductionCandidate[] = [];
  let rentalReductionDetail: RentalReductionResult | undefined;
  let newHousingReductionDetail: NewHousingReductionResult | undefined;

  // R-2-V2: 장기임대 정밀 엔진
  if (rentalReductionDetails) {
    const detailsWithTax: RentalReductionInput = { ...rentalReductionDetails, calculatedTax };
    const rentalResult = calculateRentalReduction(detailsWithTax, longTermRentalRules);
    rentalReductionDetail = rentalResult;
    if (rentalResult.isEligible && rentalResult.reductionAmount > 0) {
      candidates.push({ amount: rentalResult.reductionAmount, type: "long_term_rental" });
    }
  }

  // R-3-V2: 신축/미분양 정밀 엔진
  if (newHousingDetails) {
    const detailsWithTax: NewHousingReductionInput = { ...newHousingDetails, calculatedTax };
    const newHousingResult = determineNewHousingReduction(detailsWithTax, newHousingMatrix);
    newHousingReductionDetail = newHousingResult;
    if (newHousingResult.isEligible && newHousingResult.reductionAmount > 0) {
      candidates.push({ amount: newHousingResult.reductionAmount, type: "new_housing" });
    }
  }

  // R-1~R-4: 하위 호환 단순 감면 (V2 정밀 엔진과 중복 유형은 이미 V2로 처리됨)
  const v2Types = new Set(candidates.map((c) => c.type));
  for (const reduction of reductions) {
    // V2 정밀 엔진으로 이미 처리된 유형은 중복 계산 방지
    if (v2Types.has(reduction.type)) continue;
    if (reduction.type === "unsold_housing" && v2Types.has("new_housing")) continue;

    let amount = 0;
    if (reduction.type === "self_farming" && selfFarmingRules) {
      if (reduction.farmingYears >= selfFarmingRules.conditions.minFarmingYears) {
        amount = Math.min(applyRate(calculatedTax, selfFarmingRules.maxRate), selfFarmingRules.maxAmount);
      }
    } else if (reduction.type === "long_term_rental") {
      if (reduction.rentalYears >= 8 && reduction.rentIncreaseRate <= 0.05) {
        amount = applyRate(calculatedTax, 0.5);
      }
    } else if (reduction.type === "new_housing") {
      const rate = reduction.region === "metropolitan" ? 0.5 : 1.0;
      amount = applyRate(calculatedTax, rate);
    } else if (reduction.type === "unsold_housing") {
      amount = calculatedTax;
    }
    if (amount > 0) candidates.push({ amount, type: reduction.type });
  }

  // 가장 유리한 감면 1건 선택 (조특법 §127 ②)
  const best = candidates.reduce<ReductionCandidate>(
    (a, b) => (a.amount >= b.amount ? a : b),
    { amount: 0, type: "" },
  );
  const firstType = best.type || undefined;
  const reductionAmount = Math.min(best.amount, calculatedTax);

  const reductionTypeLabel: Record<string, string> = {
    self_farming: "자경농지",
    long_term_rental: "장기임대주택",
    new_housing: "신축주택",
    unsold_housing: "미분양주택",
  };
  const reductionTypeDisplay = firstType ? (reductionTypeLabel[firstType] ?? firstType) : undefined;

  return { reductionAmount, reductionType: reductionTypeDisplay, rentalReductionDetail, newHousingReductionDetail };
}

// ============================================================
// 메인 함수: calculateTransferTax (1-G)
// ============================================================

export function calculateTransferTax(
  input: TransferTaxInput,
  rates: TaxRatesMap,
): TransferTaxResult {
  const steps: CalculationStep[] = [];

  // STEP 0: 세율 파싱
  const parsedRates = parseRatesFromMap(rates);

  // STEP 0.5: 다주택 중과세 판정 (houses[] 제공 + 주택 수 산정 규칙 로드 완료 시)
  let multiHouseSurchargeResult: MultiHouseSurchargeResult | undefined;
  if (input.houses && input.houses.length > 0 && parsedRates.houseCountExclusionRules) {
    const mhInput: MultiHouseSurchargeInput = {
      houses: input.houses,
      sellingHouseId: input.sellingHouseId ?? input.houses[0].id,
      transferDate: input.transferDate,
      isOneHousehold: input.isOneHousehold,
      temporaryTwoHouse: input.multiHouseTemporaryTwoHouse,
      marriageMerge: input.marriageMerge,
      parentalCareMerge: input.parentalCareMerge,
      presaleRights: input.presaleRights ?? [],
    };
    multiHouseSurchargeResult = determineMultiHouseSurcharge(
      mhInput,
      parsedRates.houseCountExclusionRules,
      parsedRates.regulatedAreaHistory ?? null,
      parsedRates.surchargeSpecialRules,
      input.isRegulatedArea,
    );
  }

  // STEP 0.6: 비사업용 토지 정밀 판정 (nonBusinessLandDetails 제공 시)
  let nonBusinessLandJudgment: NonBusinessLandJudgment | undefined;
  // input은 readonly이므로 isNonBusinessLand override를 위한 mutable 복사본 사용
  let effectiveInput = input;
  if (input.nonBusinessLandDetails) {
    nonBusinessLandJudgment = judgeNonBusinessLand(
      input.nonBusinessLandDetails,
      parsedRates.nonBusinessLandJudgmentRules,
    );
    // [I5 수정] 판정 결과로 isNonBusinessLand 덮어씀 — 입력 플래그와 다를 때 step 경고 기록
    if (nonBusinessLandJudgment.isNonBusinessLand !== input.isNonBusinessLand) {
      effectiveInput = { ...input, isNonBusinessLand: nonBusinessLandJudgment.isNonBusinessLand };
      steps.push({
        label: "비사업용 토지 판정 (엔진 재판정)",
        formula: `입력 플래그(${input.isNonBusinessLand ? "비사업용" : "사업용"}) → 정밀 판정 결과: ${nonBusinessLandJudgment.isNonBusinessLand ? "비사업용" : "사업용"}`,
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
      usedEstimatedAcquisition: input.useEstimatedAcquisition,
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
    };
  }

  // STEP 2: 양도차익 계산
  const { gain: rawGain, usedEstimated, estimatedBase, estimatedDeduction, expenses: appliedExpenses } = calcTransferGain(input);
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
    const lit0 = pt0 > 0 ? truncateToThousand(applyRate(pt0, 0.1)) : 0;
    if (pt0 > 0) {
      steps.push({ label: "지방소득세", formula: `${pt0.toLocaleString()}원 × 10% (천원 미만 절사)`, amount: lit0, legalBasis: TRANSFER.LOCAL_INCOME_TAX });
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
    calcLongTermHoldingDeduction(taxableGain, effectiveInput, parsedRates.longTermHoldingRules, isSurchargeCase, suspendedResult, parsedRates.longTermRentalRules);
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

  // STEP 6: 과세표준 (소득세법 §92 — 원 단위, 절사 규정 없음)
  const taxBase = Math.max(0, taxableGain - longTermHoldingDeduction - basicDeduction);
  steps.push({
    label: "과세표준",
    formula: `${taxableGain.toLocaleString()}원 - ${longTermHoldingDeduction.toLocaleString()}원 - ${basicDeduction.toLocaleString()}원`,
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
  const { reductionAmount, reductionType, rentalReductionDetail, newHousingReductionDetail } = calcReductions(
    taxResult.calculatedTax,
    input.reductions,
    parsedRates.selfFarmingRules,
    input.rentalReductionDetails,
    parsedRates.longTermRentalRules,
    input.newHousingDetails,
    parsedRates.newHousingMatrix,
  );
  // 감면 유형별 법령 조문 매핑
  const reductionLawMap: Record<string, string> = {
    "자경농지":     TRANSFER.REDUCTION_SELF_FARMING,
    "장기임대주택": TRANSFER.REDUCTION_LONG_RENTAL,
    "신축주택":     TRANSFER.REDUCTION_NEW_HOUSING,
    "미분양주택":   TRANSFER.REDUCTION_UNSOLD_HOUSING,
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

  // STEP 10: 지방소득세 (총결정세액 × 10%, 1,000원 미만 절사)
  const localIncomeTax = truncateToThousand(applyRate(determinedTaxWithPenalty, 0.1));
  steps.push({
    label: "지방소득세",
    formula: `${determinedTaxWithPenalty.toLocaleString()}원 × 10% (천원 미만 절사)`,
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
    penaltyDetail,
  };
}
