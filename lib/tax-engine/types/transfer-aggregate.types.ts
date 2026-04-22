/**
 * 양도소득세 다건 합산(Aggregate) 공개 타입 정의
 *
 * `../transfer-tax-aggregate.ts` 엔진 본체가 커져 800줄 정책을 초과하여
 * 타입 인터페이스만 이 파일로 분리한다. import 소비자들은 동일 경로(`../transfer-tax-aggregate`)
 * 에서 re-export된 타입을 계속 사용할 수 있으므로 하위 호환은 barrel 수준에서 유지된다.
 *
 * 근거 조문:
 *   - 소득세법 §92 — 동일 과세기간 양도소득금액 합산
 *   - 소득세법 §102 ② + 시행령 §167의2 — 양도차손 통산
 *   - 소득세법 §103 — 연 250만원 기본공제
 *   - 소득세법 §104의2 — 비교과세
 *   - 조특법 §127 ② — 감면 중복배제 (자산 내)
 *   - 조특법 §133 — 감면 종합한도 (자경 1억 / 수용 2억)
 */

import type {
  FilingPenaltyInput,
  DelayedPaymentInput,
  TransferTaxPenaltyResult,
} from "../transfer-tax-penalty";
import type { TransferTaxInput, CalculationStep } from "./transfer.types";

/** 세율군 (소득세법 §102 ① 각 호 구분) */
export type RateGroup =
  | "progressive"              // 일반 누진 6~45% (보유 2년+, 중과·특례 해당 없음)
  | "short_term"               // 단기보유 단일세율 (보유 2년 미만)
  | "multi_house_surcharge"    // 다주택 중과 (+20%p / +30%p)
  | "non_business_land"        // 비사업용 토지 (+10%p)
  | "unregistered";            // 미등기 70% 단일

/** 자산 단위 입력 — TransferTaxInput에서 공통 필드 제외 + 식별자 추가 */
export type TransferTaxItemInput = Omit<
  TransferTaxInput,
  | "annualBasicDeductionUsed"
  | "filingPenaltyDetails"
  | "delayedPaymentDetails"
  | "skipBasicDeduction"
  | "skipLossFloor"
> & {
  propertyId: string;
  propertyLabel: string;
};

/** 다건 입력 (건별 + 공통) */
export interface AggregateTransferInput {
  /** 과세기간 (YYYY) */
  taxYear: number;
  /** 건별 양도 자산 목록 (1..20건) */
  properties: TransferTaxItemInput[];
  /** 당해 연도에 이미 사용한 기본공제액 (타 계산 건 포함) */
  annualBasicDeductionUsed: number;
  /** 기본공제 배분 전략 (기본 MAX_BENEFIT) */
  basicDeductionAllocation?: "MAX_BENEFIT" | "FIRST" | "EARLIEST_TRANSFER";
  /** 신고불성실 가산세 (합산 결정세액 기준 계산) */
  filingPenaltyDetails?: FilingPenaltyInput;
  /** 납부지연 가산세 (합산 결정세액 기준 계산) */
  delayedPaymentDetails?: DelayedPaymentInput;
  /** 과거 4개 과세연도 감면 이력 (§133 5년 누적 한도 계산용, 사용자 직접 입력) */
  priorReductionUsage?: { year: number; type: string; amount: number }[];
}

/** 자산별 breakdown */
export interface PerPropertyBreakdown {
  propertyId: string;
  propertyLabel: string;
  isExempt: boolean;
  exemptReason?: string;
  /** 양도차익 (skipLossFloor=true → 음수 가능) */
  transferGain: number;
  /** 장기보유특별공제 */
  longTermHoldingDeduction: number;
  /**
   * 원시 양도소득금액 = taxableGain - longTermHoldingDeduction (음수 가능)
   * §102② 차손 통산의 입력값.
   */
  income: number;
  /** 세율군 */
  rateGroup: RateGroup;
  /** 같은 그룹에서 받은 차손 공제 (양수) */
  lossOffsetFromSameGroup: number;
  /** 타군에서 안분 받은 차손 공제 (양수) */
  lossOffsetFromOtherGroup: number;
  /** 통산 후 소득금액 (≥ 0) */
  incomeAfterOffset: number;
  /** 배분된 기본공제액 */
  allocatedBasicDeduction: number;
  /** 그룹 과세표준 중 본 자산 기여분 */
  taxBaseShare: number;
  /**
   * 건별 단독 감면액 (단건 엔진이 이미 중복배제 적용).
   * 합산 재계산 전의 값으로 비교·디버깅용.
   */
  reductionAmount: number;
  /** 적용된 감면 유형 식별자 (self_farming·public_expropriation 등) */
  reductionType?: string;
  /**
   * 건별 감면대상 양도소득금액 (조특령 §66 비율 적용 후).
   * 합산 재계산의 분자로 사용된다.
   */
  reducibleIncome: number;
  /**
   * 합산 재계산 후 이 건에 배분된 감면세액.
   * = `유형별 총감면세액 × (이 건 reducibleIncome / 유형별 총 reducibleIncome)`
   */
  reductionAggregated: number;
  /** 배분 비율 (= 이 건 reducibleIncome / 유형별 총 reducibleIncome) */
  reductionAllocationRatio: number;
  /** §114조의2 건별 가산세 */
  penaltyTax: number;
  /** 건별 세부 계산 steps (단건 엔진에서 생성) */
  steps: CalculationStep[];
}

