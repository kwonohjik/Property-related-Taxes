/**
 * anchor — 종부령 §3①8호 나목 1)~4)·7호 단서 「제외되는 주택」.
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-8ho-na.plan.md §4 (테스트 이름의 1-1 등은 매트릭스 행 번호).
 *
 * 실측(2026-11-13 probe, 변경 전): P1~P4 네 사안 모두 isExcluded true(법문상 false).
 * BASE는 네 목 모두 「해당 없음」이 확정된 사실로 채웠다 — 행마다 한 사실만 바꿔 그 분기를 연다.
 */
import { describe, it, expect } from "vitest";
import { validateRentalExclusion } from "@/lib/tax-engine/comprehensive-exclusion";
import { excludedUnder8hoNa } from "@/lib/tax-engine/comprehensive-exclusion-8ho-na";
import { COMPREHENSIVE_EXCL as E } from "@/lib/tax-engine/legal-codes";
import type { RentalExclusionInput } from "@/lib/tax-engine/types/comprehensive.types";

const d = (s: string) => new Date(s);
const BASE: RentalExclusionInput = {
  registrationType: "private_purchase_long",
  rentalRegistrationDate: d("2019-03-01"),
  businessRegistrationDate: d("2019-03-01"),
  rentalStartDate: d("2019-04-01"),
  assessedValue: 300_000_000,
  area: 84,
  location: "metro",
  currentRent: 1_000_000,
  isInitialContract: true,
  assessmentDate: d("2025-06-01"),
  ownerType: "individual",
  acquisitionDate: d("2019-02-01"),
  householdOwnedHouseAtAcquisition: false,
  regulatedAtAssessment: false,
  rentalApplicationDate: d("2019-02-20"),
  businessRegistrationApplicationDate: d("2019-02-20"),
  isApartment: false,
  convertedFromShortTerm: false,
};
const reasons = (over: Partial<RentalExclusionInput>) => excludedUnder8hoNa({ ...BASE, ...over });
/** 1) 해당 조건을 모두 갖춘 사안 — 행마다 한 사실만 풀어 본다 */
const NA1_HIT: Partial<RentalExclusionInput> = {
  householdOwnedHouseAtAcquisition: true,
  regulatedAtAssessment: true,
  regulatedNoticeDate: d("2017-08-03"),
};

describe("BASE — 네 목 모두 해당 없음", () => {
  it("BASE는 사유 0건 · 합산배제 성립", () => {
    expect(reasons({})).toEqual([]);
    expect(validateRentalExclusion(BASE).isExcluded).toBe(true);
  });
});

describe("나목1) 조정대상지역 신규취득 — 개인·장기일반", () => {
  it("1-8 ★ 1주택 보유 세대·과세기준일 현재 조정·공고 후 취득 → 해당(P1 반전)", () => {
    expect(reasons(NA1_HIT)).toEqual([E.EXCLUDED_8NA1_REGULATED_NEW_ACQ]);
    expect(validateRentalExclusion({ ...BASE, ...NA1_HIT }).isExcluded).toBe(false);
  });
  it("1-1 2018 과세기준일(제29243호 시행 전)에는 보지 않는다", () => {
    expect(reasons({ ...NA1_HIT, assessmentDate: d("2018-06-01") })).toEqual([]);
  });
  it("1-2 법인은 1)을 적용받지 않는다(사전-2020-법령해석재산-0390)", () => {
    expect(reasons({ ...NA1_HIT, ownerType: "corporate" })).not.toContain(E.EXCLUDED_8NA1_REGULATED_NEW_ACQ);
  });
  it("1-3 2018-09-13 취득은 종전 규정 · 9-14는 해당", () => {
    expect(reasons({ ...NA1_HIT, acquisitionDate: d("2018-09-13") })).toEqual([]);
    expect(reasons({ ...NA1_HIT, acquisitionDate: d("2018-09-14") })).toEqual([E.EXCLUDED_8NA1_REGULATED_NEW_ACQ]);
  });
  it("1-3 취득이 늦어도 계약금 지급이 2018-09-13 이전이면 종전 규정", () => {
    expect(reasons({ ...NA1_HIT, depositPaidDate: d("2018-09-10") })).toEqual([]);
  });
  it("1-4 상속 등 합산 취득 — 2021 이후는 해당 없음 · 2019·2020은 문언대로 해당 + 확인 필요(V-4)", () => {
    expect(reasons({ ...NA1_HIT, acquiredViaMergedPeriod: true })).toEqual([]);
    expect(reasons({ ...NA1_HIT, acquiredViaMergedPeriod: true, assessmentDate: d("2020-06-01") })).toEqual([
      E.EXCLUDED_8NA1_MERGED_PRE_2020_CHECK,
    ]);
  });
  it("1-5 취득 당시 무주택 세대 → 해당 없음(서면-2020-부동산-0864)", () => {
    expect(reasons({ ...NA1_HIT, householdOwnedHouseAtAcquisition: false })).toEqual([]);
  });
  it("1-6 과세기준일 현재 조정대상지역 아님(해제) → 해당 없음(서면-2022-부동산-5052)", () => {
    expect(reasons({ ...NA1_HIT, regulatedAtAssessment: false })).toEqual([]);
  });
  it("1-7 공고일 당일까지 취득 → 괄호 예외 · 다음 날은 해당", () => {
    expect(reasons({ ...NA1_HIT, regulatedNoticeDate: d("2019-02-01") })).toEqual([]);
    expect(reasons({ ...NA1_HIT, regulatedNoticeDate: d("2019-01-31") })).toEqual([E.EXCLUDED_8NA1_REGULATED_NEW_ACQ]);
  });
  it("1-9 ★ 보유 주택·조정 여부·공고일·취득일 모름 → 해당 + 확인 필요", () => {
    for (const over of [
      { householdOwnedHouseAtAcquisition: null },
      { regulatedAtAssessment: undefined },
      { regulatedNoticeDate: undefined },
      { acquisitionDate: undefined },
    ] satisfies Partial<RentalExclusionInput>[]) {
      expect(reasons({ ...NA1_HIT, ...over })).toEqual([E.EXCLUDED_8NA1_UNKNOWN]);
    }
  });
  it("공공지원 매입은 1) 대상 아님(장기일반만)", () => {
    expect(reasons({ ...NA1_HIT, registrationType: "public_support_purchase" })).toEqual([]);
  });
});

