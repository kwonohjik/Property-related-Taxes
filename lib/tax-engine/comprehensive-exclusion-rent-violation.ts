/**
 * 종부령 §3⑧ 5% 위반 뒤 2개 과세연도 제외(T-07b).
 * - 원문: 「같은 항 제1호다목, 같은 항 제2호다목, 같은 항 제7호다목, 같은 항 제8호가목3), 같은 항 제10호다목 및 같은 항 제11호가목3)의
 *   요건을 충족하지 않게 된 때에는 해당 과세연도를 포함하여 연속하는 2개 과세연도까지는 합산배제 임대주택에서 제외한다」
 * - 부칙<대통령령 제30404호> 제4조 「이 영 시행 이후 위반하는 분부터 적용한다」(2020.2.11.) — 그 전 위반은 보지 않는다.
 * - 위반 계약일 v의 연도 Y에 대해 Y ≤ 과세연도 ≤ Y+1이면 불성립. v가 그해 6.1. 뒤면 문언대로 그해도 제외 + 확인 필요(Q-8 a · V-2).
 * - 9호는 열거에 없다(`rentIncreaseLimitApplies`와 다른 집합 · V-6). 그해 6.1. 계약이 이미 5% 초과(`RENT_INCREASE_EXCEEDED`)면 붙이지 않는다(엔진 본체).
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-input-gaps-4.plan.md §3.3
 */
import { COMPREHENSIVE_EXCL } from "./legal-codes";
import type { RentalExclusionInput } from "./types/comprehensive.types";

/** §3⑧ 열거 호 — 1·2·7·8·10·11호 */
const RENT_VIOLATION_TYPES: ReadonlySet<string> = new Set([
  "private_construction",
  "public_construction",
  "private_purchase_short",
  "public_purchase",
  "public_support_construction",
  "private_purchase_long",
  "public_support_purchase",
  "private_short_term_6y_construction",
  "private_short_term_6y_purchase",
]);
const RULE_EFFECTIVE = Date.UTC(2020, 1, 11);

/** 이 유형에 §3⑧을 보는가 — 화면 칸 표시(⑤④⑧)와 같은 집합 */
export function rentViolationApplies(registrationType: string): boolean {
  return RENT_VIOLATION_TYPES.has(registrationType);
}

export function rentViolationIssue(input: RentalExclusionInput): string | null {
  if (!rentViolationApplies(input.registrationType)) return null;
  const v = input.rentViolationDate;
  if (!v || Number.isNaN(v.getTime()) || v.getTime() < RULE_EFFECTIVE) return null;
  const year = v.getUTCFullYear();
  const t = input.assessmentDate.getUTCFullYear();
  if (t < year || t > year + 1) return null;
  return t === year && v.getTime() > input.assessmentDate.getTime()
    ? COMPREHENSIVE_EXCL.RENT_VIOLATION_SAME_YEAR_AFTER_ASSESSMENT
    : COMPREHENSIVE_EXCL.RENT_VIOLATION_TWO_YEARS;
}
