/**
 * 상속 주택 환산취득가 — 개별주택가격 미공시 + 1990 이전 토지 통합 처리 공개 타입
 *
 * 자산 종류가 주택이고 상속개시일이 개별주택가격 최초 공시일(2005-04-30) 이전인 경우
 * 상속개시일 시점에 개별주택가격이 존재하지 않으므로, 토지·주택을 분리 입력받아
 * 3-시점 비율 환산으로 상속개시일 합계 기준시가를 자동 산출한다.
 *
 * 근거 조문:
 *   - 소득세법 시행령 §164⑤ — 개별주택가격 미공시 취득시 기준시가 추정
 *   - 소득세법 시행령 §176조의2④ — 의제취득일 전 상속: max(환산, 실가×CPI)
 *   - 소득세법 시행령 §163⑥ — 개산공제 = 취득시 기준시가 × 3%
 *   - 소득세법 시행규칙 §80⑥ — 1990.8.30. 이전 취득 토지 등급가액 환산
 */

import type { LandGradeInput } from "../pre-1990-land-valuation";
import type { Pre1990LandValuationResult } from "../pre-1990-land-valuation";

export type { LandGradeInput };

/** 개별주택가격 최초 고시일 (2005-04-30) */
export const HOUSE_FIRST_DISCLOSURE_DATE = new Date("2005-04-30T00:00:00.000Z");

/** 1990.8.30. 이전 취득 토지 등급가액 환산 입력 */
export interface Pre1990LandGradeInput {
  /** 1990.8.30. 현재 등급가액 */
  grade_1990_0830: LandGradeInput;
  /** 1990.8.30. 직전 등급가액 */
  gradePrev_1990_0830: LandGradeInput;
  /** 상속개시일(또는 의제취득일) 시점 등급가액 */
  gradeAtAcquisition: LandGradeInput;
  /** 1990.1.1. 개별공시지가 (원/㎡) */
  pricePerSqm_1990: number;
  /** 선택: CAP-2 override */
  forceRatioCap?: boolean;
}

export interface InheritanceHouseValuationInput {
  /** 상속개시일 (1990-08-30 분기 + 2005-04-30 적용 여부 판단) */
  inheritanceDate: Date;
  /** 양도일 (pre-1990 환산의 양도시 기준시가 산출용) */
  transferDate: Date;

  /** 토지 면적 (㎡) */
  landArea: number;

  // ── 양도시 시점 ──
  /** 양도시 개별공시지가 (원/㎡) */
  landPricePerSqmAtTransfer: number;
  /** 양도시 개별주택가격 (원) */
  housePriceAtTransfer: number;

  // ── 최초고시 시점 ──
  /** 최초 고시일 (기본 "2005-04-30", 사용자가 다른 날짜로 보정 가능) */
  firstDisclosureDate?: Date;
  /** 최초고시 시점 개별공시지가 (원/㎡) */
  landPricePerSqmAtFirstDisclosure: number;
  /** 최초고시 시점 개별주택가격 (원) */
  housePriceAtFirstDisclosure: number;

  // ── 상속개시일 시점 토지 ──
  /**
   * 상속개시일 시점 개별공시지가 (원/㎡).
   * - 상속개시일 ≥ 1990-08-30: 필수 (개별공시지가 존재)
   * - 상속개시일 < 1990-08-30: pre1990 입력에서 자동 환산. 제공 시 override.
   */
  landPricePerSqmAtInheritance?: number;

  /**
   * 1990.8.30. 이전 취득 토지 등급가액 환산 입력.
   * 상속개시일 < 1990-08-30 이면 이 필드 또는 landPricePerSqmAtInheritance 중 하나 필수.
   */
  pre1990?: Pre1990LandGradeInput;

  // ── 상속개시일 시점 주택 ──
  /**
   * 상속개시일 시점 개별주택가격 직접 입력 override (원).
   * - 미입력 시: floor(housePriceAtFirstDisclosure × landStdAtInheritance / landStdAtFirstDisclosure)
   *   로 자동 추정 (§164⑤ 토지 비율 적용).
   * - 엑셀처럼 별도 산정근거가 있을 때 직접 입력.
   */
  housePriceAtInheritanceOverride?: number;
}

/** 주택가격 추정 방법 */
export type HousePriceEstimationMethod =
  | "user_override"    // 사용자 직접 입력
  | "estimated_phd";   // 토지 비율로 자동 추정 (§164⑤)

export interface InheritanceHouseValuationResult {
  // ── 합계 기준시가 3시점 ──
  /** 상속개시일 합계 기준시가 (토지 + 추정 주택가격) */
  totalStdPriceAtInheritance: number;
  /** 양도시 합계 기준시가 (토지 + 양도시 주택가격) */
  totalStdPriceAtTransfer: number;
  /** 최초고시 합계 기준시가 (검증용) */
  totalStdPriceAtFirstDisclosure: number;

  // ── 토지 기준시가 ──
  landStdAtInheritance: number;
  landStdAtTransfer: number;
  landStdAtFirstDisclosure: number;

  // ── 주택 기준시가 ──
  /** 상속개시일 시점 주택가격 (override 또는 추정값) */
  housePriceAtInheritanceUsed: number;
  estimationMethod: HousePriceEstimationMethod;

  // ── 1990 환산 상세 (pre1990 입력이 있을 때) ──
  pre1990Result?: Pre1990LandValuationResult;

  /** 한국어 계산 산식 (UI 표시용, 변수약어 금지) */
  formula: string;
  /** 적용 법령 근거 */
  legalBasis: string;
  /** 경계 경고 (1990 이후인데 pre1990 입력된 경우 등) */
  warnings: string[];
}
