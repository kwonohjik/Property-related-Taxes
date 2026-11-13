/**
 * anchor — 종부령 §3①11호 나목 1)·2) 「제외되는 주택」 + 10·11호 시행 시점(부칙<대통령령 제35352호>).
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-11ho-na.plan.md §4 (테스트 이름의 1-1 등은 매트릭스 행 번호).
 *
 * 실측(2026-11-13 probe, 변경 전): Q1~Q4 네 사안 모두 isExcluded true(법문상 false).
 * BASE는 1)·2) 모두 「해당 없음」이 확정된 2026 과세연도 사실 — 행마다 한 사실만 바꿔 그 분기를 연다.
 */
import { describe, it, expect } from "vitest";
import { validateRentalExclusion } from "@/lib/tax-engine/comprehensive-exclusion";
import { excludedUnder8hoNa } from "@/lib/tax-engine/comprehensive-exclusion-8ho-na";
import { COMPREHENSIVE_EXCL as E } from "@/lib/tax-engine/legal-codes";
import type { RentalExclusionInput } from "@/lib/tax-engine/types/comprehensive.types";

const d = (s: string) => new Date(s);
const BASE: RentalExclusionInput = {
  qualifyingUnitCount: 2, // §3①1·3·7·10호 「2호 이상」 충족 — 그 게이트는 two-plus-units anchor
  registrationType: "private_short_term_6y_purchase",
  rentalRegistrationDate: d("2025-07-01"),
  businessRegistrationDate: d("2025-07-01"),
  rentalStartDate: d("2024-03-01"), // 2025 과세기준일 현재 임대 중(부칙 §3 「임대하고 있는 자」)
  assessedValue: 300_000_000,
  area: 59,
  location: "metro",
  currentRent: 1_000_000,
  isInitialContract: true,
  assessmentDate: d("2026-06-01"),
  ownerType: "individual",
  acquisitionDate: d("2021-03-01"),
  householdOwnedHouseAtAcquisition: false,
  regulatedAtAssessment: false,
  rentalApplicationDate: d("2025-06-20"),
  businessRegistrationApplicationDate: d("2025-06-20"),
  isApartment: false,
  convertedFromShortTerm: false,
};
const reasons = (over: Partial<RentalExclusionInput>) => excludedUnder8hoNa({ ...BASE, ...over });
const verdict = (over: Partial<RentalExclusionInput>) => validateRentalExclusion({ ...BASE, ...over });
/** 1) 해당 조건을 모두 갖춘 사안 — 강남(2017.8.3. 공고 · 11호 시행 전 공고 → 기준일 2018.9.13.) */
const NA1_HIT: Partial<RentalExclusionInput> = {
  householdOwnedHouseAtAcquisition: true,
  regulatedAtAssessment: true,
  regulatedNoticeDate: d("2017-08-03"),
};
const CORP: Partial<RentalExclusionInput> = { ownerType: "corporate", regulatedAtAssessment: true, regulatedNoticeDate: d("2017-08-03") };

describe("BASE — 1)·2) 해당 없음", () => {
  it("BASE는 사유 0건 · 합산배제 성립", () => {
    expect(reasons({})).toEqual([]);
    expect(verdict({}).isExcluded).toBe(true);
  });
});

