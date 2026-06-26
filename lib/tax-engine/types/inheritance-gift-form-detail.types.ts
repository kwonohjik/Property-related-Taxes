/**
 * 증여자 관계·§57 할증·§58 안분·§27 세대생략·신고서 행 — form/detail 순수 타입
 *
 * 800줄 정책으로 inheritance-gift.types.ts(barrel)에서 분리 (2026-06-26).
 * 전부 원시 필드만 사용(외부 타입 의존 없음). barrel이 100% re-export → 기존 import 경로 무변경.
 */

// ============================================================
// 증여자 관계 (§47② 동일인 그룹화 + §57 적용 판정)
// ============================================================

/**
 * 증여자(donor)와 수증자의 관계 — 동일인 그룹화 기준 (상증법 §47 ②).
 *
 * 그룹 매핑:
 *   A: father, mother           — 직계존속·부모 (§47② 동일인)
 *   B: grandparent              — 직계존속·조부모 (§47② 동일인, §57 세대생략 할증 대상)
 *   C: spouse                   — 배우자
 *   D: lineal_descendant        — 직계비속
 *   E: sibling                  — 형제자매
 *   F: other_relative           — 기타친족
 *   G: other                    — 기타·타인
 */
export type GiftDonorRelation =
  | "father"
  | "mother"
  | "grandparent"
  | "spouse"
  | "lineal_descendant"
  | "sibling"
  | "other_relative"
  | "other";

export type DonorGroup = "A" | "B" | "C" | "D" | "E" | "F" | "G";

// ============================================================
// §57 할증 한도 detail (사례 2 PDF 표 ⑧⑨⑩⑪⑫⑬ 재현용)
// ============================================================

export interface GenerationSkipSurchargeDetail {
  /** ⑧ 할증과세 = ⑦ × (부모 제외 직계존속 재산가액 / 총 증여재산가액) × 할증율 */
  surchargeBase: number;
  /** 부모 제외 직계존속 비율 (0~1) — 그룹 B 합산 시 1, 그 외 0 */
  nonParentLinealRatio: number;
  /** 할증율 (0.30 원칙 / 0.40 미성년+20억 초과) */
  surchargeRate: number;
  /** ⑨ 누적 기할증과세액 = Σ⑫_prior (사전증여 회차들의 추가할증 누계) */
  priorAdditionalCumulative: number;
  /** ⑩ 공제한도 = ⑦ × ⑤_prior / ⑤ × 할증율 */
  surchargeCreditLimit: number;
  /** ⑪ 차감 기할증과세액 = Min(⑨, ⑩) */
  priorSurchargeCredit: number;
  /** ⑫ 추가 할증세액 = Max(0, ⑧ − ⑪) */
  additionalSurcharge: number;
  /** ⑬ 산출세액합계 = ⑦ + ⑫ */
  totalComputedTaxWithSurcharge: number;
}

// ============================================================
// §58 안분 한도 detail (사례 1 ⑧⑨⑩ / 사례 2 ⑭⑮⑯ 재현용)
// ============================================================

export interface PriorGiftCreditDetail {
  /** ⑭ 가산 증여재산의 산출세액 = 가장 최근 합산 회차의 ⑦ */
  priorComputedTax: number;
  /** ⑤_prior = 가장 최근 합산 회차의 합산과세표준 */
  priorAddedTaxBase: number;
  /** ⑤ = 금번 합산과세표준 */
  aggregatedTaxBase: number;
  /** ⑮ 한도 = ⑦ × ⑤_prior / ⑤ */
  creditLimit: number;
  /** ⑯ 공제액 = Min(⑭, ⑮) */
  priorPaidCredit: number;
}

// ============================================================
// §27 세대생략 할증 per-heir detail (상속세 전용 — 증여세 GenerationSkipSurchargeDetail 재사용 금지)
// ============================================================

/**
 * §27 세대생략 수유자 1인 할증 계산 행
 * feedback_no_internal_id_in_result: heirName은 내부 id 대신 표시용 이름 사용
 */
export interface InheritanceGenerationSkipHeirRow {
  /** Heir.id — 배부 연결용 */
  heirId: string;
  /** 표시용 이름 (내부 id 노출 금지) */
  heirName?: string;
  /** 분자 = 직접 유증·상속분 + §13 cutoff 내 사전증여 */
  numerator: number;
  /** 할증율 0.30 / 0.40 */
  rate: number;
  /** 미성년 여부 (resolveMinorBeneficiary 도출) */
  isMinor: boolean;
  /** floor(computedTax × numerator × rate / denominator) — 개별 단일 floor */
  surcharge: number;
  /**
   * §27 단서 대습상속 배제 행 — true 시 rate=0·surcharge=0.
   * 결과 카드(GenerationSkipFormulaRows)가 "0%" 대신 "대습상속 §27 단서 배제" 전용 표시로 분기.
   */
  excludedBySubstitution?: boolean;
}

/**
 * §27 세대생략 할증 전체 상세 (상속세 전용)
 * InheritanceTaxResult.generationSkipDetail 에 저장.
 * 레거시 단일 경로에서도 rows 1행으로 통일하여 결과 카드 공통 표시 가능.
 */
export interface InheritanceGenerationSkipDetail {
  /** adjustedDenominator = taxableEstateValue − nonHeirNonLegateeGifts */
  denominator: number;
  /** 산출세액 (할증 전) */
  computedTax: number;
  /** per-heir 할증 행 배열 */
  rows: InheritanceGenerationSkipHeirRow[];
  /** Σ surcharge */
  total: number;
  /**
   * L-3: 안분 산식(분자÷분모) 실제 적용 여부.
   * true  = per-heir 경로 — rows[i].surcharge = computedTax × numerator × rate / denominator
   * false = 레거시 경로 — surcharge = applyRate(computedTax, rate) 전액 할증 (분모 미사용)
   * 결과 카드(GenerationSkipFormulaRows)가 이 플래그로 산식 표시를 분기해야 함.
   */
  prorationActive: boolean;
}

// ============================================================
// 신고서 양식 표 행 (12행 사례 1 / 18행 사례 2)
// ============================================================

export interface FilingFormRow {
  /** "①" ~ "⑱" (사례 1·2) 또는 "⑰" ~ "㊼" (별지 제10호서식) PDF 표 행 번호. 헤더·도출 행은 빈 문자열 */
  number: string;
  label: string;
  amount: number;
  /**
   * "—" 표기가 필요한 산식 무의미 행 (priorGifts=0 시 ⑩⑪⑭⑮ 등) /
   * "header" = 그룹 머리글 행 (별지 양식 "납부방법")
   */
  display: "amount" | "dash" | "rate" | "header";
  /** 행에 표시할 산식 hint (선택) */
  formula?: string;
  lawRef?: string;
  /** 별지 제10호서식 2-column grid 배치 (구 buildFilingFormRows는 undefined → UI 단일 컬럼 fallback) */
  column?: "left" | "right";
}
