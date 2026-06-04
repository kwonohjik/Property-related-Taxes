/**
 * 가업상속공제 사후관리 — 정규직 근로자 수·총급여 평균 산정 (§18의2⑤4호)
 *
 * 법령 (KoreanLaw MCP 2026-06-04, §18의2 mst=276123 / §15 mst=283637):
 *   - §18의2⑤4호: "다음 각 목에 **모두** 해당하는 경우"(가 AND 나) — 위반.
 *     가. 5년간 정규직 근로자 수 전체 평균 < 직전 2개 과세기간 평균 × 100분의 90
 *     나. 5년간 총급여액 전체 평균 < 직전 2개 과세기간 평균 × 100분의 90
 *   - §15⑬ 정규직 정의(근로기준법 근로자, 단시간 60시간 미만·1년 미만 계약 제외)
 *   - §15⑰ 평균 = 매월 말일 인원 합 / 월수
 *   - §15⑱ 분할·합병 승계 인원도 가업 정규직 간주(spinoffMerged)
 *
 * ⚠️ 위반 조건은 가 AND 나 (둘 다 90% 미달). "또는(OR)"은 교재 요약의 부정확 표현 — 변경 금지.
 *   (계획서 §3 검증메모 ① / docs/00-pm/inheritance-family-business-gap-supplement.plan.md)
 */

import type { MonthlyEmploymentData } from "../types/inheritance-family-business-postmgmt.types";

/** §⑤4호 90% 기준 비율 */
export const EMPLOYMENT_MAINTAIN_RATIO = 0.9;

/**
 * §15⑰ 평균 — 월 말일 인원 합 / 월수 (§15⑱ 분할·합병 승계 인원 포함).
 * 빈 배열 → 0.
 */
export function calcRegularEmployeeAverage(monthlyData: MonthlyEmploymentData[]): number {
  if (monthlyData.length === 0) return 0;
  const sum = monthlyData.reduce(
    (s, m) => s + m.regularEmployees + (m.spinoffMerged ?? 0),
    0,
  );
  return sum / monthlyData.length;
}

/**
 * §⑤4호 가목 — 5년 평균 정규직 < 직전 2개 평균 × 90% → true(위반 가목 충족).
 * 기준 평균 0이면 미달 불가 → false.
 */
export function isEmploymentDropViolation(
  fiveYearAverage: number,
  priorTwoYearAverage: number,
): boolean {
  if (priorTwoYearAverage <= 0) return false;
  return fiveYearAverage < priorTwoYearAverage * EMPLOYMENT_MAINTAIN_RATIO;
}

/**
 * §⑤4호 나목 — 5년 총급여 < 직전 2년 총급여 × 90% → true(위반 나목 충족).
 * 기준 총급여 0이면 미달 불가 → false.
 */
export function isSalaryDropViolation(
  fiveYearSalary: number,
  priorTwoYearSalary: number,
): boolean {
  if (priorTwoYearSalary <= 0) return false;
  return fiveYearSalary < priorTwoYearSalary * EMPLOYMENT_MAINTAIN_RATIO;
}
