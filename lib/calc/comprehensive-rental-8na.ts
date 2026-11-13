/**
 * 종부령 §3①8호 나목 1)~4)·7호 단서·11호 나목 1)·2)·10·11호 2025년도 특례(부칙<제35352호> 제3조 아파트)
 * — 화면이 「무엇을 묻는가」의 단일 소스.
 * ⑤ 칸 표시(RentalExclusion8NaFields) · ⑧ 차단(validate8NaInputs) · ④ 전송(rental8NaApiFields)이 모두 `na8Asks`를 쓴다.
 * 판정 자체는 엔진 `lib/tax-engine/comprehensive-exclusion-8ho-na.ts` — 여기의 날짜 경계는 그 파일과 같아야 한다.
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-8ho-na.plan.md · comprehensive-rental-excl-11ho-na.plan.md
 */
import type { ComprehensiveFormData, PropertyEntry } from "@/lib/stores/comprehensive-wizard-store";
import { governingDesignationStart, isRegulatedByBjdCode } from "@/lib/tax-engine/data/regulated-areas";
import { PRE_DESIGNATION_CONTRACT_EXCLUSION } from "@/lib/tax-engine/legal-codes/transfer-house";

const ERA_NA1 = "2018-10-23"; // 대통령령 제29243호
const ERA_NA2 = "2020-08-07"; // 제30921호
const ERA_NA34 = "2020-10-07"; // 제31085호
const NA1_GRANDFATHER_LAST_DAY = "2018-09-13";
const NA2_ALREADY_NOTICED_BASE = "2020-06-17";
const JULY_11_2020 = "2020-07-11";
const NA4_TYPES = new Set(["private_purchase_long", "public_support_purchase", "public_support_construction"]);
/** 11호 첫 적용 과세기준일(부칙<제35352호> 제3조) · 전면 적용(제2조②) */
const ERA_11 = "2025-06-01";
const FULL_11 = "2026-06-01";
const SHORT_11 = "private_short_term_6y_purchase";
const SHORT_TYPES = new Set([SHORT_11, "private_short_term_6y_construction"]);

/** 10·11호(단기민간임대주택 6년) 여부 — ⑤ 카드 제목·⑧ 문구가 쓴다 */
export const isShortTerm6y = (registrationType: string) => SHORT_TYPES.has(registrationType);

export interface Na8Context {
  registrationType: string;
  taxpayerType: "individual" | "corporate";
  /** 과세기준일 YYYY-06-01 */
  assessmentDate: string;
}

/** 폼 단위 문맥 — 과세연도는 ④ `assessmentYear` 변환과 같은 규칙(숫자 아니면 올해). */
export function na8Context(
  formData: Pick<ComprehensiveFormData, "assessmentYear" | "taxpayerType">,
  registrationType: string,
): Na8Context {
  const year = parseInt(formData.assessmentYear) || new Date().getFullYear();
  return {
    registrationType,
    taxpayerType: (formData.taxpayerType ?? "individual") === "corporate" ? "corporate" : "individual",
    assessmentDate: `${year}-06-01`,
  };
}

export interface Na8Asks {
  acquisitionDate: boolean;
  householdOwned: boolean;
  regulated: boolean;
  rentalApplicationDate: boolean;
  businessRegistrationApplicationDate: boolean;
  isApartment: boolean;
  convertedFromShortTerm: boolean;
  shortTermConversionDate: boolean;
}

const v = (s: string | undefined) => s ?? "";
const atOrBefore = (s: string | undefined, limit: string) => v(s) !== "" && v(s) <= limit;