describe("11호 나목1) 조정대상지역 신규취득 — 개인", () => {
  it("1-5 ★ Q1 반전: 1주택 보유 세대·강남·2021 취득 → 해당", () => {
    expect(reasons(NA1_HIT)).toEqual([E.EXCLUDED_11NA1_REGULATED_NEW_ACQ]);
    expect(verdict(NA1_HIT).isExcluded).toBe(false);
  });
  it("1-1 법인은 1)을 보지 않는다", () => {
    expect(reasons({ ...NA1_HIT, ownerType: "corporate" })).not.toContain(E.EXCLUDED_11NA1_REGULATED_NEW_ACQ);
  });
  it("1-1 8호 규칙은 11호에 걸리지 않는다(사유 코드가 11호)", () => {
    expect(reasons(NA1_HIT)).not.toContain(E.EXCLUDED_8NA1_REGULATED_NEW_ACQ);
  });
  it("1-2 상속·재개발 등 합산 취득은 해당 없음(괄호가 처음부터 있다)", () => {
    expect(reasons({ ...NA1_HIT, acquiredViaMergedPeriod: true })).toEqual([]);
  });
  it("1-3 취득 당시 무주택 세대 · 과세기준일 현재 조정 아님 → 해당 없음", () => {
    expect(reasons({ ...NA1_HIT, householdOwnedHouseAtAcquisition: false })).toEqual([]);
    expect(reasons({ ...NA1_HIT, regulatedAtAssessment: false })).toEqual([]);
  });
  it("1-4 이미 공고된 지역 — 2018-09-13 이전 취득·계약금은 괄호로 제외 · 9-14는 해당", () => {
    expect(reasons({ ...NA1_HIT, acquisitionDate: d("2018-09-13") })).toEqual([]);
    expect(reasons({ ...NA1_HIT, acquisitionDate: d("2019-01-01"), depositPaidDate: d("2018-09-10") })).toEqual([]);
    expect(reasons({ ...NA1_HIT, acquisitionDate: d("2018-09-14") })).toEqual([E.EXCLUDED_11NA1_REGULATED_NEW_ACQ]);
  });
  it("1-4 Q-3 a: 11호 시행(2025.6.4.) 전 공고면 2018.9.13. 기준 — 공고(2019-06) 전 2019-01 취득도 해당(8호는 공고일 기준이라 해당 없음)", () => {
    const mid = { ...NA1_HIT, regulatedNoticeDate: d("2019-06-01"), acquisitionDate: d("2019-01-01") };
    expect(reasons(mid)).toEqual([E.EXCLUDED_11NA1_REGULATED_NEW_ACQ]);
    expect(reasons({ ...mid, registrationType: "private_purchase_long" })).toEqual([]);
  });
  it("1-4 11호 시행 뒤 공고(2025.10.16. 재지정)는 그 공고일 기준", () => {
    const re = { ...NA1_HIT, regulatedNoticeDate: d("2025-10-16") };
    expect(reasons({ ...re, acquisitionDate: d("2025-10-16") })).toEqual([]);
    expect(reasons({ ...re, acquisitionDate: d("2025-10-17") })).toEqual([E.EXCLUDED_11NA1_REGULATED_NEW_ACQ]);
  });
  it("1-6 모름(보유 주택·조정 여부·공고일·취득일) → 해당 + 확인 필요", () => {
    expect(reasons({ ...NA1_HIT, householdOwnedHouseAtAcquisition: null })).toEqual([E.EXCLUDED_11NA1_UNKNOWN]);
    expect(reasons({ ...NA1_HIT, regulatedAtAssessment: undefined })).toEqual([E.EXCLUDED_11NA1_UNKNOWN]);
    expect(reasons({ ...NA1_HIT, regulatedNoticeDate: undefined })).toEqual([E.EXCLUDED_11NA1_UNKNOWN]);
    expect(reasons({ ...NA1_HIT, acquisitionDate: undefined })).toEqual([E.EXCLUDED_11NA1_UNKNOWN]);
  });
});

describe("11호 나목2) 법인 조정대상지역 사업자등록등 신청", () => {
  it("2 ★ Q2 반전: 법인·강남·2025-06-20 신청 → 해당", () => {
    expect(reasons(CORP)).toEqual([E.EXCLUDED_11NA2_CORP_REGULATED_APP]);
    expect(verdict(CORP).isExcluded).toBe(false);
  });
  it("2 개인은 2)를 보지 않는다", () => {
    expect(reasons({ ...CORP, ownerType: "individual", householdOwnedHouseAtAcquisition: false })).toEqual([]);
  });
  it("2 두 신청이 모두 2020-06-17 이전이면 조정 여부를 몰라도 해당 없음", () => {
    const early = { rentalApplicationDate: d("2020-06-17"), businessRegistrationApplicationDate: d("2020-06-10") };
    expect(reasons({ ...CORP, ...early, regulatedAtAssessment: undefined })).toEqual([]);
  });
  it("2 한 신청만 기준일 뒤여도 해당(8호 V-3과 같은 읽기)", () => {
    expect(reasons({ ...CORP, rentalApplicationDate: d("2020-01-01") })).toEqual([E.EXCLUDED_11NA2_CORP_REGULATED_APP]);
  });
  it("2 과세기준일 현재 조정 아님 → 해당 없음", () => {
    expect(reasons({ ...CORP, regulatedAtAssessment: false })).toEqual([]);
  });
  it("2 11호 시행 뒤 공고(2025.10.16.)는 그 공고일 기준 — 그 전 신청은 해당 없음", () => {
    expect(reasons({ ...CORP, regulatedNoticeDate: d("2025-10-16") })).toEqual([]);
    expect(
      reasons({ ...CORP, regulatedNoticeDate: d("2025-10-16"), rentalApplicationDate: d("2025-11-01") }),
    ).toEqual([E.EXCLUDED_11NA2_CORP_REGULATED_APP]);
  });
  it("2 모름(조정 여부·신청일) → 해당 + 확인 필요", () => {
    expect(reasons({ ...CORP, regulatedAtAssessment: null })).toEqual([E.EXCLUDED_11NA2_UNKNOWN]);
    expect(
      reasons({ ...CORP, rentalApplicationDate: undefined, businessRegistrationApplicationDate: undefined }),
    ).toEqual([E.EXCLUDED_11NA2_UNKNOWN]);
  });
});

