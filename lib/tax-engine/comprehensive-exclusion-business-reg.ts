/**
 * 종부령 §3① 각 호 외의 부분 — 사업자등록 기한(보유현황 신고기간 종료일) 판정 · 지자체 등록 기한(PR-1)과 세무서 등록 기한(T-13)이 함께 쓴다.
 * - 본문 「과세기준일 현재 「소득세법」 제168조 또는 「법인세법」 제111조에 따른 사업자등록(…)을 한 자」
 * - 후단 「과세기준일 현재 임대를 개시한 자가 법 제8조제3항에 따른 주택의 보유현황 신고기간 종료일까지 임대사업자로서 사업자등록을 하는
 *   경우에는 해당 연도 과세기준일 현재 임대사업자로서 사업자등록을 한 것으로 본다」 — 세무서 등록은 문언 그대로 의제(경고 없음 · Q-2 a).
 * - 신고기간 종료일 = 그해 9.30.(법 §8③) · 토요일·공휴일이면 다음 날(민법 §161).
 * - 대상: 민간 8유형(Q-1 a). 10·11호는 2025 이하 과세연도를 `shortTerm6yEraIssues`가 따로 보므로 2026 과세기준일부터(이중 보고 방지).
 * 계획서: comprehensive-rental-excl-tax-defects-3.plan.md §2.1 · comprehensive-rental-excl-input-gaps-4.plan.md §3.1
 */
import { isOnOrBeforeDeadline } from "./civil-period";
import { COMPREHENSIVE_EXCL } from "./legal-codes";
import type { RentalExclusionInput } from "./types/comprehensive.types";

type RegType = RentalExclusionInput["registrationType"];

/** §3①10호·11호(단기민간임대주택 6년) — 부칙<대통령령 제35352호> 제2조② 2026 과세기준일부터 전면 적용 */
export const SHORT_TERM_6Y_TYPES: ReadonlySet<RegType> = new Set([
  "private_short_term_6y_construction",
  "private_short_term_6y_purchase",
]);
export const SHORT_TERM_6Y_FULL_ASSESSMENT = Date.UTC(2026, 5, 1);

const FILING_DEADLINE_TYPES: ReadonlySet<string> = new Set([
  "private_construction",
  "private_purchase_short",
  "private_purchase_long",
  "public_support_construction",
  "public_support_purchase",
  "unsold_purchase",
  "private_short_term_6y_construction",
  "private_short_term_6y_purchase",
]);

/** 이 유형·과세기준일에 등록 기한(9.30.)을 보는가 — 엔진 판정과 화면 「세무서 사업자등록일」 칸 표시가 같이 쓴다 */
export function filingDeadlineApplies(registrationType: string, assessmentDate: Date): boolean {
  if (!FILING_DEADLINE_TYPES.has(registrationType)) return false;
  return !(SHORT_TERM_6Y_TYPES.has(registrationType as RegType) && assessmentDate.getTime() < SHORT_TERM_6Y_FULL_ASSESSMENT);
}

/** 그해 보유현황 신고기간 종료일(9.30. — 연장 전 달력일) */
export function filingPeriodEnd(assessmentDate: Date): Date {
  return new Date(Date.UTC(assessmentDate.getUTCFullYear(), 8, 30));
}

/**
 * 세무서 사업자등록 기한(T-13). 비면 「모름」=불성립(Q-3 a — 화면은 ⑧이 막는다).
 * `regCapCovered`: 1·2호 단서(2018.3.31. · `regCap2018Issue`)가 이미 등록일을 본 과세연도 — 4.2. 이전이면 9.30.은 늘 통과하므로 건너뛴다.
 */
export function businessRegistrationIssue(input: RentalExclusionInput, regCapCovered: boolean): string | null {
  if (regCapCovered || !filingDeadlineApplies(input.registrationType, input.assessmentDate)) return null;
  const biz = input.businessRegistrationDate;
  if (!biz || Number.isNaN(biz.getTime())) return COMPREHENSIVE_EXCL.BUSINESS_REGISTRATION_DATE_MISSING;
  return isOnOrBeforeDeadline(biz, filingPeriodEnd(input.assessmentDate))
    ? null
    : COMPREHENSIVE_EXCL.BUSINESS_REGISTERED_AFTER_FILING_DEADLINE;
}