/** 이 주택에서 물어야 하는 칸. 앞 칸 답에 따라 뒤 칸이 열린다(엔진의 판정 순서와 같다). */
export function na8Asks(p: PropertyEntry, ctx: Na8Context): Na8Asks {
  const isLong = ctx.registrationType === "private_purchase_long";
  const is11 = ctx.registrationType === SHORT_11;
  const asmt = ctx.assessmentDate;

  // 1) 개인 — 취득일(또는 계약금 지급일)이 2018.9.13. 뒤일 때만 보유 주택·조정 여부를 묻는다(8호·11호 같은 경계)
  const na1 = ctx.taxpayerType === "individual" && ((isLong && asmt >= ERA_NA1) || (is11 && asmt >= ERA_11));
  const earliest = [v(p.rentalAcquisitionDate), v(p.rentalDepositPaidDate)].filter((d) => d !== "").sort()[0] ?? "";
  const na1Open =
    na1 && earliest > NA1_GRANDFATHER_LAST_DAY && !(p.rentalMergedAcquisition === true && asmt >= ERA_NA2);
  const householdOwned = na1Open;
  const na1Regulated = na1Open && p.householdOwnedAtAcquisition === "yes";

  // 2) 법인 — 두 신청이 2020.6.17. 이전으로 확정되면 조정 여부를 묻지 않는다
  const na2 = ctx.taxpayerType === "corporate" && ((isLong && asmt >= ERA_NA2) || (is11 && asmt >= ERA_11));
  const rentalAppBefore =
    atOrBefore(p.rentalApplicationDate, NA2_ALREADY_NOTICED_BASE) ||
    atOrBefore(p.rentalRegistrationDate, NA2_ALREADY_NOTICED_BASE);
  const na2RentalApp = na2 && !atOrBefore(p.rentalRegistrationDate, NA2_ALREADY_NOTICED_BASE);
  const na2Regulated =
    na2 && !(rentalAppBefore && atOrBefore(p.businessRegistrationApplicationDate, NA2_ALREADY_NOTICED_BASE));

  // 3) 등록일이 2020.7.11. 이후일 때만 아파트 여부 → 아파트면 신청일
  const na3 = isLong && asmt >= ERA_NA34 && v(p.rentalRegistrationDate) >= JULY_11_2020;
  const na3App = na3 && p.isApartment === "yes";

  // 10·11호 2025년도 특례 — 아파트(도시형 생활주택 아닌 것)는 적용 안 됨(부칙<제35352호> 제3조)
  const short2025 = SHORT_TYPES.has(ctx.registrationType) && asmt >= ERA_11 && asmt < FULL_11;

  // 4)·7호 단서
  const na4 = NA4_TYPES.has(ctx.registrationType) && asmt >= ERA_NA34;

  return {
    acquisitionDate: na1,
    householdOwned,
    regulated: na1Regulated || na2Regulated,
    rentalApplicationDate: na2RentalApp || na3App,
    businessRegistrationApplicationDate: na2,
    isApartment: na3 || short2025,
    convertedFromShortTerm: na4,
    shortTermConversionDate: na4 && p.convertedFromShortTerm === "yes",
  };
}

export interface Regulated8Na {
  /** true/false = 확정 · null = 판정 불가(수동 입력 필요) */
  regulated: boolean | null;
  /** 과세기준일 현재 유효한 지정의 공고일(regulated true일 때) */
  noticeDate: string;
  /** 화면 안내 문구 */
  basis: string;
}

/**
 * 과세기준일 현재 조정대상지역 여부·그 지정의 공고일.
 * auto: PNU 앞 10자리 법정동코드 → 지정 구간 시작일(`governingDesignationStart` — 재지정은 과세기준일에 유효한 구간,
 *   서면-2025-부동산-3811) → 공고일(`PRE_DESIGNATION_CONTRACT_EXCLUSION.ANNOUNCEMENT_DATES` — 고시 원문 대조표).
 *   동 일부 지구만 지정된 곳(districtOnly)은 지구 안·밖을 코드로 정할 수 없어 수동.
 */
export function resolveRegulated8Na(p: PropertyEntry, assessmentDate: string): Regulated8Na {
  if (p.regulated8NaMode === "manual") {
    const r = p.regulatedAtAssessment;
    return {
      regulated: r === "yes" ? true : r === "no" ? false : null,
      noticeDate: r === "yes" ? v(p.regulatedNoticeDate) : "",
      basis: "직접 입력",
    };
  }
  const code = v(p.pnu).slice(0, 10);
  if (code.length < 10) {
    return { regulated: null, noticeDate: "", basis: "주소(지번)가 없어 자동 판정할 수 없습니다 — 직접 입력하세요" };
  }
  const j = isRegulatedByBjdCode(code, assessmentDate);
  if (j.districtOnly) {
    return { regulated: null, noticeDate: "", basis: `${j.districtOnly.district} 지구 안인지 코드로 정할 수 없습니다 — 직접 입력하세요` };
  }
  if (!j.isRegulated) return { regulated: false, noticeDate: "", basis: `${assessmentDate} 기준 조정대상지역 아님` };
  const start = governingDesignationStart(code, assessmentDate) ?? "";
  // 대조표에 없는 시작일(하위 규칙 경계)은 시작일을 그대로 쓴다 — 대조표의 모든 2018.9.14. 이후 지정은 공고일=효력일
  const noticeDate = PRE_DESIGNATION_CONTRACT_EXCLUSION.ANNOUNCEMENT_DATES[start] ?? start;
  return { regulated: true, noticeDate, basis: `${assessmentDate} 기준 조정대상지역 · 공고일 ${noticeDate}` };
}

const tri = (s: "" | "yes" | "no" | undefined): boolean | null => (s === "yes" ? true : s === "no" ? false : null);

/** ④ — 묻는 칸만 보낸다(안 묻는 칸은 엔진이 판정 단계에 닿지 않는다). */
/** 7호 나목·8호 가목2) 의무임대기간 8/10년(부칙<제31085호> §3·§4) — 엔진 `mandatoryPeriod`와 같은 유형·경계 */
const LONG_PERIOD_TYPES = new Set(["private_purchase_long", "public_support_purchase", "public_support_construction"]);
const AUG_18_2020 = "2020-08-18";

