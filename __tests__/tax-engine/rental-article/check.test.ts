/**
 * 공용 canonical predicate checkRentalArticle 직접 anchor (Phase 2 C2·C3).
 * §155⑳·다주택이 공유하는 목별 판정 — 전 목(가~자·구법)·게이트·failCodes 다중 수집 검증.
 */
import { describe, it, expect } from "vitest";
import {
  checkRentalArticle,
  isApartmentRestrictedForArticle,
  isConstructionArticle,
  type NormalizedRentalUnit,
} from "@/lib/tax-engine/rental-article/check";

const base = (o: Partial<NormalizedRentalUnit> = {}): NormalizedRentalUnit => ({
  businessRegistrationDate: new Date("2019-01-01"),
  rentalRegistrationDate: new Date("2019-01-01"),
  isCapitalArea: true,
  isApartment: false,
  rentalStartOfficialPrice: 300_000_000,
  acquisitionOfficialPrice: 300_000_000,
  rentalYears: 12,
  landAreaM2: undefined,
  totalFloorAreaM2: undefined,
  hasMinimum2Units: false,
  rentIncreaseUnder5Pct: true,
  ...o,
});

describe("checkRentalArticle — 목별 판정 (C2 유지)", () => {
  it("가목 6억 이하·5년 충족 → passed", () => {
    const r = checkRentalArticle("가", base({ rentalStartOfficialPrice: 600_000_000, rentalYears: 5 }));
    expect(r.passed).toBe(true);
    expect(r.requiredYears).toBe(5);
    expect(r.stdPriceCap).toBe(600_000_000);
  });

  it("마목 2020.8.18 등록 → 의무 10년·cap 6억(수도권)", () => {
    const r = checkRentalArticle("마", base({
      businessRegistrationDate: new Date("2020-08-18"),
      rentalRegistrationDate: new Date("2020-08-18"),
      rentalYears: 9,
    }));
    expect(r.requiredYears).toBe(10);
    expect(r.failCodes).toContain("RENTAL_PERIOD_SHORT");
    expect(r.passed).toBe(false);
  });

  it("바목 F5: 2024등록 7억 → 6억 cap 초과 배제 / 2025.3등록 → 9억 통과", () => {
    const pre = checkRentalArticle("바", base({
      businessRegistrationDate: new Date("2024-01-01"), rentalRegistrationDate: new Date("2024-01-01"),
      rentalStartOfficialPrice: 700_000_000, rentalYears: 10, landAreaM2: 200, totalFloorAreaM2: 140,
      hasMinimum2Units: true,
    }));
    expect(pre.failCodes).toContain("STANDARD_PRICE_EXCEEDED");
    const post = checkRentalArticle("바", base({
      businessRegistrationDate: new Date("2025-03-01"), rentalRegistrationDate: new Date("2025-03-01"),
      rentalStartOfficialPrice: 700_000_000, rentalYears: 10, landAreaM2: 200, totalFloorAreaM2: 140,
      hasMinimum2Units: true,
    }));
    expect(post.passed).toBe(true);
  });

  it("아목 4억 초과·918 조정취득(계약금증빙 없음) → 다중 failCodes 수집", () => {
    const r = checkRentalArticle("아", base({
      businessRegistrationDate: new Date("2025-07-01"), rentalRegistrationDate: new Date("2025-07-01"),
      rentalStartOfficialPrice: 500_000_000, rentalYears: 6, isExcluded918Rule: true,
    }));
    expect(r.passed).toBe(false);
    expect(r.failCodes).toEqual(expect.arrayContaining(["STANDARD_PRICE_EXCEEDED", "SHORT_TERM_REGULATED"]));
  });

  it("건설(자목) 면적 미입력 → SIZE_REQUIRED·MIN_UNITS_NOT_MET", () => {
    const r = checkRentalArticle("자", base({
      businessRegistrationDate: new Date("2025-07-01"), rentalRegistrationDate: new Date("2025-07-01"),
      rentalStartOfficialPrice: 300_000_000, rentalYears: 6,
    }));
    expect(r.failCodes).toEqual(expect.arrayContaining(["SIZE_REQUIRED", "MIN_UNITS_NOT_MET"]));
  });

  it("등록 미완비(biz Invalid) → BOTH_REG_REQUIRED", () => {
    expect(checkRentalArticle("가", base({ businessRegistrationDate: new Date("invalid") })).failCodes)
      .toContain("BOTH_REG_REQUIRED");
  });

  it("F6: 바목 아파트 → 제한 아님 / 아목 아파트 → 제한", () => {
    expect(isApartmentRestrictedForArticle("바", new Date("2021-01-01"), true)).toBe(false);
    expect(isApartmentRestrictedForArticle("아", new Date("2025-07-01"), true)).toBe(true);
    expect(isApartmentRestrictedForArticle("마", new Date("2020-08-18"), true)).toBe(true);
    expect(isApartmentRestrictedForArticle("마", new Date("2020-07-10"), true)).toBe(false);
  });

  it("isConstructionArticle — 다·바·자만 true", () => {
    expect(["다", "바", "자"].every((a) => isConstructionArticle(a as never))).toBe(true);
    expect(["가", "마", "아", "구법"].some((a) => isConstructionArticle(a as never))).toBe(false);
  });
});

