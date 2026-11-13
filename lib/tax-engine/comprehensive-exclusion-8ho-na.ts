/**
 * 종부령 §3①8호 나목 1)~4)·7호 단서·11호 나목 1)·2) — 「합산배제 임대주택에서 제외되는 주택」 판정.
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-8ho-na.plan.md · comprehensive-rental-excl-11ho-na.plan.md
 * (§4 매트릭스 행 번호를 주석에 단다).
 *
 * 적용 시점(부칙 — 「이 영 시행 이후 납세의무가 성립하는 분부터」):
 *   8호 1) 대통령령 제29243호(2018.10.23.) · 2) 제30921호(2020.8.7.) · 3)·4)·7호 단서 제31085호(2020.10.7.)
 *   11호 제35352호(2025.6.4.) — 2026 과세기준일부터, 2025는 부칙 제3조 특례(시행 시점은 comprehensive-exclusion.ts)
 * 「모름」(값 없음)은 해당으로 보고 확인 필요 사유를 단다(혜택 불성립).
 */
import { COMPREHENSIVE_EXCL } from "./legal-codes";
import type { RentalExclusionInput } from "./types/comprehensive.types";

const ERA_NA1 = Date.UTC(2018, 9, 23);
const ERA_NA2 = Date.UTC(2020, 7, 7);
const ERA_NA34 = Date.UTC(2020, 9, 7);
/** 부칙<제29243호> §2② — 2018.9.13. 이전 취득·계약금 지급분은 종전 규정 / 11호 나목1) 괄호의 「이미 공고된」 기준일 */
const SEPT_13_2018 = Date.UTC(2018, 8, 13);
/** 8호·11호 나목2) 괄호 — 「이미 공고된 조정대상지역의 경우 2020년 6월 17일」 */
const JUNE_17_2020 = Date.UTC(2020, 5, 17);
const JULY_11_2020 = Date.UTC(2020, 6, 11);
/** 11호 첫 적용 과세기준일(2025.6.1. — 부칙<제35352호> 제3조 특례) */
const ERA_11 = Date.UTC(2025, 5, 1);
/** 11호 시행일(부칙<제35352호> 제1조 단서) — 「이미 공고된」을 이 날 기준으로 읽는다(계획서 Q-3 a · V-2) */
const IN_FORCE_11 = Date.UTC(2025, 5, 4);

type RegType = RentalExclusionInput["registrationType"];
const NA4_TYPES: ReadonlySet<RegType> = new Set([
  "private_purchase_long",
  "public_support_purchase",
  "public_support_construction", // 7호 단서
]);

/** 나목 1)·2)의 호별 차이 — 대상 유형·적용 시점·「이미 공고된」 판단 시점과 기준일·사유 코드 */
interface NaSpec {
  type: RegType;
  era1: number;
  era2: number;
  /** 1) 공고일이 이 날 전이면 기준일 = SEPT_13_2018. 8호는 괄호가 없어 max(공고일, 부칙 2018.9.13.)과 같아지도록 9.14. */
  noticedBefore1: number;
  /** 2) 공고일이 이 날 전이면 기준일 = JUNE_17_2020 */
  noticedBefore2: number;
  /** 1) 합산 취득 괄호가 생긴 시점(8호는 2020.8.7. 개정 · 11호는 처음부터) */
  mergedBracketFrom: number;
  codes: { na1: string; na1Unknown: string; na1MergedPre: string; na2: string; na2Unknown: string };
}

const NA_8: NaSpec = {
  type: "private_purchase_long",
  era1: ERA_NA1,
  era2: ERA_NA2,
  noticedBefore1: Date.UTC(2018, 8, 14),
  noticedBefore2: ERA_NA2,
  mergedBracketFrom: ERA_NA2,
  codes: {
    na1: COMPREHENSIVE_EXCL.EXCLUDED_8NA1_REGULATED_NEW_ACQ,
    na1Unknown: COMPREHENSIVE_EXCL.EXCLUDED_8NA1_UNKNOWN,
    na1MergedPre: COMPREHENSIVE_EXCL.EXCLUDED_8NA1_MERGED_PRE_2020_CHECK,
    na2: COMPREHENSIVE_EXCL.EXCLUDED_8NA2_CORP_REGULATED_APP,
    na2Unknown: COMPREHENSIVE_EXCL.EXCLUDED_8NA2_UNKNOWN,
  },
};