describe("나목2) 법인 조정대상지역 등록 신청 — 법인·장기일반", () => {
  const CORP: Partial<RentalExclusionInput> = {
    ownerType: "corporate",
    regulatedAtAssessment: true,
    regulatedNoticeDate: d("2017-08-03"),
    rentalRegistrationDate: d("2021-03-10"),
    rentalApplicationDate: d("2021-03-01"),
    businessRegistrationDate: d("2021-03-10"),
    businessRegistrationApplicationDate: d("2021-03-01"),
  };
  it("2-4 ★ 이미 공고된 지역에서 2020.6.17. 뒤 신청 → 해당(P2 반전)", () => {
    expect(reasons(CORP)).toEqual([E.EXCLUDED_8NA2_CORP_REGULATED_APP]);
    expect(validateRentalExclusion({ ...BASE, ...CORP }).isExcluded).toBe(false);
  });
  it("2-3 경계 — 이미 공고된 지역은 2020-06-17 신청까지 해당 없음 · 06-18은 해당", () => {
    const at = (s: string) => ({ ...CORP, rentalApplicationDate: d(s), businessRegistrationApplicationDate: d(s) });
    expect(reasons(at("2020-06-17"))).toEqual([]);
    expect(reasons(at("2020-06-18"))).toEqual([E.EXCLUDED_8NA2_CORP_REGULATED_APP]);
  });
  it("2-3 2020.8.7. 뒤 공고된 지역(재지정 포함)은 그 공고일이 기준(서면-2025-부동산-3811)", () => {
    expect(reasons({ ...CORP, regulatedNoticeDate: d("2025-10-16") })).toEqual([]);
  });
  it("2-4 두 신청 중 하나만 뒤여도 해당(V-3)", () => {
    expect(reasons({ ...CORP, rentalApplicationDate: d("2020-01-01"), rentalRegistrationDate: d("2020-01-10") })).toEqual([
      E.EXCLUDED_8NA2_CORP_REGULATED_APP,
    ]);
  });
  it("2-1 개인·2020 과세기준일은 보지 않는다", () => {
    expect(reasons({ ...CORP, ownerType: "individual" })).not.toContain(E.EXCLUDED_8NA2_CORP_REGULATED_APP);
    expect(reasons({ ...CORP, assessmentDate: d("2020-06-01") })).toEqual([]);
  });
  it("2-2 과세기준일 현재 조정대상지역 아님 → 해당 없음(서면-2022-부동산-4613)", () => {
    expect(reasons({ ...CORP, regulatedAtAssessment: false })).toEqual([]);
  });
  it("두 등록이 2020.6.17. 이전에 끝났으면 신청일·조정 여부를 몰라도 해당 없음", () => {
    expect(
      reasons({
        ...CORP,
        rentalRegistrationDate: d("2019-01-10"),
        businessRegistrationDate: d("2019-01-10"),
        rentalApplicationDate: undefined,
        businessRegistrationApplicationDate: undefined,
        regulatedAtAssessment: undefined,
      }),
    ).toEqual([]);
  });
  it("2-5 ★ 신청일·조정 여부 모름 → 해당 + 확인 필요", () => {
    // 지자체 신청은 공고 전으로 확정 · 세무서는 등록이 공고 뒤인데 신청일 모름 → 모름(하나라도 「뒤」로 확정되면 2-4)
    expect(
      reasons({
        ...CORP,
        rentalApplicationDate: d("2020-01-01"),
        rentalRegistrationDate: d("2020-01-10"),
        businessRegistrationApplicationDate: undefined,
      }),
    ).toEqual([E.EXCLUDED_8NA2_UNKNOWN]);
    expect(reasons({ ...CORP, regulatedAtAssessment: null })).toEqual([E.EXCLUDED_8NA2_UNKNOWN]);
  });
});

