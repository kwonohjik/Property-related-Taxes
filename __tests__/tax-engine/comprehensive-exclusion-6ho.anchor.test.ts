/**
 * anchor — 종부령 §3①6호 미분양매입임대주택 + 가목 단서 1)~3) · 3호·6호 임대료 요건 없음(Q-7).
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-6ho-unsold-purchase.plan.md §4 (테스트 이름의 6-1 등은 매트릭스 행 번호).
 *
 * 실측(2026-11-13 probe, 변경 전): 6호 유형 없음 — 2호로 넣은 2019 단기 등록 미분양 주택은 2018.3.31. 상한으로 불성립(P2) ·
 * 3호 임대료 10% 증액은 불성립(법문상 요건 없음).
 * BASE는 6호 요건을 모두 갖춘 2025 과세연도 사실 — 행마다 한 사실만 바꿔 그 분기를 연다.
 */
import { describe, it, expect } from "vitest";
import { validateRentalExclusion } from "@/lib/tax-engine/comprehensive-exclusion";
import { unsoldPurchase6hoIssues } from "@/lib/tax-engine/comprehensive-exclusion-6ho";
import { COMPREHENSIVE_EXCL as E } from "@/lib/tax-engine/legal-codes";
import type { RentalExclusionInput } from "@/lib/tax-engine/types/comprehensive.types";

const d = (s: string) => new Date(s);
const BASE: RentalExclusionInput = {
  registrationType: "unsold_purchase",
  rentalRegistrationDate: d("2019-05-01"), // 2호였다면 2018.3.31. 상한으로 불성립(P2)
  businessRegistrationDate: d("2019-05-01"),
  rentalStartDate: d("2019-06-01"),
  assessedValue: 250_000_000,
  area: 84,
  location: "non_metro",
  currentRent: 1_000_000,
  isInitialContract: true,
  assessmentDate: d("2025-06-01"),
  unsoldContractDate: d("2009-03-02"),
  isUnsoldFirstComeSupply: true,
  unsoldDocsSubmitted: true,
  unsoldUnitCount: 5,
  purchaseRental2hoCount: 0,
  existingRental3hoSameRegionCount: 0,
  reitRental5hoCount: 0,
  rentalRegistrationKind: "short_term",
  rentalApplicationDate: d("2019-04-20"),
};
const issues = (over: Partial<RentalExclusionInput>) => unsoldPurchase6hoIssues({ ...BASE, ...over });
const verdict = (over: Partial<RentalExclusionInput>) => validateRentalExclusion({ ...BASE, ...over });

describe("BASE — 6호 요건 모두 충족", () => {
  it("★ P2 반전: 2019 단기 등록 미분양 주택 → 6호로 성립(2호 단서 2018.3.31. 미적용 — Q-5 a)", () => {
    expect(issues({})).toEqual([]);
    const r = verdict({});
    expect(r.isExcluded).toBe(true);
    expect(r.reason).toBe(E.UNSOLD_PURCHASE_RENTAL);
  });
  it("대조: 같은 사실을 2호로 넣으면 2018.3.31. 상한으로 불성립", () => {
    expect(verdict({ registrationType: "private_purchase_short" }).failReasons).toContain(E.REGISTERED_AFTER_2018_03_31);
  });
});

describe("6-1 미분양주택 · 계약 기간", () => {
  it("계약일 2008-06-11·2009-06-30은 포함 · 2008-06-10·2009-07-01은 불성립", () => {
    expect(issues({ unsoldContractDate: d("2008-06-11") })).toEqual([]);
    expect(issues({ unsoldContractDate: d("2009-06-30") })).toEqual([]);
    expect(issues({ unsoldContractDate: d("2008-06-10") })).toEqual([E.UNSOLD_6HO_NOT_UNSOLD]);
    expect(issues({ unsoldContractDate: d("2009-07-01") })).toEqual([E.UNSOLD_6HO_NOT_UNSOLD]);
  });
  it("선착순 공급 미분양 아님 → 불성립 · 모름 → 불성립 + 확인 필요", () => {
    expect(issues({ isUnsoldFirstComeSupply: false })).toEqual([E.UNSOLD_6HO_NOT_UNSOLD]);
    expect(issues({ isUnsoldFirstComeSupply: null })).toEqual([E.UNSOLD_6HO_UNSOLD_UNKNOWN]);
    expect(issues({ unsoldContractDate: undefined })).toEqual([E.UNSOLD_6HO_UNSOLD_UNKNOWN]);
  });
});