const NA_11: NaSpec = {
  type: "private_short_term_6y_purchase",
  era1: ERA_11,
  era2: ERA_11,
  noticedBefore1: IN_FORCE_11,
  noticedBefore2: IN_FORCE_11,
  mergedBracketFrom: ERA_11,
  codes: {
    na1: COMPREHENSIVE_EXCL.EXCLUDED_11NA1_REGULATED_NEW_ACQ,
    na1Unknown: COMPREHENSIVE_EXCL.EXCLUDED_11NA1_UNKNOWN,
    na1MergedPre: COMPREHENSIVE_EXCL.EXCLUDED_11NA1_REGULATED_NEW_ACQ, // 도달 불가(괄호가 처음부터 있다)
    na2: COMPREHENSIVE_EXCL.EXCLUDED_11NA2_CORP_REGULATED_APP,
    na2Unknown: COMPREHENSIVE_EXCL.EXCLUDED_11NA2_UNKNOWN,
  },
};

function ms(d: Date | null | undefined): number | null {
  return d && !Number.isNaN(d.getTime()) ? d.getTime() : null;
}

/** 나목1) 조정대상지역 신규취득 — 개인 */
function na1(input: RentalExclusionInput, asmt: number, s: NaSpec): string | null {
  if (input.registrationType !== s.type) return null;
  if (asmt < s.era1) return null; // 1-1
  if (input.ownerType === "corporate") return null; // 1-2 (사전-2020-법령해석재산-0390)
  const known = [ms(input.acquisitionDate), ms(input.depositPaidDate)].filter((v): v is number => v !== null);
  const earliest = known.length > 0 ? Math.min(...known) : null;
  // 기준일은 2018.9.13. 이상이다 — 그 전 취득·계약은 조정대상지역을 몰라도 해당 없음
  if (earliest !== null && earliest <= SEPT_13_2018) return null; // 1-3
  let mergedBeforeBracket = false;
  if (input.acquiredViaMergedPeriod) {
    if (asmt >= s.mergedBracketFrom) return null; // 1-4
    mergedBeforeBracket = true; // V-4 — 8호 2019·2020 귀속 문언에는 괄호가 없다
  }
  const owned = input.householdOwnedHouseAtAcquisition;
  if (owned === false) return null; // 1-5 (서면-2020-부동산-0864)
  const regulated = input.regulatedAtAssessment;
  if (regulated === false) return null; // 1-6 (서면-2022-부동산-5052)
  const notice = ms(input.regulatedNoticeDate);
  const threshold = notice === null ? null : notice < s.noticedBefore1 ? SEPT_13_2018 : notice;
  if (earliest !== null && threshold !== null && earliest <= threshold) return null; // 1-7 (V-2 — 3811 유추)
  if (owned == null || regulated == null || earliest === null || notice === null) {
    return s.codes.na1Unknown; // 1-9
  }
  return mergedBeforeBracket ? s.codes.na1MergedPre : s.codes.na1; // 1-8
}

type AppStatus = "before" | "after" | "unknown";

/** 신청일이 있으면 그것으로, 없으면 등록(완료)일이 기준일 이하일 때만 「전」으로 확정한다(신청일 ≤ 등록일). */
function appStatus(application: number | null, registered: number | null, threshold: number): AppStatus {
  if (application !== null) return application > threshold ? "after" : "before";
  if (registered !== null && registered <= threshold) return "before";
  return "unknown";
}

