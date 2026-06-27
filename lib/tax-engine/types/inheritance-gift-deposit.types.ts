/**
 * 예금·저금·적금 §63④ 평가 보충 필드 mixin.
 *
 * EstateItemSavingsFields 는 EstateItem 인터페이스가 다중 상속으로 흡수.
 * 법령: 상속세및증여세법 §63 ④ — 원금 + 미수이자 − 원천징수세액
 *
 * 분리 사유: inheritance-gift-estate.types.ts 800줄 초과 방지 (2026-06-27).
 */

/** 예금·저금·적금 §63④ 보충평가 옵션 필드 mixin (EstateItem의 다중 상속 대상) */
export interface EstateItemSavingsFields {
  // ===== 예금·저금·적금 §63④ 보충평가 =====
  /**
   * 예금·저금·적금 평가 방법 (상증법 §63④).
   * - "balance": 잔액·시가 (기본, marketValue 사용)
   * - "auto": 원금 + 미수이자 − 원천징수세액 자동 산정 (클라이언트가 날짜 기반 계산 후 주입)
   * - "manual": 미수이자·원천징수세액 직접 입력
   * undefined → "balance" 처리 (엔진 fallback).
   */
  savingsValuationMode?: "balance" | "auto" | "manual";
  /** ㉠ 예입원금 (§63④ auto/manual 모드 전용, 단위: 원). undefined → marketValue fallback. */
  savingsPrincipal?: number;
  /**
   * auto 입력: 약정 연이자율 (% 단위 — 5.0 = 5%).
   * 소득세법 §129 ① 1호 라목 일반 이자소득 원천징수세율 산정 기준.
   */
  savingsAnnualRate?: number;
  /**
   * auto 입력: 이자기산일 (YYYY-MM-DD string).
   * 클라이언트가 injectSavingsAccrualIfAuto 시 parseISO 변환. 엔진은 string 그대로.
   */
  savingsStartDate?: string;
  /**
   * auto 입력: 원천징수세율 (% 단위, 기본 14 — 소득세법 §129 ① 1호 라목).
   * undefined → 14로 처리 (injectSavingsAccrualIfAuto 기본값).
   */
  savingsWithholdingRate?: number;
  /**
   * auto 입력: 지방소득세 포함 여부 (기본 true — 지방세법 §103의13 ①).
   * undefined → true로 처리 (injectSavingsAccrualIfAuto 기본값).
   */
  savingsIncludeLocalTax?: boolean;
  /**
   * ㉡ 미수이자 (원).
   * - auto 모드: 클라이언트가 injectSavingsAccrualIfAuto로 주입 후 전달
   * - manual 모드: 사용자 직접 입력
   * 엔진은 날짜 연산 미수행 — 반드시 클라이언트가 pre-inject 후 전달.
   */
  savingsAccruedInterest?: number;
  /**
   * ㉢ 원천징수세액 합계 (=㉢-1 이자소득세 + ㉢-2 지방소득세, 원).
   * - auto 모드: 클라이언트 주입 (injectSavingsAccrualIfAuto)
   * - manual 모드: 사용자 직접 입력
   */
  savingsWithholdingTax?: number;
}