describe("checkRentalArticle — C3 확장 (나·라·사·아·자 게이트)", () => {
  it("나목: 2003.10.29 이전·국민주택·2호·취득당시 3억 → passed", () => {
    const r = checkRentalArticle("나", base({
      businessRegistrationDate: new Date("2003-01-01"), rentalRegistrationDate: new Date("2003-01-01"),
      acquisitionOfficialPrice: 300_000_000, isNationalSizeHousing: true, hasMinimum2Units: true,
      rentalYears: 5, rentIncreaseUnder5Pct: false, // 나목은 5%룰 미검사
    }));
    expect(r.passed).toBe(true);
    expect(r.stdPriceCap).toBe(300_000_000);
  });

  it("나목: 취득당시 3.1억 → PRICE 배제 / 등록 2004 → REG_DATE_GATE", () => {
    const over = checkRentalArticle("나", base({
      businessRegistrationDate: new Date("2003-01-01"), rentalRegistrationDate: new Date("2003-01-01"),
      acquisitionOfficialPrice: 310_000_000, isNationalSizeHousing: true, hasMinimum2Units: true, rentalYears: 5,
    }));
    expect(over.failCodes).toContain("STANDARD_PRICE_EXCEEDED");
    const late = checkRentalArticle("나", base({
      businessRegistrationDate: new Date("2004-01-01"), rentalRegistrationDate: new Date("2004-01-01"),
      acquisitionOfficialPrice: 300_000_000, isNationalSizeHousing: true, hasMinimum2Units: true, rentalYears: 5,
    }));
    expect(late.failCodes).toContain("REG_DATE_GATE");
  });

  it("나목: 국민주택규모 미충족 → NATIONAL_SIZE_REQUIRED", () => {
    const r = checkRentalArticle("나", base({
      businessRegistrationDate: new Date("2003-01-01"), rentalRegistrationDate: new Date("2003-01-01"),
      acquisitionOfficialPrice: 300_000_000, isNationalSizeHousing: false, hasMinimum2Units: true, rentalYears: 5,
    }));
    expect(r.failCodes).toContain("NATIONAL_SIZE_REQUIRED");
  });

  it("라목: 2008.6.11~2009.6.30·비수도권·취득당시 3억·5호+ → passed / 수도권 → REGION_RESTRICTED", () => {
    const ok = checkRentalArticle("라", base({
      isCapitalArea: false, acquisitionOfficialPrice: 300_000_000, rentalYears: 5,
      firstSaleContractDate: new Date("2009-01-01"), landAreaM2: 200, totalFloorAreaM2: 140,
      hasMinimum5UnitsInCity: true,
    }));
    expect(ok.passed).toBe(true);
    const capital = checkRentalArticle("라", base({
      isCapitalArea: true, acquisitionOfficialPrice: 300_000_000, rentalYears: 5,
      firstSaleContractDate: new Date("2009-01-01"), landAreaM2: 200, totalFloorAreaM2: 140,
      hasMinimum5UnitsInCity: true,
    }));
    expect(capital.failCodes).toContain("REGION_RESTRICTED");
  });

  it("라목: 분양계약일 2010 → REG_DATE_GATE", () => {
    const r = checkRentalArticle("라", base({
      isCapitalArea: false, acquisitionOfficialPrice: 300_000_000, rentalYears: 5,
      firstSaleContractDate: new Date("2010-01-01"), landAreaM2: 200, totalFloorAreaM2: 140,
      hasMinimum5UnitsInCity: true,
    }));
    expect(r.failCodes).toContain("REG_DATE_GATE");
  });

  it("사목: 말소 게이트 + base=마 기준시가 6억 이하·기간 짧아도 → passed (임대기간요건만 면제, Phase4)", () => {
    const r = checkRentalArticle("사", base({
      rentalYears: 0, // 임대기간요건 면제
      saMokBaseArticle: "마", rentalStartOfficialPrice: 500_000_000, // base 마목 기준시가는 검사
      rentalCancellationDate: new Date("2021-01-01"),
      hasHalfDutyPeriodMet: true, isSoldWithin1YearOfCancellation: true,
    }));
    expect(r.passed).toBe(true);
  });

  it("사목: 의무 1/2 미충족 → RENTAL_TERMINATION_RESTRICTED / 말소 2020.1 → 배제", () => {
    const half = checkRentalArticle("사", base({
      rentalCancellationDate: new Date("2021-01-01"), hasHalfDutyPeriodMet: false,
      isSoldWithin1YearOfCancellation: true,
    }));
    expect(half.failCodes).toContain("RENTAL_TERMINATION_RESTRICTED");
    const early = checkRentalArticle("사", base({
      rentalCancellationDate: new Date("2020-01-01"), hasHalfDutyPeriodMet: true,
      isSoldWithin1YearOfCancellation: true,
    }));
    expect(early.passed).toBe(false);
  });

  it("아목: 등록 2025.6.3 → REG_DATE_GATE / 918+계약금증빙 carve-out → 통과", () => {
    const early = checkRentalArticle("아", base({
      businessRegistrationDate: new Date("2025-06-03"), rentalRegistrationDate: new Date("2025-06-03"),
      rentalStartOfficialPrice: 400_000_000, rentalYears: 6,
    }));
    expect(early.failCodes).toContain("REG_DATE_GATE");
    const carve = checkRentalArticle("아", base({
      businessRegistrationDate: new Date("2025-07-01"), rentalRegistrationDate: new Date("2025-07-01"),
      rentalStartOfficialPrice: 400_000_000, rentalYears: 6,
      isExcluded918Rule: true, hasContractDepositProof: true,
    }));
    expect(carve.passed).toBe(true);
    const noProof = checkRentalArticle("아", base({
      businessRegistrationDate: new Date("2025-07-01"), rentalRegistrationDate: new Date("2025-07-01"),
      rentalStartOfficialPrice: 400_000_000, rentalYears: 6, isExcluded918Rule: true,
    }));
    expect(noProof.failCodes).toContain("SHORT_TERM_REGULATED");
  });

  it("마목: 918 hard 배제 / 단기→장기 변경 배제", () => {
    const r918 = checkRentalArticle("마", base({
      businessRegistrationDate: new Date("2021-01-01"), rentalRegistrationDate: new Date("2021-01-01"),
      rentalYears: 10, isExcluded918Rule: true,
    }));
    expect(r918.failCodes).toContain("SHORT_TERM_REGULATED");
    const shortToLong = checkRentalArticle("마", base({
      businessRegistrationDate: new Date("2021-01-01"), rentalRegistrationDate: new Date("2021-01-01"),
      rentalYears: 10, isExcludedShortToLongChange: true,
    }));
    expect(shortToLong.failCodes).toContain("SHORT_TO_LONG_CHANGE");
  });

  it("D-1: split-date 마목 max(biz 2020-09·rent 2020-07) → 10년 요건", () => {
    const r = checkRentalArticle("마", base({
      businessRegistrationDate: new Date("2020-09-01"), rentalRegistrationDate: new Date("2020-07-01"),
      rentalYears: 9,
    }));
    expect(r.requiredYears).toBe(10); // max=2020-09 ≥ 2020-08-18 → 10 (지자체-only였다면 8)
    expect(r.failCodes).toContain("RENTAL_PERIOD_SHORT");
  });

  it("마목 아파트: 2021 등록 아파트 → APARTMENT_RESTRICTED (date-derived)", () => {
    const r = checkRentalArticle("마", base({
      businessRegistrationDate: new Date("2021-01-01"), rentalRegistrationDate: new Date("2021-01-01"),
      isApartment: true, rentalYears: 10,
    }));
    expect(r.failCodes).toContain("APARTMENT_RESTRICTED");
  });
});

