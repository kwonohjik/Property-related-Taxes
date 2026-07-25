/**
 * 장기임대 9유형(가~자목) 매트릭스 — 대표 유형 anchor + 필드 누락 회귀
 *
 * rentalType 설정 시 엔진(isLongTermRentalHousingExempt)이 유형별 정밀검사 수행.
 * 요건 충족 → long_term_rental 배제 / 필수 필드 누락 → 미배제(주택 수 산입) 검증.
 */

import { describe, it, expect } from "vitest";
import { determineMultiHouseSurcharge } from "@/lib/tax-engine/multi-house-surcharge";
import { isLongTermRentalHousingExempt } from "@/lib/tax-engine/multi-house-surcharge-count";
import {
  defaultRules,
  mockRegulatedHistory,
  suspensionNone,
  makeHouse,
  makeInput,
} from "../_helpers/multi-house-mock";

const SELLING = "11680";

/** 양도주택(h1) + 임대주택(h2) 입력 — h2가 배제되면 effectiveHouseCount=1 */
function inputWith(h2Overrides: Parameters<typeof makeHouse>[1], transferDate = new Date("2024-06-01")) {
  const h1 = makeHouse("h1", { regionCode: SELLING });
  const h2 = makeHouse("h2", { isLongTermRental: true, ...h2Overrides });
  return makeInput([h1, h2], { sellingHouseId: "h1", transferDate });
}

function run(input: ReturnType<typeof inputWith>) {
  return determineMultiHouseSurcharge(input, defaultRules, mockRegulatedHistory, suspensionNone, true);
}

describe("RT-E 마목: 장기일반 매입임대 10년(2020.8.18 이전 등록 8년)", () => {
  const qualifying = {
    rentalType: "E" as const,
    isRegisteredRental: true,
    rentalRegistrationDate: new Date("2019-01-01"),
    businessRegistrationDate: new Date("2019-01-01"),
    rentalPeriodYears: 8,
    rentalStartOfficialPrice: 500_000_000, // ≤6억(수도권)
    rentIncreaseUnder5Pct: true,
  };

  it("요건 충족 → long_term_rental 배제 (effectiveHouseCount 1)", () => {
    const r = run(inputWith(qualifying));
    expect(r.excludedHouses.find((e) => e.houseId === "h2")?.reason).toBe("long_term_rental");
    expect(r.effectiveHouseCount).toBe(1);
  });

  it("5%룰 미충족(rentIncreaseUnder5Pct 누락) → 미배제 (effectiveHouseCount 2)", () => {
    const r = run(inputWith({ ...qualifying, rentIncreaseUnder5Pct: false }));
    expect(r.excludedHouses.find((e) => e.houseId === "h2")).toBeUndefined();
    expect(r.effectiveHouseCount).toBe(2);
  });
});