describe("나목3) 2020.7.11. 이후 등록 신청 아파트 — 장기일반 매입", () => {
  const APT: Partial<RentalExclusionInput> = {
    isApartment: true,
    rentalApplicationDate: d("2020-07-20"),
    rentalRegistrationDate: d("2020-07-30"),
  };
  it("3-5 ★ 아파트·2020-07-20 신청 → 해당(P3 반전)", () => {
    expect(reasons(APT)).toEqual([E.EXCLUDED_8NA3_APARTMENT_AFTER_0711]);
  });
  it("3-4 신청 2020-07-10이면 등록이 7.11. 뒤여도 해당 없음(서면-2020-부동산-3530) · 07-11은 해당", () => {
    expect(reasons({ ...APT, rentalApplicationDate: d("2020-07-10") })).toEqual([]);
    expect(reasons({ ...APT, rentalApplicationDate: d("2020-07-11") })).toEqual([E.EXCLUDED_8NA3_APARTMENT_AFTER_0711]);
  });
  it("3-3 등록일이 2020-07-11 전이면 신청일을 몰라도 해당 없음", () => {
    expect(reasons({ ...APT, rentalRegistrationDate: d("2020-07-10"), rentalApplicationDate: undefined })).toEqual([]);
  });
  it("3-2 아파트 아님(도시형 생활주택 포함) → 해당 없음", () => {
    expect(reasons({ ...APT, isApartment: false })).toEqual([]);
  });
  it("3-1 2020 과세기준일(제31085호 시행 전)에는 보지 않는다", () => {
    expect(reasons({ ...APT, assessmentDate: d("2020-06-01") })).toEqual([]);
  });
  it("3-6 ★ 아파트 여부·신청일 모름 → 해당 + 확인 필요", () => {
    expect(reasons({ ...APT, isApartment: null })).toEqual([E.EXCLUDED_8NA3_UNKNOWN]);
    expect(reasons({ ...APT, rentalApplicationDate: undefined })).toEqual([E.EXCLUDED_8NA3_UNKNOWN]);
  });
});

describe("나목4)·7호 단서 — 2020.7.11. 이후 단기 → 장기·공공지원 변경신고", () => {
  for (const t of ["private_purchase_long", "public_support_purchase", "public_support_construction"] as const) {
    it(`4-4 ★ ${t}: 2020-07-20 변경신고 → 해당(P4 반전)`, () => {
      const over = { registrationType: t, convertedFromShortTerm: true, shortTermConversionDate: d("2020-07-20") };
      expect(reasons(over)).toEqual([E.EXCLUDED_SHORT_TO_LONG_AFTER_0711]);
      expect(validateRentalExclusion({ ...BASE, ...over }).isExcluded).toBe(false);
    });
  }
  it("4-3 변경신고 2020-07-10 → 해당 없음 · 07-11은 해당", () => {
    expect(reasons({ convertedFromShortTerm: true, shortTermConversionDate: d("2020-07-10") })).toEqual([]);
    expect(reasons({ convertedFromShortTerm: true, shortTermConversionDate: d("2020-07-11") })).toEqual([
      E.EXCLUDED_SHORT_TO_LONG_AFTER_0711,
    ]);
  });
  it("4-1 2020 과세기준일에는 보지 않는다", () => {
    expect(reasons({ convertedFromShortTerm: true, shortTermConversionDate: d("2020-07-20"), assessmentDate: d("2020-06-01") })).toEqual([]);
  });
  it("4-4 ★ 변경신고 여부 모름·날짜 모름 → 해당 + 확인 필요", () => {
    expect(reasons({ convertedFromShortTerm: undefined })).toEqual([E.EXCLUDED_SHORT_TO_LONG_UNKNOWN]);
    expect(reasons({ convertedFromShortTerm: true })).toEqual([E.EXCLUDED_SHORT_TO_LONG_UNKNOWN]);
  });
  it("8호·7호 밖 유형(공공매입·단기 6년 매입)은 보지 않는다", () => {
    for (const t of ["public_purchase", "private_short_term_6y_purchase"] as const) {
      expect(reasons({ registrationType: t, convertedFromShortTerm: undefined })).toEqual([]);
    }
  });
});
