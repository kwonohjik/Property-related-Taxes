/**
 * 판정 메뉴 ⑧ 공용 타입·생성자 — 단계 검증 파일들이 같이 쓴다(2026-11 리뷰 I-17 분리).
 */

export interface OneHouseJudgmentValidationError {
  field: string;
  message: string;
  severity: "error" | "warning";
}

export type Errors = OneHouseJudgmentValidationError[];

export const err = (field: string, message: string): OneHouseJudgmentValidationError => ({
  field,
  message,
  severity: "error",
});
export const warn = (field: string, message: string): OneHouseJudgmentValidationError => ({
  field,
  message,
  severity: "warning",
});
