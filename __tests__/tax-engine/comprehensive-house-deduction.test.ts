/**
 * 종합부동산세 1세대1주택 세액공제 + 세부담 상한 테스트 (T-19)
 * 종합부동산세법 §9②, §10 기반
 */

import { describe, it, expect } from "vitest";
import {
  getSeniorRate,
  getLongTermRate,
  applyOneHouseDeduction,
  applyTaxCap,
} from "../../lib/tax-engine/comprehensive-tax";
import { COMPREHENSIVE_CONST } from "../../lib/tax-engine/legal-codes";

const ASSESSMENT_DATE = new Date("2024-06-01");

// ============================================================
// 1세대1주택 세액공제 (§9②)
// ============================================================

describe("getSeniorRate — 고령자 공제율", () => {
  it("만 60세 미만 → 0%", () => {
    // 1980-06-01 생년월일 → 2024-06-01 기준 만 44세
    expect(getSeniorRate(new Date("1980-06-01"), ASSESSMENT_DATE)).toBe(0);
  });

  it("만 60세 이상 ~ 65세 미만 → 20%", () => {
    // 1964-06-01 생년월일 → 만 60세
    expect(getSeniorRate(new Date("1964-06-01"), ASSESSMENT_DATE)).toBe(
      COMPREHENSIVE_CONST.SENIOR_RATE_60,
    );
  });

  it("만 65세 이상 ~ 70세 미만 → 30%", () => {
    // 1959-05-31 생년월일 → 2024-06-01 기준 만 65세
    // (1959-06-01은 서울 역사 UTC+9:30 오프셋으로 date-fns가 64세로 계산하므로 5/31 사용)
    expect(getSeniorRate(new Date("1959-05-31"), ASSESSMENT_DATE)).toBe(
      COMPREHENSIVE_CONST.SENIOR_RATE_65,
    );
  });

  it("만 70세 이상 → 40%", () => {
    // 1954-06-01 생년월일 → 만 70세
    expect(getSeniorRate(new Date("1954-06-01"), ASSESSMENT_DATE)).toBe(
      COMPREHENSIVE_CONST.SENIOR_RATE_70,
    );
  });

  it("생일이 과세기준일(6/1) 당일 → 해당 연령 포함", () => {
    // 1964-06-01 → 2024-06-01 기준 정확히 만 60세 → 20% 포함
    expect(getSeniorRate(new Date("1964-06-01"), ASSESSMENT_DATE)).toBe(
      COMPREHENSIVE_CONST.SENIOR_RATE_60,
    );
  });
});

describe("getLongTermRate — 장기보유 공제율", () => {
  it("5년 미만 → 0%", () => {
    // 2022-01-01 취득 → 약 2년 보유
    expect(getLongTermRate(new Date("2022-01-01"), ASSESSMENT_DATE)).toBe(0);
  });

  it("5년 이상 ~ 10년 미만 → 20%", () => {
    // 2018-01-01 취득 → 약 6년
    expect(getLongTermRate(new Date("2018-01-01"), ASSESSMENT_DATE)).toBe(
      COMPREHENSIVE_CONST.LONG_TERM_RATE_5Y,
    );
  });

  it("10년 이상 ~ 15년 미만 → 40%", () => {
    // 2013-01-01 취득 → 약 11년
    expect(getLongTermRate(new Date("2013-01-01"), ASSESSMENT_DATE)).toBe(
      COMPREHENSIVE_CONST.LONG_TERM_RATE_10Y,
    );
  });

  it("15년 이상 → 50%", () => {
    // 2008-01-01 취득 → 약 16년
    expect(getLongTermRate(new Date("2008-01-01"), ASSESSMENT_DATE)).toBe(
      COMPREHENSIVE_CONST.LONG_TERM_RATE_15Y,
    );
  });

  it("취득일 = 과세기준일 당일 → 보유기간 0년 → 0%", () => {
    expect(getLongTermRate(ASSESSMENT_DATE, ASSESSMENT_DATE)).toBe(0);
  });
});