/**
 * 의무임대기간 판단용 등록 신청일(선택) 칸 — 7·8호이고 등록일이 2020.8.18. 이후인데 8호 나목 칸이 신청일을 묻지 않을 때.
 * 경고 문구에만 쓰므로 ⑧에서 막지 않는다(계획서 Q-1 a). 비면 엔진이 10년 + 「8.17. 이전 신청이면 8년」 안내.
 */
export function asksPeriodApplicationDate(p: PropertyEntry, ctx: Na8Context): boolean {
  if (!LONG_PERIOD_TYPES.has(ctx.registrationType)) return false;
  if (v(p.rentalRegistrationDate) === "" || v(p.rentalRegistrationDate) < AUG_18_2020) return false;
  return !na8Asks(p, ctx).rentalApplicationDate;
}

export function rental8NaApiFields(p: PropertyEntry, ctx: Na8Context) {
  const a = na8Asks(p, ctx);
  const reg = a.regulated ? resolveRegulated8Na(p, ctx.assessmentDate) : null;
  return {
    acquisitionDate: a.acquisitionDate ? v(p.rentalAcquisitionDate) || undefined : undefined,
    depositPaidDate: a.acquisitionDate ? v(p.rentalDepositPaidDate) || undefined : undefined,
    acquiredViaMergedPeriod: a.acquisitionDate ? p.rentalMergedAcquisition === true : undefined,
    householdOwnedHouseAtAcquisition: a.householdOwned ? tri(p.householdOwnedAtAcquisition) : undefined,
    regulatedAtAssessment: reg ? reg.regulated : undefined,
    regulatedNoticeDate: reg?.regulated ? reg.noticeDate || undefined : undefined,
    rentalApplicationDate:
      a.rentalApplicationDate || asksPeriodApplicationDate(p, ctx) ? v(p.rentalApplicationDate) || undefined : undefined,
    businessRegistrationApplicationDate: a.businessRegistrationApplicationDate
      ? v(p.businessRegistrationApplicationDate) || undefined
      : undefined,
    isApartment: a.isApartment ? tri(p.isApartment) : undefined,
    convertedFromShortTerm: a.convertedFromShortTerm ? tri(p.convertedFromShortTerm) : undefined,
    shortTermConversionDate: a.shortTermConversionDate ? v(p.shortTermConversionDate) || undefined : undefined,
  };
}

/** ⑧ — 보이는 칸이 비면 차단(Q-4 b). 반환: 첫 오류 문구 또는 null. */
export function validate8NaInputs(p: PropertyEntry, ctx: Na8Context, label: string): string | null {
  const a = na8Asks(p, ctx);
  const short = isShortTerm6y(ctx.registrationType);
  const BASIS = `(종합부동산세법 시행령 §3①${short ? "11" : "8"}호 나목`;
  if (a.acquisitionDate && !v(p.rentalAcquisitionDate)) return `${label}: 임대주택 취득일을 입력하세요 ${BASIS}1)).`;
  if (a.householdOwned && !p.householdOwnedAtAcquisition) {
    return `${label}: 취득 당시 세대가 다른 주택을 보유했는지 고르세요 ${BASIS}1)).`;
  }
  if (a.regulated) {
    const r = resolveRegulated8Na(p, ctx.assessmentDate);
    if (r.regulated === null) return `${label}: 과세기준일 현재 조정대상지역 여부를 입력하세요 — ${r.basis} ${BASIS}1)·2)).`;
    if (r.regulated && !r.noticeDate) return `${label}: 조정대상지역 지정 공고일을 입력하세요 ${BASIS}1)·2)).`;
  }
  if (a.businessRegistrationApplicationDate && !v(p.businessRegistrationApplicationDate)) {
    return `${label}: 법인은 세무서 사업자등록(업종 추가 정정) 신청일을 입력하세요 ${BASIS}2)).`;
  }
  if (a.isApartment && !p.isApartment) {
    return short
      ? `${label}: 아파트인지 고르세요 (종합부동산세법 시행령 부칙<대통령령 제35352호> 제3조).`
      : `${label}: 아파트인지 고르세요 ${BASIS}3)).`;
  }
  if (a.rentalApplicationDate && !v(p.rentalApplicationDate)) {
    return `${label}: 지자체 임대사업자 등록 신청일을 입력하세요 ${BASIS}${short ? "2))" : "2)·3))"}.`;
  }
  if (a.convertedFromShortTerm && !p.convertedFromShortTerm) {
    return `${label}: 단기민간임대에서 변경신고한 주택인지 고르세요 (종합부동산세법 시행령 §3①7호 단서·8호 나목4)).`;
  }
  if (a.shortTermConversionDate && !v(p.shortTermConversionDate)) {
    return `${label}: 단기 → 장기·공공지원 변경신고일을 입력하세요 (종합부동산세법 시행령 §3①7호 단서·8호 나목4)).`;
  }
  return null;
}
