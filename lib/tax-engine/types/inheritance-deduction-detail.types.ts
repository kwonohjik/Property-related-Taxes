/**
 * 상속공제 항목별 계산 근거 detail 타입 (상증법 §18~§24)
 *
 * 계획: docs/00-pm/inheritance-deduction-breakdown-expandable.plan.md
 * 설계: docs/02-design/features/inheritance-deduction-breakdown.engine.design.md
 *
 * 목적: 결과 화면의 각 공제 항목 펼침 시 교재 종합사례(이미지 42~43)와 동일한
 *        계산 근거 표·산식을 표시하기 위한 구조화 타입.
 * 규칙: 모든 중간값은 엔진이 이미 계산 — 신규 계산 없이 result detail 노출만.
 */

// ============================================================
// ① 일괄공제 vs 항목별 공제 비교 (§21)
// ============================================================

/**
 * §21 일괄공제 vs 항목별(기초§18 + 인적§20①) 비교 선택 근거 detail.
 * calcInheritanceDeductions 내 지역변수 조립 → result에 주입.
 */
export interface LumpSumComparisonDetail {
  /** 기초공제 (§18 ①): 2억원 */
  basicDeduction: number;
  /** 인적공제 합계 (§20①: 자녀·미성년·연로자·장애인) */
  personalDeductionTotal: number;
  /** 기초 + 인적 소계 (항목별 공제 합계) */
  itemizedSubtotal: number;
  /** 일괄공제액 (§21 ①): 5억원 */
  lumpSumAmount: number;
  /** 선택된 금액 (max(itemizedSubtotal, lumpSumAmount) 또는 spouseSoleHeir 시 itemized 강제) */
  selectedAmount: number;
  /** 선택 방법 */
  selectedMethod: "lump_sum" | "itemized";
  /** §21② 배우자 단독상속으로 일괄공제 배제 여부 */
  spouseSoleHeirExclusion: boolean;
}

// ============================================================
// ③ 배우자 법정상속분 산정 7행 표 (§19 ①1호 — Phase D 발동 시만)
// ============================================================

/**
 * 배우자 법정상속분 산정 7행 표 (§19 ①1호 분자 산식).
 * inheritance-tax.ts Phase D closure(numeratorCorrected·spouseRatio 등) 조립 후
 * orchestrator가 deductionResult.spouseDeductionDetail에 patch.
 *
 * Phase D 미발동(단순 케이스) 시 → undefined (7행 표 생략).
 */
export interface SpouseLegalShareTable {
  /** 총상속재산가액 (본래상속 + 간주상속 + 추정상속) */
  grossPlusPresumed: number;
  /** + 상속인 사전증여 가산가액 (영리법인·legatee 제외) */
  heirPriorGiftAdded: number;
  /** − 상속인 외 유증·증여액 */
  legateeNonHeirDeducted: number;
  /** − 채무·공과금 (장례비 제외) */
  debtDeducted: number;
  /** − 비과세·공익법인 출연 */
  exemptDeducted: number;
  /**
   * 분자 (= A−B+C 결과: 상속재산가액 기준)
   * = grossPlusPresumed + heirPriorGiftAdded − legateeNonHeirDeducted − debtDeducted − exemptDeducted
   * 교재: 7,590,000,000
   */
  numerator: number;
  /**
   * 배우자 법정지분 비율 (민법 §1009).
   * = 1.5 / (1.5 + 공동상속인 수)
   * 교재: 1.5 / 3.5 ≈ 0.4286
   */
  spouseRatio: number;
  /**
   * 법정상속분 raw = floor(numerator × spouseRatio)
   * 교재: floor(7,590,000,000 × 1.5 / 3.5) = 3,252,857,142
   */
  spouseLegalShareRaw: number;
  /** − 배우자 사전증여 과세표준 */
  spouseGiftTaxBaseDeducted: number;
  /**
   * 배우자 법정상속분 최종 = max(0, spouseLegalShareRaw − spouseGiftTaxBaseDeducted)
   * 교재: 3,252,857,142 − 160,000,000 = 3,092,857,142
   */
  legalShare: number;
}

// ============================================================
// ③ 배우자 실제상속액 채무분리 표 (집행기준 19-17-1 — D-2 A)
// ============================================================

/**
 * 배우자 실제상속액 채무분리 3행 표.
 * orchestrator가 estateItems/debtItems heirAllocations에서 배우자 귀속분 집계 후 주입.
 */
export interface SpouseActualAmountTable {
  /** 배우자 귀속 자산 합계 (heirAllocations에서 배우자 ID 합산) */
  spouseEstateValue: number;
  /** 배우자 승계 채무 합계 (장례비 제외, debtItems heirAllocations 배우자 ID) */
  spouseDebtDeducted: number;
  /** 배우자 비과세 재산 (현재 0 — 추후 확장) */
  spouseExemptDeducted: number;
  /**
   * 배우자 실제 상속액 = spouseEstateValue − spouseDebtDeducted − spouseExemptDeducted
   * 교재: 3,300,000,000 − 500,000,000 = 2,800,000,000
   */
  actualAmount: number;
}

// ============================================================
// ③ 배우자공제 종합 detail (§19)
// ============================================================

/**
 * §19 배우자공제 계산 근거 detail.
 */
