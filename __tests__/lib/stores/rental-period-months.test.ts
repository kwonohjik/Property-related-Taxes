/**
 * 임대기간 다중 구간 개월 도출 — deriveRentalMonths/sumRentalMonths anchor
 *
 * whole-month(diffMonthsClamped) 재사용: 5년=60·8년=96·부분월 버림·비연속 합산·무효 skip.
 * direct 모드는 rentalMonths(decimal) fallback.
 */

import { describe, it, expect } from "vitest";
import {
  sumRentalMonths,
  deriveRentalMonths,
  type RentalPeriod,
} from "@/lib/stores/calc-wizard-asset-rental-period";

const P = (start: string, end: string): RentalPeriod => ({ start, end });

describe("sumRentalMonths — whole-month 합산", () => {
  it("8년 = 96개월", () => {
    expect(sumRentalMonths([P("2019-01-01", "2027-01-01")])).toBe(96);
  });

  it("정확히 5년 = 60개월 (경계 undercount 없음)", () => {
    expect(sumRentalMonths([P("2019-01-01", "2024-01-01")])).toBe(60);
  });

  it("부분월 버림: 2019-01-15~2019-03-01 = 1개월", () => {
    // (3-1)=2, 종료일 day 1 < 시작일 day 15 → -1 → 1
    expect(sumRentalMonths([P("2019-01-15", "2019-03-01")])).toBe(1);
  });

  it("비연속 2구간 합산 (공실 구간 제외)", () => {
    // 24 + 36 = 60
    expect(
      sumRentalMonths([P("2019-01-01", "2021-01-01"), P("2022-01-01", "2025-01-01")]),
    ).toBe(60);
  });

  it("무효 구간(시작·종료 한쪽 비거나 종료<시작)은 0으로 skip", () => {
    expect(sumRentalMonths([P("2019-01-01", "")])).toBe(0);
    expect(sumRentalMonths([P("", "2024-01-01")])).toBe(0);
    expect(sumRentalMonths([P("2024-01-01", "2019-01-01")])).toBe(0);
    expect(sumRentalMonths([])).toBe(0);
    expect(sumRentalMonths(undefined)).toBe(0);
  });
});

describe("deriveRentalMonths — interval/direct 도출", () => {
  it("interval + 구간 → 합산", () => {
    expect(
      deriveRentalMonths({
        rentalInputMode: "interval",
        rentalPeriods: [P("2019-01-01", "2027-01-01")],
        rentalMonths: "0",
      }),
    ).toBe(96);
  });

  it("direct → rentalMonths(decimal) fallback", () => {
    expect(
      deriveRentalMonths({ rentalInputMode: "direct", rentalPeriods: [], rentalMonths: "72" }),
    ).toBe(72);
  });

  it("interval인데 구간 비면 direct fallback (3중 패턴 안전)", () => {
    expect(
      deriveRentalMonths({ rentalInputMode: "interval", rentalPeriods: [], rentalMonths: "48" }),
    ).toBe(48);
  });

  it("legacy(mode 미설정) → rentalMonths fallback", () => {
    expect(deriveRentalMonths({ rentalMonths: "60" })).toBe(60);
  });
});
