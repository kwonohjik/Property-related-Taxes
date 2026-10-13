/**
 * 영 §167의3①2호 단서 — 말소된 장기임대주택의 중과 2호 판정 (`rental-cancellation-deeming.ts` · #20 C 후속).
 *
 * 단서는 「가목 및 다목부터 마목까지」만 정한다 — 나목(기존사업자)·바목(장기일반 건설)·아·자목(2025 신설 단기)은 자동말소여도
 * 간주하지 않는다. 자동말소 제도는 법률 제17482호(2020.8.18. 시행)로 생겼다.
 */
import { describe, it, expect } from "vitest";
import { rentalCancellationStatus } from "@/lib/tax-engine/rental-cancellation-deeming";
import { isLongTermRentalHousingExempt } from "@/lib/tax-engine/multi-house-surcharge-count";
import type { HouseInfo } from "@/lib/tax-engine/types/multi-house-surcharge.types";

const T = new Date("2026-09-18");
/** 가목 매입 · 2018.3.1. 등록 · 4년 임대 · 2022.3.1. 말소 — 기간(5년)만 모자란다 */
const house = (over: Partial<HouseInfo> = {}): HouseInfo => ({
  id: "r",
  acquisitionDate: new Date("2016-01-01"),
  officialPrice: 300_000_000,
  region: "capital",
  isCapitalArea: true,
  isInherited: false,
  isOfficetel: false,
  isUnsoldHousing: false,
  isApartment: false,
  isLongTermRental: true,
  isRegisteredRental: true,
  rentalType: "A",
  businessRegistrationDate: new Date("2018-03-01"),
  rentalRegistrationDate: new Date("2018-03-01"),
  rentalPeriodYears: 4,
  rentIncreaseUnder5Pct: true,
  rentalStartOfficialPrice: 250_000_000,
  rentalCancelledDate: new Date("2022-03-01"),
  rentalCancellationReason: "auto",
  ...over,
});

describe("rentalCancellationStatus", () => {
  it("D-1 가·다·라·마목 자동말소 → 간주 · 그 밖의 목은 간주하지 않는다", () => {
    for (const t of ["A", "C", "D", "E"] as const) expect(rentalCancellationStatus(house({ rentalType: t }), T)).toBe("auto_deemed");
    for (const t of ["B", "F", "G", "H", "I"] as const) expect(rentalCancellationStatus(house({ rentalType: t }), T)).toBe("not_deemed");
    expect(rentalCancellationStatus(house({ rentalType: undefined }), T)).toBe("not_deemed");
  });
  it("D-2 자진말소 · 미선택 · 2020.8.18. 전 말소 → 간주하지 않는다 / 양도일 뒤 말소 · 말소일 없음 → 말소 아님", () => {
    expect(rentalCancellationStatus(house({ rentalCancellationReason: "voluntary" }), T)).toBe("not_deemed");
    expect(rentalCancellationStatus(house({ rentalCancellationReason: undefined }), T)).toBe("not_deemed");
    expect(rentalCancellationStatus(house({ rentalCancelledDate: new Date("2020-08-17") }), T)).toBe("not_deemed");
    expect(rentalCancellationStatus(house({ rentalCancelledDate: new Date("2020-08-18") }), T)).toBe("auto_deemed");
    expect(rentalCancellationStatus(house({ rentalCancelledDate: new Date("2026-09-19") }), T)).toBe("none");
    expect(rentalCancellationStatus(house({ rentalCancelledDate: undefined }), T)).toBe("none");
  });
});

describe("isLongTermRentalHousingExempt — 단서는 임대기간요건만 면제한다", () => {
  it("D-3 ★ 자동말소 가목 · 4년 → 2호 / 미선택 → 2호 아님", () => {
    expect(isLongTermRentalHousingExempt(house(), T)).toBe(true);
    expect(isLongTermRentalHousingExempt(house({ rentalCancellationReason: undefined }), T)).toBe(false);
  });
  it("D-4 짝 — 다른 요건(수도권 6억 상한 · 등록 완비)은 그대로 본다", () => {
    expect(isLongTermRentalHousingExempt(house({ rentalStartOfficialPrice: 700_000_000 }), T)).toBe(false);
    expect(isLongTermRentalHousingExempt(house({ isRegisteredRental: false }), T)).toBe(false);
  });
});