/** 나목2) 법인 조정대상지역 등록 신청 */
function na2(input: RentalExclusionInput, asmt: number, s: NaSpec): string | null {
  if (input.registrationType !== s.type) return null;
  if (asmt < s.era2 || input.ownerType !== "corporate") return null; // 2-1
  const rentalApp = ms(input.rentalApplicationDate);
  const rentalReg = ms(input.rentalRegistrationDate);
  const bizApp = ms(input.businessRegistrationApplicationDate);
  const bizReg = ms(input.businessRegistrationDate);
  // 기준일은 2020.6.17. 이상이다 — 두 신청이 그 전이면 조정대상지역을 몰라도 해당 없음.
  if (
    appStatus(rentalApp, rentalReg, JUNE_17_2020) === "before" &&
    appStatus(bizApp, bizReg, JUNE_17_2020) === "before"
  ) {
    return null;
  }
  if (input.regulatedAtAssessment === false) return null; // 2-2 (서면-2022-부동산-4613)
  const notice = ms(input.regulatedNoticeDate);
  if (input.regulatedAtAssessment == null || notice === null) return s.codes.na2Unknown; // 2-5
  // 2-3: 과세기준일 현재 유효한 공고(서면-2025-부동산-3811) — 그 호 시행 전에 공고된 지역은 2020.6.17.
  const threshold = notice < s.noticedBefore2 ? JUNE_17_2020 : notice;
  const statuses = [appStatus(rentalApp, rentalReg, threshold), appStatus(bizApp, bizReg, threshold)];
  if (statuses.includes("after")) return s.codes.na2; // 2-4 (V-3)
  if (statuses.includes("unknown")) return s.codes.na2Unknown; // 2-5
  return null;
}

/** 나목3) 2020.7.11. 이후 등록 신청 아파트 — 장기일반(매입)만 */
function na3(input: RentalExclusionInput, asmt: number): string | null {
  if (input.registrationType !== "private_purchase_long") return null;
  if (asmt < ERA_NA34) return null; // 3-1
  const registered = ms(input.rentalRegistrationDate);
  if (registered !== null && registered < JULY_11_2020) return null; // 3-3
  const application = ms(input.rentalApplicationDate);
  if (application !== null && application < JULY_11_2020) return null; // 3-4 (서면-2020-부동산-3530)
  if (input.isApartment === false) return null; // 3-2 (도시형 생활주택 — 서면-2023-부동산-2061)
  if (input.isApartment == null || application === null) return COMPREHENSIVE_EXCL.EXCLUDED_8NA3_UNKNOWN; // 3-6
  return COMPREHENSIVE_EXCL.EXCLUDED_8NA3_APARTMENT_AFTER_0711; // 3-5 (V-5)
}

/** 나목4)·7호 단서 — 2020.7.11. 이후 단기 → 장기일반·공공지원 변경신고 */
function na4(input: RentalExclusionInput, asmt: number): string | null {
  if (!NA4_TYPES.has(input.registrationType)) return null;
  if (asmt < ERA_NA34) return null; // 4-1
  if (input.convertedFromShortTerm === false) return null; // 4-2
  const changed = ms(input.shortTermConversionDate);
  if (changed !== null && changed < JULY_11_2020) return null; // 4-3
  if (input.convertedFromShortTerm === true && changed !== null) {
    return COMPREHENSIVE_EXCL.EXCLUDED_SHORT_TO_LONG_AFTER_0711; // 4-4
  }
  return COMPREHENSIVE_EXCL.EXCLUDED_SHORT_TO_LONG_UNKNOWN; // 4-4 모름
}

/** 걸리는 「제외되는 주택」 사유를 모두 돌려준다(없으면 빈 배열). 8호 나목·7호 단서·11호 나목. */
export function excludedUnder8hoNa(input: RentalExclusionInput): string[] {
  const asmt = input.assessmentDate.getTime();
  return [
    na1(input, asmt, NA_8),
    na2(input, asmt, NA_8),
    na3(input, asmt),
    na4(input, asmt),
    na1(input, asmt, NA_11),
    na2(input, asmt, NA_11),
  ].filter((r): r is string => r !== null);
}