describe("6-2~6-5 면적·가격·수도권", () => {
  it("149㎡ 성립 · 150㎡ 불성립", () => {
    expect(verdict({ area: 149 }).isExcluded).toBe(true);
    expect(verdict({ area: 150 }).failReasons).toContain(E.AREA_EXCEEDED_149);
  });
  it("3억 성립 · 3억 1원 불성립", () => {
    expect(verdict({ assessedValue: 300_000_000 }).isExcluded).toBe(true);
    expect(verdict({ assessedValue: 300_000_001 }).failReasons).toContain(E.PRICE_EXCEEDED);
  });
  it("수도권 안 → 불성립(다목)", () => {
    expect(issues({ location: "metro" })).toEqual([E.UNSOLD_6HO_METRO]);
  });
  it("말소 → 불성립(나목 5년 계속 임대)", () => {
    expect(verdict({ registrationRevokedDate: d("2024-01-01") }).failReasons).toContain(E.MANDATORY_PERIOD_NOT_MET);
  });
});

describe("6-6 후단 — 5호 이상(유형별 합산 · V-5)", () => {
  const zero = { purchaseRental2hoCount: 0, existingRental3hoSameRegionCount: 0, reitRental5hoCount: 0 };
  it("미분양 4호 단독 → 5호 미만 불성립", () => {
    expect(issues({ ...zero, unsoldUnitCount: 4 })).toEqual([E.UNSOLD_6HO_UNITS_UNDER_5]);
  });
  it("2호 매입임대 5호 이상이면 합산 → 성립 · 4호면 합산 안 됨", () => {
    expect(issues({ ...zero, unsoldUnitCount: 1, purchaseRental2hoCount: 5 })).toEqual([]);
    expect(issues({ ...zero, unsoldUnitCount: 1, purchaseRental2hoCount: 4 })).toEqual([E.UNSOLD_6HO_UNITS_UNDER_5]);
  });
  it("3호(같은 시·도) 2호 이상이면 합산 — 미분양 3 + 3호 2 = 5 성립 · 미분양 2 + 3호 2 = 4 불성립", () => {
    expect(issues({ ...zero, unsoldUnitCount: 3, existingRental3hoSameRegionCount: 2 })).toEqual([]);
    expect(issues({ ...zero, unsoldUnitCount: 2, existingRental3hoSameRegionCount: 2 })).toEqual([E.UNSOLD_6HO_UNITS_UNDER_5]);
  });
  it("5호 임대주택 5호 이상이면 합산 → 성립", () => {
    expect(issues({ ...zero, unsoldUnitCount: 1, reitRental5hoCount: 5 })).toEqual([]);
  });
  it("유형을 섞어 더하지 않는다 — 2호 4 + 5호 4 + 미분양 1 → 불성립", () => {
    expect(issues({ ...zero, unsoldUnitCount: 1, purchaseRental2hoCount: 4, reitRental5hoCount: 4 })).toEqual([
      E.UNSOLD_6HO_UNITS_UNDER_5,
    ]);
  });
  it("미분양 호수 모름 → 확인 필요 · 4호에 다른 칸이 비면 확인 필요", () => {
    expect(issues({ unsoldUnitCount: undefined })).toEqual([E.UNSOLD_6HO_UNITS_UNKNOWN]);
    expect(issues({ unsoldUnitCount: 4, purchaseRental2hoCount: undefined })).toEqual([E.UNSOLD_6HO_UNITS_UNKNOWN]);
  });
});

describe("6-7 라목 — 확인서·계약서 사본 제출", () => {
  it("미제출 → 불성립 · 모름 → 확인 필요", () => {
    expect(issues({ unsoldDocsSubmitted: false })).toEqual([E.UNSOLD_6HO_DOCS_NOT_SUBMITTED]);
    expect(issues({ unsoldDocsSubmitted: undefined })).toEqual([E.UNSOLD_6HO_DOCS_UNKNOWN]);
  });
});

