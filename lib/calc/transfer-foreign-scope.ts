/**
 * 국외자산 부동산 경로 분기 술어 — **단일 소스**(D-3).
 *
 * ⑤ 화면(1단계 분기)·⑥ 사이드바·⑧ 검증(`collectStepIssuesRaw` 우회)·④ 호출·결과 분기가 모두 이 함수를 쓴다.
 * 손으로 `form.assetLocation === "foreign"`을 흩어 쓰면 한 곳이 어긋나 UI는 통과인데 validate가 국내 규칙으로 막는 모순이 생긴다(3중 패턴).
 * 이 파일은 의존성이 없다 — 클라이언트 검증·서버 스키마가 모두 import할 수 있다.
 */
import { FOREIGN_RE_MIN_RESIDENCE_YEARS } from "@/lib/tax-engine/foreign-realestate/input-asserts";

export interface ForeignScopeFormLike {
  assetLocation?: "domestic" | "foreign";
}

/** 폼이 국외자산 부동산 경로인가 — 구 세션(필드 없음)은 국내 */
export function isForeignRealEstateForm(form: ForeignScopeFormLike | null | undefined): boolean {
  return form?.assetLocation === "foreign";
}

/**
 * 입력한 거주 연수가 §118의2의 5년 미만인가 — 경고 카드(비차단)와 결과(U2)가 같은 술어를 쓴다.
 * 빈 값·잘못된 값은 「미입력」이라 false(입력 요구는 ⑧이 한다 — 0년으로 읽지 않는다).
 */
export function isForeignResidenceUnderMin(years: string): boolean {
  const t = years.trim();
  if (t === "") return false;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n < FOREIGN_RE_MIN_RESIDENCE_YEARS;
}

/**
 * 거주 연수 폼 전역 1칸(사용자 결정 C-2)의 한계 — 입력이 정확히 5년이고 양도일이 서로 다른 자산이 함께 있으면
 * 5년 충족 여부가 자산마다 갈릴 수 있다(양도일까지의 거주 연수는 자산마다 다르다). 이때 «확인 필요»를 알린다(비차단).
 */
export function isForeignResidenceBoundaryAmbiguous(years: string, transferDates: readonly string[]): boolean {
  if (years.trim() === "" || Number(years) !== FOREIGN_RE_MIN_RESIDENCE_YEARS) return false;
  return new Set(transferDates.filter((d) => d.trim() !== "")).size >= 2;
}