describe("applyOneHouseDeduction — 세액공제 종합", () => {
  // T01: 60세 미만 + 5년 미만 → 공제 없음
  it("T01: 60세 미만 + 5년 미만 → 공제 없음", () => {
    const result = applyOneHouseDeduction(
      1_000_000,
      new Date("1980-06-01"), // 44세
      new Date("2022-01-01"), // 2년 보유
      ASSESSMENT_DATE,
    );
    expect(result.seniorRate).toBe(0);
    expect(result.longTermRate).toBe(0);
    expect(result.combinedRate).toBe(0);
    expect(result.deductionAmount).toBe(0);
    expect(result.isMaxCapApplied).toBe(false);
  });

  // T02: 고령자 40% + 장기보유 50% = 90% → 80% 상한 적용
  it("T02: 70세 이상 + 15년 이상 → 합산 90% → 80% 상한 적용", () => {
    const result = applyOneHouseDeduction(
      1_000_000,
      new Date("1954-06-01"), // 70세 이상
      new Date("2008-01-01"), // 16년 보유
      ASSESSMENT_DATE,
    );
    expect(result.seniorRate).toBe(0.4);
    expect(result.longTermRate).toBe(0.5);
    expect(result.combinedRate).toBe(0.80);       // 상한 적용
    expect(result.deductionAmount).toBe(800_000); // 1,000,000 × 0.80
    expect(result.isMaxCapApplied).toBe(true);
  });

  // T03: 고령자 30% + 장기보유 40% = 70% → 상한 미도달
  it("T03: 65세 + 10년 이상 → 합산 70% → 상한 미적용", () => {
    const result = applyOneHouseDeduction(
      1_000_000,
      new Date("1959-05-31"), // 65세 (서울 KST 역사 오프셋 회피)
      new Date("2013-01-01"), // 11년
      ASSESSMENT_DATE,
    );
    expect(result.seniorRate).toBe(0.3);
    expect(result.longTermRate).toBe(0.4);
    expect(result.combinedRate).toBe(0.70);
    expect(result.deductionAmount).toBe(700_000);
    expect(result.isMaxCapApplied).toBe(false);
  });

  // T04: 고령자 20% + 장기보유 20% = 40%
  it("T04: 60세 + 5년 이상 → 합산 40%", () => {
    const result = applyOneHouseDeduction(
      2_000_000,
      new Date("1964-06-01"), // 60세
      new Date("2018-01-01"), // 6년
      ASSESSMENT_DATE,
    );
    expect(result.combinedRate).toBe(0.40);
    expect(result.deductionAmount).toBe(800_000); // 2,000,000 × 0.40
  });

  // T05: 공제금액 Math.floor 확인
  it("T05: 공제금액 원 미만 절사 확인", () => {
    const result = applyOneHouseDeduction(
      999_999,
      new Date("1959-05-31"), // 65세 (서울 KST 역사 오프셋 회피) → 30%
      new Date("2022-01-01"), // 2년 → 0%
      ASSESSMENT_DATE,
    );
    expect(result.combinedRate).toBe(0.30);
    expect(result.deductionAmount).toBe(Math.floor(999_999 * 0.30)); // 299_999
  });
});

// ============================================================
// 세부담 상한 (§10)
// ============================================================

describe("applyTaxCap — 세부담 상한", () => {
  // T06: 일반 1주택 — 전년도 1,000만원 × 150% = 1,500만원 상한
  it("T06: 일반 상한 150% — 당해 세액이 상한 초과 시 적용", () => {
    // comprehensiveTax=18,000,000, propertyTax=5,000,000, prevYear=10,000,000
    // capAmount = 15,000,000, cappedTax = min(18,000,000, 15,000,000 - 5,000,000) = 10,000,000
    const result = applyTaxCap(18_000_000, 5_000_000, 10_000_000, false);
    expect(result).not.toBeUndefined();
    expect(result!.capRate).toBe(1.5);
    expect(result!.capAmount).toBe(15_000_000);
    expect(result!.cappedTax).toBe(10_000_000);
    expect(result!.isApplied).toBe(true);
  });

  // T07: 현행법 §10 단일 150% 상한 — 다주택 여부 무관
  it("T07: 현행법 150% 상한 — 종부세 §10 개정(300% 삭제) 반영", () => {
    // comprehensiveTax=20,000,000, propertyTax=3,000,000, prevYear=8,000,000
    // 현행: capRate=1.5, capAmount=12,000,000, cappedTax=min(20M, 12M-3M)=9,000,000, isApplied=true
    const result = applyTaxCap(20_000_000, 3_000_000, 8_000_000, true);
    expect(result).not.toBeUndefined();
    expect(result!.capRate).toBe(1.5);
    expect(result!.isApplied).toBe(true);
    expect(result!.cappedTax).toBe(9_000_000);
  });

  // T08: 전년도 세액 미입력 → undefined 반환
  it("T08: 전년도 세액 미입력 → undefined 반환", () => {
    const result = applyTaxCap(10_000_000, 2_000_000, undefined, false);
    expect(result).toBeUndefined();
  });

  // T09: 전년도 세액 0원 → cappedTax = 0
  it("T09: 전년도 세액 0원 → cappedTax = 0, isApplied = true", () => {
    const result = applyTaxCap(5_000_000, 1_000_000, 0, false);
    expect(result).not.toBeUndefined();
    expect(result!.cappedTax).toBe(0);
    expect(result!.isApplied).toBe(true);
  });

  // T10: cappedTax 음수 방어 — 재산세가 상한액보다 클 때
  it("T10: cappedTax 음수 방어 (재산세 > 상한액-종부세) → 0원", () => {
    // comprehensiveTax=3,000,000, propertyTax=10,000,000, prevYear=5,000,000
    // capAmount = 7,500,000, cappedTax = min(3,000,000, 7,500,000 - 10,000,000) = max(-2,500,000, 0) = 0
    const result = applyTaxCap(3_000_000, 10_000_000, 5_000_000, false);
    expect(result).not.toBeUndefined();
    expect(result!.cappedTax).toBe(0);
    expect(result!.isApplied).toBe(true);
  });
});