describe("6-8~6-10 가목 단서 1)~3) (제31085호 · 2021 과세기준일부터)", () => {
  it("1) ★ 단기 등록 신청 2020-07-11 → 해당 · 07-10 → 해당 없음", () => {
    expect(issues({ rentalApplicationDate: d("2020-07-11"), rentalRegistrationDate: d("2020-07-20") })).toEqual([
      E.UNSOLD_6HO_GA1_SHORT_AFTER_0711,
    ]);
    expect(issues({ rentalApplicationDate: d("2020-07-10"), rentalRegistrationDate: d("2020-07-20") })).toEqual([]);
  });
  it("1) 신청일을 몰라도 등록일이 7.11. 전이면 해당 없음 · 뒤면 확인 필요", () => {
    expect(issues({ rentalApplicationDate: undefined })).toEqual([]);
    expect(issues({ rentalApplicationDate: undefined, rentalRegistrationDate: d("2020-08-01") })).toEqual([
      E.UNSOLD_6HO_GA_UNKNOWN,
    ]);
  });
  it("2) ★ 장기일반 2020-08 신청 아파트 → 해당 · 아파트 아님 → 해당 없음 · 아파트 모름 → 확인 필요", () => {
    const lt = {
      rentalRegistrationKind: "long_term_general" as const,
      rentalApplicationDate: d("2020-08-01"),
      rentalRegistrationDate: d("2020-08-10"),
      convertedFromShortTerm: false,
    };
    expect(issues({ ...lt, isApartment: true })).toEqual([E.UNSOLD_6HO_GA2_APT_AFTER_0711]);
    expect(issues({ ...lt, isApartment: false })).toEqual([]);
    expect(issues({ ...lt, isApartment: undefined })).toEqual([E.UNSOLD_6HO_GA_UNKNOWN]);
  });
  it("3) ★ 단기 → 장기일반·공공지원 변경신고 2020-07-11 → 해당 · 07-10 → 해당 없음 · 모름 → 확인 필요", () => {
    const conv = (kind: "long_term_general" | "public_support", date: string) => ({
      rentalRegistrationKind: kind,
      isApartment: false,
      convertedFromShortTerm: true,
      shortTermConversionDate: d(date),
    });
    expect(issues(conv("long_term_general", "2020-07-11"))).toEqual([E.UNSOLD_6HO_GA3_CONVERTED_AFTER_0711]);
    expect(issues(conv("public_support", "2021-01-05"))).toEqual([E.UNSOLD_6HO_GA3_CONVERTED_AFTER_0711]);
    expect(issues(conv("public_support", "2020-07-10"))).toEqual([]);
    expect(issues({ rentalRegistrationKind: "public_support", convertedFromShortTerm: null })).toEqual([E.UNSOLD_6HO_GA_UNKNOWN]);
  });
  it("그 밖(구 임대주택법 등) → 단서 해당 없음 · 등록 종류 모름 → 확인 필요", () => {
    expect(issues({ rentalRegistrationKind: "other", rentalApplicationDate: d("2021-01-01") })).toEqual([]);
    expect(issues({ rentalRegistrationKind: undefined })).toEqual([E.UNSOLD_6HO_GA_UNKNOWN]);
  });
  it("2020 과세기준일(제31085호 시행 전)에는 단서를 보지 않는다", () => {
    expect(
      issues({ assessmentDate: d("2020-06-01"), rentalApplicationDate: d("2020-07-11"), rentalRegistrationKind: undefined }),
    ).toEqual([]);
  });
});

describe("6-11·Q-7 — 임대료 요건이 없는 호(3호·6호)", () => {
  const raise = { isInitialContract: false, previousRent: 1_000_000, currentRent: 1_100_000 };
  it("6호 임대료 10% 증액 → 성립", () => {
    expect(verdict(raise).isExcluded).toBe(true);
  });
  it("★ 3호 임대료 10% 증액 → 성립(변경 전 불성립)", () => {
    const r = validateRentalExclusion({
      ...BASE,
      ...raise,
      registrationType: "existing_rental",
      rentalRegistrationDate: d("2004-01-01"),
      rentalStartDate: d("2004-02-01"),
      area: 80,
    });
    expect(r.failReasons ?? []).not.toContain(E.RENT_INCREASE_EXCEEDED);
    expect(r.isExcluded).toBe(true);
  });
  it("대조: 2호는 임대료 10% 증액 → 불성립 유지", () => {
    expect(
      validateRentalExclusion({ ...BASE, ...raise, registrationType: "private_purchase_short", rentalRegistrationDate: d("2017-01-01"), businessRegistrationDate: d("2017-01-01") })
        .failReasons,
    ).toContain(E.RENT_INCREASE_EXCEEDED);
  });
});