describe("10·11호 시행 시점 (부칙<대통령령 제35352호>)", () => {
  const Y2025 = { assessmentDate: d("2025-06-01") };
  it("★ Q3·Q4 반전: 2024 과세기준일 — 11호·10호 모두 시행 전 불성립", () => {
    const r11 = verdict({ assessmentDate: d("2024-06-01") });
    expect(r11.isExcluded).toBe(false);
    expect(r11.failReasons).toEqual([E.SHORT_TERM_6Y_NOT_IN_FORCE]);
    const r10 = verdict({ assessmentDate: d("2024-06-01"), registrationType: "private_short_term_6y_construction" });
    expect(r10.isExcluded).toBe(false);
    expect(r10.failReasons).toEqual([E.SHORT_TERM_6Y_NOT_IN_FORCE]);
  });
  it("2024에는 11호 나목도 보지 않는다(시행 전 사유 하나만)", () => {
    expect(verdict({ ...NA1_HIT, assessmentDate: d("2024-06-01") }).failReasons).toEqual([E.SHORT_TERM_6Y_NOT_IN_FORCE]);
  });
  it("2025 부칙 §3 — 2025-09-30까지 등록 + 아파트 아님 → 성립", () => {
    expect(verdict({ ...Y2025, rentalRegistrationDate: d("2025-09-30") }).isExcluded).toBe(true);
  });
  it("2025 — 2025-10-01 등록은 불성립(Q-2 a · 신고기간 연장 확인 필요)", () => {
    const r = verdict({ ...Y2025, rentalRegistrationDate: d("2025-10-01") });
    expect(r.isExcluded).toBe(false);
    expect(r.failReasons).toEqual([E.SHORT_TERM_6Y_2025_REGISTERED_LATE]);
  });
  it("2025 — 아파트는 불성립 · 아파트 여부 모름도 불성립 + 확인 필요", () => {
    expect(verdict({ ...Y2025, isApartment: true }).failReasons).toEqual([E.SHORT_TERM_6Y_2025_APARTMENT]);
    expect(verdict({ ...Y2025, isApartment: null }).failReasons).toEqual([E.SHORT_TERM_6Y_2025_APARTMENT_UNKNOWN]);
    expect(
      verdict({ ...Y2025, isApartment: undefined, registrationType: "private_short_term_6y_construction" }).failReasons,
    ).toEqual([E.SHORT_TERM_6Y_2025_APARTMENT_UNKNOWN]);
  });
  it("2025에도 11호 나목은 본다(부칙 §3이 11호 개정규정을 적용)", () => {
    expect(verdict({ ...Y2025, ...NA1_HIT }).failReasons).toEqual([E.EXCLUDED_11NA1_REGULATED_NEW_ACQ]);
  });
  it("2026부터는 아파트·등록일 특례 조건을 보지 않는다", () => {
    expect(verdict({ isApartment: undefined, rentalRegistrationDate: d("2026-01-10") }).isExcluded).toBe(true);
  });
  it("장기일반(8호)은 시행 시점 판정 대상이 아니다", () => {
    expect(
      verdict({ registrationType: "private_purchase_long", assessmentDate: d("2024-06-01"), rentalRegistrationDate: d("2019-03-01") }).failReasons ?? [],
    ).not.toContain(E.SHORT_TERM_6Y_NOT_IN_FORCE);
  });
});