describe("checkRentalArticle — 사목 base 목 '해당 목의 다른 요건' (Phase4)", () => {
  const saMok = (o: Partial<NormalizedRentalUnit> = {}): NormalizedRentalUnit => base({
    businessRegistrationDate: new Date("2021-01-01"), rentalRegistrationDate: new Date("2021-01-01"),
    rentalCancellationDate: new Date("2021-06-01"),
    hasHalfDutyPeriodMet: true,
    isSoldWithin1YearOfCancellation: true,
    saMokBaseArticle: "마",
    rentalStartOfficialPrice: 500_000_000, // 마목 6억 이하
    rentalYears: 2, // 짧음 — 사목은 임대기간요건 면제
    rentIncreaseUnder5Pct: true,
    ...o,
  });

  it("base=마 요건 충족 + 말소 게이트 + period 면제 → passed", () => {
    expect(checkRentalArticle("사", saMok()).passed).toBe(true);
  });

  it("base=마 임대개시일 기준시가 7억(>6억) → STANDARD_PRICE_EXCEEDED (period 면제여도 base 요건 미달)", () => {
    const r = checkRentalArticle("사", saMok({ rentalStartOfficialPrice: 700_000_000 }));
    expect(r.passed).toBe(false);
    expect(r.failCodes).toContain("STANDARD_PRICE_EXCEEDED");
  });

  it("base 목 미선택 → SAMOK_BASE_REQUIRED", () => {
    expect(checkRentalArticle("사", saMok({ saMokBaseArticle: undefined })).failCodes)
      .toContain("SAMOK_BASE_REQUIRED");
  });

  it("base=다 면적 초과(300㎡) → SIZE_EXCEEDED", () => {
    const r = checkRentalArticle("사", saMok({
      saMokBaseArticle: "다", rentalStartOfficialPrice: 500_000_000,
      landAreaM2: 300, totalFloorAreaM2: 140, hasMinimum2Units: true,
    }));
    expect(r.failCodes).toContain("SIZE_EXCEEDED");
  });

  it("말소 게이트 미충족(말소 2019) → RENTAL_TERMINATION_RESTRICTED", () => {
    expect(checkRentalArticle("사", saMok({ rentalCancellationDate: new Date("2019-01-01") })).failCodes)
      .toContain("RENTAL_TERMINATION_RESTRICTED");
  });
});
