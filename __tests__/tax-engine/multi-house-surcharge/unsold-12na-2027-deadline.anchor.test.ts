/**
 * 소득세법 시행령 §167의3①12호 나목(비수도권 준공 후 미분양주택) 취득기간 연장 — 대통령령 제36737호
 * (2026.9.30. 공포·10.1. 시행). 개정 전 MST 286211 「2024년 1월 10일부터 2026년 12월 31일까지 취득하는
 * 주택」 → 현행 MST 290841 「… 2027년 12월 31일까지 취득하는 주택」. 부칙(제1조·제2조)에 이 목의 별도
 * 적용례는 없고, 2027년 취득분은 시행일 전에 양도될 수 없으므로 날짜만 바뀐다.
 */
import { describe, it, expect } from "vitest";
import { isSmallNewHouseSpecial } from "@/lib/tax-engine/multi-house-surcharge";
import { makeHouse } from "../_helpers/multi-house-mock";

const unsold = (acquisitionDate: string) =>
  makeHouse("h1", {
    acquisitionDate: new Date(acquisitionDate),
    isApartment: true,
    exclusiveArea: 84,
    acquisitionPrice: 650_000_000,
    isCapitalArea: false,
    region: "non_capital",
    isUnsoldNewHouse: true,
  });

describe("§167의3①12호 나목 취득기간 2027.12.31.까지 (제36737호)", () => {
  it("2027-03-01 취득(연장 구간) → 주택 수 제외 특례 해당", () => {
    expect(isSmallNewHouseSpecial(unsold("2027-03-01"), new Date("2027-06-01"))).toBe(true);
  });

  it("2027-12-31 취득(마지막 날) → 해당", () => {
    expect(isSmallNewHouseSpecial(unsold("2027-12-31"), new Date("2028-06-01"))).toBe(true);
  });

  it("2028-01-01 취득 → 해당 없음", () => {
    expect(isSmallNewHouseSpecial(unsold("2028-01-01"), new Date("2028-06-01"))).toBe(false);
  });

  it("짝: 2026-06-01 취득(종전부터 구간 안) → 해당", () => {
    expect(isSmallNewHouseSpecial(unsold("2026-06-01"), new Date("2026-12-01"))).toBe(true);
  });
});
