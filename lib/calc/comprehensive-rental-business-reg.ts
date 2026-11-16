/**
 * 종부령 §3① 세무서 사업자등록일 칸 — 화면이 「무엇을 묻는가」의 단일 소스(⑤ 표시 · ④ 전송 · ⑧ 차단 공용).
 * - 1호 민간건설·2호 민간매입: 단서(2018.3.31. 이전 사업자등록등) — 과세연도와 무관하게 묻는다(`asksBusinessRegistrationDate`).
 * - 그 밖 민간 6유형: 각 호 외의 부분 「과세기준일 현재 … 사업자등록」 · 9.30.까지 의제(T-13) — 엔진 `filingDeadlineApplies`와 같은 경계.
 * 비면 ⑧이 막는다. ⑫ refine은 두지 않는다(1·2호와 같음 — 직접 API는 엔진이 「모름」=불성립).
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-input-gaps-4.plan.md §3.1
 */
import { filingDeadlineApplies } from "@/lib/tax-engine/comprehensive-exclusion-business-reg";
import { toOptionalDate } from "@/lib/api/date-coerce";

/** §3①1호·2호 단서(2018.3.31. 사업자등록등)가 걸리는 유형 — 민간건설·민간매입(구법 5년) */
export function asksBusinessRegistrationDate(registrationType: string): boolean {
  return registrationType === "private_construction" || registrationType === "private_purchase_short";
}

/** 세무서 사업자등록일 칸을 묻는가(1·2호 단서 또는 9.30. 기한) */
export function asksBusinessRegistrationField(registrationType: string, assessmentYear: string): boolean {
  if (asksBusinessRegistrationDate(registrationType)) return true;
  const year = parseInt(assessmentYear);
  const assessmentDate = Number.isFinite(year) ? toOptionalDate(`${year}-06-01`) : undefined;
  return !!assessmentDate && filingDeadlineApplies(registrationType, assessmentDate);
}

/** ⑤ hint — 1·2호는 단서, 그 밖은 과세기준일·9.30. 의제 */
export function businessRegistrationHint(registrationType: string): string {
  return asksBusinessRegistrationDate(registrationType)
    ? "민간건설·민간매입임대는 2018.3.31. 이전에 임대사업자 등록과 사업자등록을 모두 한 주택만 합산배제됩니다(시행령 §3①1호·2호 단서 · 3.31.이 토요일이라 4.2.까지)."
    : "과세기준일(6월 1일) 현재 세무서에 사업자등록을 한 주택만 합산배제됩니다. 6월 2일~9월 30일에 등록했다면 과세기준일에 등록한 것으로 봅니다(시행령 §3① 각 호 외의 부분). 2026.2.27. 전에 신고·결정을 마친 연도는 주택임대업 업종이어야 했습니다.";
}

/** ⑧ 빈칸 차단 문구 */
export function businessRegistrationRequiredMessage(registrationType: string, label: string): string {
  return asksBusinessRegistrationDate(registrationType)
    ? `${label}: 민간건설·민간매입임대는 세무서 사업자등록일을 입력하세요 — 2018.3.31. 이전 사업자등록등 주택만 합산배제됩니다 (종합부동산세법 시행령 §3①1호·2호 단서).`
    : `${label}: 세무서 사업자등록일을 입력하세요 — 과세기준일(그해 9.30.까지 등록하면 과세기준일로 봄) 현재 사업자등록을 한 임대주택만 합산배제됩니다 (종합부동산세법 시행령 §3①).`;
}
