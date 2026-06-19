/**
 * 상속세·증여세 공통 공유 타입 — inheritance-gift.types.ts에서 분리 (800줄 정책, 2026-06-19).
 *
 * 결과 breakdown·메타 공통 계약. 모든 도메인 타입 파일이 import하는 leaf.
 */

/** 계산 단계별 산식·금액 내역 (결과 breakdown 공통) */
export interface CalculationStep {
  label: string;
  amount: number;
  /** 상증법 §XX 등 근거 조문 */
  lawRef?: string;
  note?: string;
}

/** 공통 계산 결과 메타 */
export interface TaxResultMeta {
  breakdown: CalculationStep[];
  appliedLaws: string[];
  warnings: string[];
  /** 계산에 적용된 세법 기준일 (YYYY-MM-DD) */
  appliedLawDate: string;
}