describe("RT-G 사목: 말소 게이트 + base 목 '해당 목의 다른 요건'", () => {
  const qualifying = {
    rentalType: "G" as const,
    isRegisteredRental: true,
    rentalRegistrationDate: new Date("2019-01-01"),
    businessRegistrationDate: new Date("2019-01-01"),
    rentalCancellationDate: new Date("2021-01-01"), // ≥2020.8.18
    hasHalfDutyPeriodMet: true,
    isSoldWithin1YearOfCancellation: true,
    // base 목(마) 다른 요건 — 임대기간요건만 면제
    saMokBaseArticle: "마" as const,
    isApartment: false,
    rentalStartOfficialPrice: 500_000_000, // 마목 6억 이하(수도권)
    isCapitalArea: true,
    rentIncreaseUnder5Pct: true,
  };

  it("말소 게이트 + base 마목 요건 충족 → 배제", () => {
    const r = run(inputWith(qualifying));
    expect(r.excludedHouses.find((e) => e.houseId === "h2")?.reason).toBe("long_term_rental");
  });

  it("의무기간 1/2 미충족 → 미배제", () => {
    const r = run(inputWith({ ...qualifying, hasHalfDutyPeriodMet: false }));
    expect(r.excludedHouses.find((e) => e.houseId === "h2")).toBeUndefined();
  });

  it("base 마목 기준시가 초과(7억) → 미배제 (해당 목의 다른 요건 미충족)", () => {
    const r = run(inputWith({ ...qualifying, rentalStartOfficialPrice: 700_000_000 }));
    expect(r.excludedHouses.find((e) => e.houseId === "h2")).toBeUndefined();
  });

  it("base 목 미선택 → 미배제 (SAMOK_BASE_REQUIRED)", () => {
    const r = run(inputWith({ ...qualifying, saMokBaseArticle: undefined }));
    expect(r.excludedHouses.find((e) => e.houseId === "h2")).toBeUndefined();
  });

  it("F-S6: base=가 reg 2017 요건충족 → 배제 / reg 2019(2018.4.2 등록상한 초과) → 미배제", () => {
    const baseGa = {
      ...qualifying,
      saMokBaseArticle: "가" as const,
      businessRegistrationDate: new Date("2017-01-01"),
      rentalRegistrationDate: new Date("2017-01-01"),
    };
    expect(run(inputWith(baseGa)).excludedHouses.find((e) => e.houseId === "h2")?.reason).toBe("long_term_rental");
    const late = run(inputWith({
      ...baseGa,
      businessRegistrationDate: new Date("2019-01-01"),
      rentalRegistrationDate: new Date("2019-01-01"),
    }));
    expect(late.excludedHouses.find((e) => e.houseId === "h2")).toBeUndefined();
  });
});

describe("RT-H 아목: 단기 매입임대 6년(2025.6.4~, 아파트 제외)", () => {
  const qualifying = {
    rentalType: "H" as const,
    isApartment: false, // 아파트 제외
    isRegisteredRental: true,
    rentalRegistrationDate: new Date("2025-07-01"), // ≥2025.6.4
    businessRegistrationDate: new Date("2025-07-01"),
    rentalPeriodYears: 6,
    rentalStartOfficialPrice: 300_000_000, // ≤4억(수도권)
    rentIncreaseUnder5Pct: true,
  };
  const td = new Date("2032-01-01");

  it("요건 충족 → 배제", () => {
    const r = run(inputWith(qualifying, td));
    expect(r.excludedHouses.find((e) => e.houseId === "h2")?.reason).toBe("long_term_rental");
  });

  it("아파트(isApartment=true)면 아목 미해당 → 미배제", () => {
    const r = run(inputWith({ ...qualifying, isApartment: true }, td));
    expect(r.excludedHouses.find((e) => e.houseId === "h2")).toBeUndefined();
  });
});

// ============================================================
// C3 위임 anchor — checkRentalArticle 위임 후 A·B·C·D·I 무회귀 (기존 무커버 유형)
// ============================================================