export interface SpouseDeductionDetail {
  /** ③㉮ 법정상속분 산정 7행 표 (Phase D 발동 시만; 단순 케이스에서 undefined) */
  legalShareTable?: SpouseLegalShareTable;
  /** ③㉯ 실제상속액 채무분리 표 (orchestrator 집계; 협의분할 입력 있을 때만) */
  actualAmountTable?: SpouseActualAmountTable;
  /** 30억 최고한도 (§19 ①2호) */
  capAmount: number;
  /** min(법정상속분, 30억) */
  legalShareCapped: number;
  /** min(실제상속분, 30억) */
  actualAmountCapped: number;
  /** min(법정상속분capped, 실제상속분capped) = 공제 기준액 (Floor 적용 전) */
  baseBeforeFloor: number;
  /** 5억 최소보장(§19 ④) 발동 여부 (baseBeforeFloor < 5억) */
  floorApplied: boolean;
  /** 최종 배우자공제액 */
  deduction: number;
}

// ============================================================
// ④ 금융재산공제 detail (§22)
// ============================================================

/**
 * §22 순금융재산 분해 1행 (예금·상장주식·보험금·금융채무 등).
 */
export interface FinancialBreakdownRow {
  /** 항목 레이블 (예: "예금", "상장주식", "보험금", "금융채무") */
  label: string;
  /** 금액 (채무는 양수, 순금융재산 산식에서 차감은 rows 배열 순서로 UI가 표현) */
  amount: number;
}

/**
 * §22 금융재산공제 계산 근거 detail.
 * rows[]는 orchestrator가 estateItems/debtItems에서 종류별 집계 후 주입.
 * calcFinancialDeduction은 산식 필드(netFinancial·bracket·rate 등)만 반환.
 */
export interface FinancialDeductionDetail {
  /**
   * 순금융재산 분해 행 배열 (D-1 A 결정).
   * 예: [
   *   { label: "예금", amount: 2_100_000_000 },
   *   { label: "상장주식", amount: 150_000_000 },
   *   { label: "보험금", amount: 50_000_000 },
   *   { label: "금융채무", amount: 1_145_000_000 },
   * ]
   * orchestrator가 estateItems(category financial/listed_stock, deemedCategory insurance 등) +
   * debtItems(category financial) 집계 후 주입.
   * calcFinancialDeduction 반환 시 [] (empty) — orchestrator patch 필수.
   */
  rows: FinancialBreakdownRow[];
  /** 순금융재산 = 금융자산 합계 − 금융채무 합계 */
  netFinancial: number;
  /** 적용 구간 */
  bracket: "tier1" | "tier2" | "tier3";
  /** 적용 공제율 (tier1=1.0·tier2=0·tier3=0.2, tier2는 고정액이므로 0으로 표기) */
  rate: number;
  /** 한도 적용 전 공제액 raw (= netFinancial×rate 또는 고정액) */
  rawDeduction: number;
  /** 한도 2억원 */
  cap: number;
  /** 한도 적용 후 공제액 (= min(rawDeduction, cap)) */
  cappedDeduction: number;
}

// ============================================================
// ⑤ 동거주택공제 detail (§23의2)
// ============================================================

/**
 * §23의2 동거주택공제 계산 근거 detail.
 */
export interface CohabitDeductionDetail {
  /** 동거주택 공시가격 (평가액) */
  housingValue: number;
  /** − 담보된 피상속인 채무액 (§23의2 ①) */
  securedDebt: number;
  /** 공제 기준액 = housingValue − securedDebt */
  base: number;
  /** 적용 공제율 (2020.1.1. 이후: 1.0, 이전: 0.8) */
  rate: number;
  /** 한도 적용 전 raw = floor(base × rate) */
  rawDeduction: number;
  /** 6억원 최고한도 */
  cap: number;
  /** 최종 공제액 = min(rawDeduction, cap) */
  cappedDeduction: number;
}

// ============================================================
// ⑥ §24 종합한도 detail
// ============================================================

/**
 * §24 종합한도 계산 근거 detail.
 *
 * 한도(ceiling) = 상속세 과세가액
 *              − ①호 상속인 외 유증액
 *              − max(0, ③호 모든 사전증여 − (증여공제 + 재해손실공제))
 *
 * ②호(상속포기 후순위) 는 현재 0 — 추후 확장.
 */
export interface DeductionLimitCeilingDetail {
  /** 상속세 과세가액 */
  taxableEstateValue: number;
  /** ① 상속인 외 수유자(유증·사인증여)에게 귀속된 금액 */
  legateeAmountNonHeir: number;
  /** ② 상속포기자의 후순위 상속인 상속액 (현재 미구현 — 항상 0) */
  heirWaiverAmount: number;
  /** ③ 합산된 모든 사전증여 가산가액 (§13 대상 — 상속인 + 영리법인 + legatee 포함) */
  totalPriorGiftAmount: number;
  /** ③ 사전증여에 대한 증여재산공제 합계 */
  priorGiftDeductionTotal: number;
  /** ③ 신고기한 내 재해손실공제 */
  disasterLossDeduction: number;
  /** ③ net = max(0, totalPriorGiftAmount − (priorGiftDeductionTotal + disasterLossDeduction)) */
  netPriorGiftDeducted: number;
  /**
   * §24 ceiling = taxableEstateValue − legateeAmountNonHeir − netPriorGiftDeducted
   * 교재: 8,775M − 500M − max(0, 2,960M − 650M) = 8,775M − 500M − 2,310M = 5,965M
   */
  ceiling: number;
  /** 한도 적용 전 공제 합계 */
  rawTotalDeduction: number;
  /** 한도 초과 여부 (rawTotalDeduction > ceiling) */
  wasCapped: boolean;
  /** 최종 적용 공제액 = min(rawTotalDeduction, ceiling) */
  limitedDeduction: number;
}
