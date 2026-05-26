/**
 * buildDefaultFiscalYears — 평가기준일 연도 기반 사업연도 기본값 생성 anchor
 *
 * BFY-1: 2022년 → 슬롯[0]=2021(×3), [1]=2020(×2), [2]=2019(×1)
 * BFY-2: 라벨 검증 (string "YYYY")
 * BFY-3: 개시일 (Y-n)-01-01, 종료일 (Y-n)-12-31
 * BFY-4: 윤년 종료일 2020-12-31 (2월 29일 없는 12월이므로 정상)
 * BFY-5: 연도 경계 — 평가기준일 2024-01-01 → 1년전=2023
 * BFY-6: taxableIncome 기본값 0
 * BFY-7: 개시일 채워져 있으면 fiscalYearMonths=12 → isShortYear=false (§17의3② 연환산 미적용)
 * BFY-8: 개시일=종료일 같은 해 01-01~12-31 → months=12 회귀
 */

import { describe, it, expect } from "vitest";
import { buildDefaultFiscalYears, fiscalYearMonths } from "@/lib/tax-engine/property-valuation/fiscal-year-annualize";

describe("buildDefaultFiscalYears — 평가기준일 연도 기반 사업연도 기본값 (BFY)", () => {
  it("BFY-1: evaluationYear=2022 → 슬롯 라벨 2021/2020/2019", () => {
    const [y1, y2, y3] = buildDefaultFiscalYears(2022);
    expect(y1.fiscalYearLabel).toBe("2021");
    expect(y2.fiscalYearLabel).toBe("2020");
    expect(y3.fiscalYearLabel).toBe("2019");
  });

  it("BFY-2: 슬롯[0] 개시일=(Y-1)-01-01, 종료일=(Y-1)-12-31", () => {
    const [y1] = buildDefaultFiscalYears(2022);
    const start = y1.fiscalYearStartDate!;
    const end = y1.fiscalYearEndDate!;
    expect(start.getFullYear()).toBe(2021);
    expect(start.getMonth()).toBe(0);   // January
    expect(start.getDate()).toBe(1);
    expect(end.getFullYear()).toBe(2021);
    expect(end.getMonth()).toBe(11);    // December
    expect(end.getDate()).toBe(31);
  });

  it("BFY-3: 슬롯[1] 개시일·종료일 2020-01-01~2020-12-31", () => {
    const [, y2] = buildDefaultFiscalYears(2022);
    expect(y2.fiscalYearStartDate!.getFullYear()).toBe(2020);
    expect(y2.fiscalYearEndDate!.getFullYear()).toBe(2020);
    expect(y2.fiscalYearStartDate!.getMonth()).toBe(0);
    expect(y2.fiscalYearEndDate!.getMonth()).toBe(11);
  });

  it("BFY-4: 슬롯[2] 개시일·종료일 2019-01-01~2019-12-31", () => {
    const [, , y3] = buildDefaultFiscalYears(2022);
    expect(y3.fiscalYearStartDate!.getFullYear()).toBe(2019);
    expect(y3.fiscalYearEndDate!.getFullYear()).toBe(2019);
  });

  it("BFY-4b: 윤년 — evaluationYear=2022 → 슬롯[1]=2020-12-31 정상 (2020은 윤년)", () => {
    // evaluationYear=2022, 슬롯[1]=2년전=2020
    const [, y2] = buildDefaultFiscalYears(2022);
    // 2020년은 윤년이지만 종료일은 12월 31일이므로 무관
    expect(y2.fiscalYearEndDate!.getFullYear()).toBe(2020);
    expect(y2.fiscalYearEndDate!.getDate()).toBe(31);
  });

  it("BFY-5: 연도 경계 — evaluationYear=2024 → 1년전=2023", () => {
    const [y1] = buildDefaultFiscalYears(2024);
    expect(y1.fiscalYearLabel).toBe("2023");
    expect(y1.fiscalYearStartDate!.getFullYear()).toBe(2023);
    expect(y1.fiscalYearEndDate!.getFullYear()).toBe(2023);
  });

  it("BFY-6: taxableIncome 기본값 0", () => {
    const [y1, y2, y3] = buildDefaultFiscalYears(2022);
    expect(y1.taxableIncome).toBe(0);
    expect(y2.taxableIncome).toBe(0);
    expect(y3.taxableIncome).toBe(0);
  });

  it("BFY-7: 개시일 채워진 12개월 → fiscalYearMonths=12 → isShortYear=false (§17의3② 연환산 미적용)", () => {
    const [y1] = buildDefaultFiscalYears(2022);
    const months = fiscalYearMonths(y1.fiscalYearStartDate, y1.fiscalYearEndDate);
    expect(months).toBe(12);
    // isShortYear = fiscalYearStartDate !== undefined && months < 12 → false
    const isShortYear = y1.fiscalYearStartDate !== undefined && months < 12;
    expect(isShortYear).toBe(false);
  });

  it("BFY-8: 모든 슬롯 12개월 — months 12 회귀", () => {
    const [y1, y2, y3] = buildDefaultFiscalYears(2025);
    for (const fy of [y1, y2, y3]) {
      expect(fiscalYearMonths(fy.fiscalYearStartDate, fy.fiscalYearEndDate)).toBe(12);
    }
  });
});