describe("C3 다주택 위임 — isLongTermRentalHousingExempt 유형별", () => {
  const TD = new Date("2033-01-01");
  const rental = (o: Parameters<typeof makeHouse>[1]) =>
    makeHouse("h", { isLongTermRental: true, isRegisteredRental: true, ...o });

  it("가목(A) 2017 등록·5년·5%룰 → 배제 / 2019 등록(2018.4.2 상한 초과) → 미배제", () => {
    const ok = rental({
      rentalType: "A", isApartment: false,
      businessRegistrationDate: new Date("2017-01-01"), rentalRegistrationDate: new Date("2017-01-01"),
      rentalPeriodYears: 5, rentalStartOfficialPrice: 500_000_000, isCapitalArea: true, rentIncreaseUnder5Pct: true,
    });
    expect(isLongTermRentalHousingExempt(ok, TD)).toBe(true);
    // 다주택 전용 잔여 게이트: 가목 등록상한 2018.4.2
    expect(isLongTermRentalHousingExempt({ ...ok, businessRegistrationDate: new Date("2019-01-01"), rentalRegistrationDate: new Date("2019-01-01") }, TD)).toBe(false);
  });

  it("나목(B) 2003 이전·국민주택·2호·취득당시 3억 → 배제 / 3.1억 → 미배제", () => {
    const ok = rental({
      rentalType: "B",
      businessRegistrationDate: new Date("2003-01-01"), rentalRegistrationDate: new Date("2003-01-01"),
      rentalPeriodYears: 5, isNationalSizeHousing: true, hasMinimum2Units: true, acquisitionOfficialPrice: 300_000_000,
    });
    expect(isLongTermRentalHousingExempt(ok, TD)).toBe(true);
    expect(isLongTermRentalHousingExempt({ ...ok, acquisitionOfficialPrice: 310_000_000 }, TD)).toBe(false);
  });

  it("다목(C) 2017 등록·건설 5년·298/149·6억·2호 → 배제 / 2019 등록 상한 초과 → 미배제", () => {
    const ok = rental({
      rentalType: "C", isApartment: false,
      businessRegistrationDate: new Date("2017-01-01"), rentalRegistrationDate: new Date("2017-01-01"),
      rentalPeriodYears: 5, hasMinimum2Units: true, landArea: 200, totalFloorArea: 140,
      rentalStartOfficialPrice: 500_000_000, rentIncreaseUnder5Pct: true,
    });
    expect(isLongTermRentalHousingExempt(ok, TD)).toBe(true);
    expect(isLongTermRentalHousingExempt({ ...ok, businessRegistrationDate: new Date("2019-01-01"), rentalRegistrationDate: new Date("2019-01-01") }, TD)).toBe(false);
  });

  it("라목(D) 미분양 2008~2009·비수도권·3억·5호·298/149 → 배제 / 수도권 → 미배제", () => {
    const ok = rental({
      rentalType: "D", region: "non_capital", isCapitalArea: false,
      businessRegistrationDate: new Date("2008-01-01"), rentalRegistrationDate: new Date("2008-01-01"),
      rentalPeriodYears: 5, firstSaleContractDate: new Date("2009-01-01"),
      landArea: 200, totalFloorArea: 140, acquisitionOfficialPrice: 300_000_000, hasMinimum5UnitsInCity: true,
    });
    expect(isLongTermRentalHousingExempt(ok, TD)).toBe(true);
    expect(isLongTermRentalHousingExempt({ ...ok, isCapitalArea: true }, TD)).toBe(false);
  });

  it("자목(I) 2025.6.4 이후·아파트제외·건설 6년·298/149·6억·2호 → 배제 / 아파트 → 미배제", () => {
    const ok = rental({
      rentalType: "I", isApartment: false,
      businessRegistrationDate: new Date("2025-07-01"), rentalRegistrationDate: new Date("2025-07-01"),
      rentalPeriodYears: 6, hasMinimum2Units: true, landArea: 200, totalFloorArea: 140,
      rentalStartOfficialPrice: 500_000_000, rentIncreaseUnder5Pct: true,
    });
    expect(isLongTermRentalHousingExempt(ok, TD)).toBe(true);
    expect(isLongTermRentalHousingExempt({ ...ok, isApartment: true }, TD)).toBe(false);
  });

  it("마목(E) 아파트 2021 등록 → 미배제 (C3 정정: 아파트는 장기일반 등록 불가·date-derived)", () => {
    const aptE = rental({
      rentalType: "E", isApartment: true,
      businessRegistrationDate: new Date("2021-01-01"), rentalRegistrationDate: new Date("2021-01-01"),
      rentalPeriodYears: 10, rentalStartOfficialPrice: 500_000_000, isCapitalArea: true, rentIncreaseUnder5Pct: true,
    });
    expect(isLongTermRentalHousingExempt(aptE, TD)).toBe(false);
  });
});