/** 감면 유형별 합산 재계산 내역 (UI 표시용) */
export interface ReductionBreakdownEntry {
  /** 감면 유형 식별자 */
  type: string;
  /** 법령 근거 (표시용) */
  legalBasis: string;
  /** 유형별 총 감면대상 양도소득금액 */
  totalReducibleIncome: number;
  /** 재계산 분모 (합산 과세표준) */
  aggregateTaxBase: number;
  /** 재계산 기준 세액 (비교과세 MAX 결과) */
  aggregateCalculatedTax: number;
  /** 재계산 원시 감면세액 (한도 적용 전) */
  rawAggregateReduction: number;
  /** §133 유형별 연간 한도 (없으면 0) */
  annualLimit: number;
  /** 연간 한도 적용 후 금액 */
  annuallyCappedReduction: number;
  /** 한도 적용 후 최종 감면세액 (연간 + 5년 한도 모두 적용) */
  cappedAggregateReduction: number;
  /** 연간 한도에 걸려 절사된 경우 true */
  cappedByLimit: boolean;
  /** §133 5년 누적 한도 (없으면 0) */
  fiveYearLimit: number;
  /** 과거 4개 연도 그룹 누적 감면액 */
  priorGroupSum: number;
  /** 5년 한도 잔여액 */
  fiveYearRemaining: number;
  /** 5년 한도에 걸려 추가 절사된 경우 true */
  cappedByFiveYearLimit: boolean;
  /** 이 유형에 속한 자산 식별자 목록 */
  assetIds: string[];
}

/** 세율군별 집계 */
export interface GroupTaxResult {
  group: RateGroup;
  /** 그룹 내 자산 IDs */
  assetIds: string[];
  /** 그룹 차익 합 (양수 자산만) */
  groupGrossGain: number;
  /** 그룹 차손 합 (음수 자산만, 절댓값) */
  groupGrossLoss: number;
  /** 통산 후 그룹 소득금액 (≥ 0) */
  groupIncomeAmount: number;
  /** 그룹 배분 기본공제 */
  groupBasicDeduction: number;
  /** 그룹 과세표준 = max(0, groupIncomeAmount - groupBasicDeduction) */
  groupTaxBase: number;
  /** 그룹 산출세액 */
  groupCalculatedTax: number;
  appliedRate: number;
  surchargeRate?: number;
  progressiveDeduction: number;
}

export interface LossOffsetRow {
  fromPropertyId: string;
  toPropertyId: string;
  amount: number;
  scope: "same_group" | "other_group";
}

export interface AggregateTransferResult {
  properties: PerPropertyBreakdown[];

  totalTransferGain: number;
  totalLongTermHoldingDeduction: number;
  totalIncomeBeforeOffset: number;
  totalLoss: number;

  lossOffsetTable: LossOffsetRow[];
  /** 통산 후에도 남아 소멸된 차손 (이월 불인정) */
  unusedLoss: number;
  totalIncomeAfterOffset: number;

  basicDeduction: number;
  taxBase: number;

  groupTaxes: GroupTaxResult[];

  /** 방법 B: 세율군별 분리 산출세액 합 */
  calculatedTaxByGroups: number;
  /** 방법 A: 전체 누진세율 적용 산출세액 */
  calculatedTaxByGeneral: number;
  /** 비교과세(§104의2) 적용 결과 */
  comparedTaxApplied: "groups" | "general" | "none";
  /** MAX(byGroups, byGeneral) */
  calculatedTax: number;

  /**
   * 총 감면세액 (합산 재계산 + §133 한도 적용 후).
   * 유형이 지정된 감면은 유형별 비율 재계산을 적용하고, 유형 미지정 감면(레거시 경로)은 건별 단순합.
   */
  reductionAmount: number;
  /**
   * 감면 유형별 합산 재계산 내역 (UI 표시·디버깅용).
   * self_farming·public_expropriation 등 reducibleIncome을 노출하는 감면에 대해 세부 항목 포함.
   */
  reductionBreakdown: ReductionBreakdownEntry[];
  /** 결정세액 = max(0, calculatedTax - reductionAmount) */
  determinedTax: number;

  /** §114의2 건별 합 + 신고불성실·납부지연 */
  penaltyTax: number;
  penaltyDetail?: TransferTaxPenaltyResult;

  /** 지방소득세 = (결정+가산) × 10%, 천원 절사 */
  localIncomeTax: number;
  totalTax: number;

  steps: CalculationStep[];
  warnings: string[];
}
