/**
 * 종부령 §3①8호 나목 1)~4)·7호 단서 — 「합산배제 임대주택에서 제외되는 주택」 판정.
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-8ho-na.plan.md (§4 매트릭스 행 번호를 주석에 단다).
 *
 * 적용 시점(부칙 — 「이 영 시행 이후 납세의무가 성립하는 분부터」):
 *   1) 대통령령 제29243호(2018.10.23.) · 2) 제30921호(2020.8.7.) · 3)·4)·7호 단서 제31085호(2020.10.7.)
 * 「모름」(값 없음)은 해당으로 보고 확인 필요 사유를 단다(혜택 불성립).
 */
import { COMPREHENSIVE_EXCL } from "./legal-codes";
import type { RentalExclusionInput } from "./types/comprehensive.types";

const ERA_NA1 = Date.UTC(2018, 9, 23);
const ERA_NA2 = Date.UTC(2020, 7, 7);
const ERA_NA34 = Date.UTC(2020, 9, 7);
/** 부칙<제29243호> §2② — 2018.9.13. 이전 취득·계약금 지급분은 종전 규정 */
const NA1_GRANDFATHER_LAST_DAY = Date.UTC(2018, 8, 13);
/** 나목2) 괄호 — 「이미 공고된 조정대상지역의 경우 2020년 6월 17일」 */
const NA2_ALREADY_NOTICED_BASE = Date.UTC(2020, 5, 17);
const JULY_11_2020 = Date.UTC(2020, 6, 11);

type RegType = RentalExclusionInput["registrationType"];
const NA4_TYPES: ReadonlySet<RegType> = new Set([
  "private_purchase_long",
  "public_support_purchase",
  "public_support_construction", // 7호 단서
]);

function ms(d: Date | null | undefined): number | null {
  return d && !Number.isNaN(d.getTime()) ? d.getTime() : null;
}

/** 나목1) 조정대상지역 신규취득 — 개인 · 장기일반(매입)만 */
function na1(input: RentalExclusionInput, asmt: number): string | null {
  if (input.registrationType !== "private_purchase_long") return null;
  if (asmt < ERA_NA1) return null; // 1-1
  if (input.ownerType === "corporate") return null; // 1-2 (사전-2020-법령해석재산-0390)
  const known = [ms(input.acquisitionDate), ms(input.depositPaidDate)].filter((v): v is number => v !== null);
  const earliest = known.length > 0 ? Math.min(...known) : null;
  if (earliest !== null && earliest <= NA1_GRANDFATHER_LAST_DAY) return null; // 1-3
  let mergedBeforeBracket = false;
  if (input.acquiredViaMergedPeriod) {
    if (asmt >= ERA_NA2) return null; // 1-4
    mergedBeforeBracket = true; // V-4 — 2019·2020 귀속 문언에는 괄호가 없다
  }
  const owned = input.householdOwnedHouseAtAcquisition;
  if (owned === false) return null; // 1-5 (서면-2020-부동산-0864)
  const regulated = input.regulatedAtAssessment;
  if (regulated === false) return null; // 1-6 (서면-2022-부동산-5052)
  const notice = ms(input.regulatedNoticeDate);
  if (earliest !== null && notice !== null && earliest <= notice) return null; // 1-7 (V-2 — 3811 유추)
  if (owned == null || regulated == null || earliest === null || notice === null) {
    return COMPREHENSIVE_EXCL.EXCLUDED_8NA1_UNKNOWN; // 1-9
  }
  return mergedBeforeBracket
    ? COMPREHENSIVE_EXCL.EXCLUDED_8NA1_MERGED_PRE_2020_CHECK
    : COMPREHENSIVE_EXCL.EXCLUDED_8NA1_REGULATED_NEW_ACQ; // 1-8
}

type AppStatus = "before" | "after" | "unknown";

/** 신청일이 있으면 그것으로, 없으면 등록(완료)일이 기준일 이하일 때만 「전」으로 확정한다(신청일 ≤ 등록일). */
function appStatus(application: number | null, registered: number | null, threshold: number): AppStatus {
  if (application !== null) return application > threshold ? "after" : "before";
  if (registered !== null && registered <= threshold) return "before";
  return "unknown";
}

/** 나목2) 법인 조정대상지역 등록 신청 — 법인 · 장기일반(매입)만 */
function na2(input: RentalExclusionInput, asmt: number): string | null {
  if (input.registrationType !== "private_purchase_long") return null;
  if (asmt < ERA_NA2 || input.ownerType !== "corporate") return null; // 2-1
  const rentalApp = ms(input.rentalApplicationDate);
  const rentalReg = ms(input.rentalRegistrationDate);
  const bizApp = ms(input.businessRegistrationApplicationDate);
  const bizReg = ms(input.businessRegistrationDate);
  // 기준일은 2020.6.17. 이상이다 — 두 신청이 그 전이면 조정대상지역을 몰라도 해당 없음.
  if (
    appStatus(rentalApp, rentalReg, NA2_ALREADY_NOTICED_BASE) === "before" &&
    appStatus(bizApp, bizReg, NA2_ALREADY_NOTICED_BASE) === "before"
  ) {
    return null;
  }
  if (input.regulatedAtAssessment === false) return null; // 2-2 (서면-2022-부동산-4613)
  const notice = ms(input.regulatedNoticeDate);
  if (input.regulatedAtAssessment == null || notice === null) return COMPREHENSIVE_EXCL.EXCLUDED_8NA2_UNKNOWN; // 2-5
  // 2-3: 과세기준일 현재 유효한 공고(서면-2025-부동산-3811) — 시행(2020.8.7.) 전에 공고된 지역은 2020.6.17.
  const threshold = notice < ERA_NA2 ? NA2_ALREADY_NOTICED_BASE : notice;
  const statuses = [appStatus(rentalApp, rentalReg, threshold), appStatus(bizApp, bizReg, threshold)];
  if (statuses.includes("after")) return COMPREHENSIVE_EXCL.EXCLUDED_8NA2_CORP_REGULATED_APP; // 2-4 (V-3)
  if (statuses.includes("unknown")) return COMPREHENSIVE_EXCL.EXCLUDED_8NA2_UNKNOWN; // 2-5
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

/** 걸리는 「제외되는 주택」 사유를 모두 돌려준다(없으면 빈 배열). */
export function excludedUnder8hoNa(input: RentalExclusionInput): string[] {
  const asmt = input.assessmentDate.getTime();
  return [na1(input, asmt), na2(input, asmt), na3(input, asmt), na4(input, asmt)].filter(
    (r): r is string => r !== null,
  );
}
