/**
 * 취득세 중과세 판정 단위 테스트
 *
 * acquisition-tax-surcharge.ts — assessSurcharge,
 *   isExemptFromSurcharge_LowValue, resolveFinalRate
 */

import { describe, it, expect } from "vitest";
import {
  assessSurcharge,
  isExemptFromSurcharge_LowValue,
  resolveFinalRate,
} from "../../lib/tax-engine/acquisition-tax-surcharge";

// ============================================================
// assessSurcharge — 사치성 재산
// ============================================================

describe("assessSurcharge — 사치성 재산 (§13①)", () => {
  it("사치성 재산: isSurcharged=true, 20% (기본세율 4% × 5)", () => {
    const result = assessSurcharge({
      propertyType: "housing",
      acquisitionCause: "purchase",
      acquisitionValue: 500_000_000,
      acquiredBy: "individual",
      isLuxuryProperty: true,
    });
    expect(result.isSurcharged).toBe(true);
    // 지방세법 §13①: "해당 세율의 100분의 500" = basicRate × 5
    // LUXURY_BASE_RATE(4%) × 5 = 20%
    expect(result.surchargeRate).toBe(0.20);
    expect(result.surchargeReason).toContain("사치성 재산");
  });

  it("사치성 재산 우선: 법인이어도 사치성 먼저 판정", () => {
    const result = assessSurcharge({
      propertyType: "housing",
      acquisitionCause: "purchase",
      acquisitionValue: 500_000_000,
      acquiredBy: "corporation",
      isLuxuryProperty: true,
    });
    expect(result.surchargeReason).toContain("사치성 재산");
  });
});

// ============================================================
// assessSurcharge — 법인 주택 중과 (§13의2)
// ============================================================

describe("assessSurcharge — 법인 주택 중과", () => {
  it("법인 + 주택 + 매매: 12%", () => {
    const result = assessSurcharge({
      propertyType: "housing",
      acquisitionCause: "purchase",
      acquisitionValue: 500_000_000,
      acquiredBy: "corporation",
    });
    expect(result.isSurcharged).toBe(true);
    expect(result.surchargeRate).toBe(0.12);
    expect(result.surchargeReason).toContain("법인");
  });

  it("법인 + 주택 + 공매경매: 12%", () => {
    const result = assessSurcharge({
      propertyType: "housing",
      acquisitionCause: "auction",
      acquisitionValue: 300_000_000,
      acquiredBy: "corporation",
    });
    expect(result.isSurcharged).toBe(true);
    expect(result.surchargeRate).toBe(0.12);
  });

  it("법인 + 주택 + 상속: 중과 없음 (무상취득 제외)", () => {
    const result = assessSurcharge({
      propertyType: "housing",
      acquisitionCause: "inheritance",
      acquisitionValue: 500_000_000,
      acquiredBy: "corporation",
    });
    expect(result.isSurcharged).toBe(false);
  });

  it("법인 + 토지 + 매매: 중과 없음 (주택 아님)", () => {
    const result = assessSurcharge({
      propertyType: "land",
      acquisitionCause: "purchase",
      acquisitionValue: 500_000_000,
      acquiredBy: "corporation",
    });
    expect(result.isSurcharged).toBe(false);
  });
});

// ============================================================
// assessSurcharge — 다주택 중과 (§13의2 — 조정대상지역)
// ============================================================

describe("assessSurcharge — 다주택 중과 (조정대상지역)", () => {
  it("조정지역 + 2주택: 8%", () => {
    const result = assessSurcharge({
      propertyType: "housing",
      acquisitionCause: "purchase",
      acquisitionValue: 500_000_000,
      acquiredBy: "individual",
      isRegulatedArea: true,
      houseCountAfter: 2,
    });
    expect(result.isSurcharged).toBe(true);
    expect(result.surchargeRate).toBe(0.08);
    expect(result.surchargeReason).toContain("2주택");
  });

  it("조정지역 + 3주택: 12%", () => {
    const result = assessSurcharge({
      propertyType: "housing",
      acquisitionCause: "purchase",
      acquisitionValue: 500_000_000,
      acquiredBy: "individual",
      isRegulatedArea: true,
      houseCountAfter: 3,
    });
    expect(result.isSurcharged).toBe(true);
    expect(result.surchargeRate).toBe(0.12);
  });

  it("조정지역 + 4주택: 12%", () => {
    const result = assessSurcharge({
      propertyType: "housing",
      acquisitionCause: "purchase",
      acquisitionValue: 500_000_000,
      acquiredBy: "individual",
      isRegulatedArea: true,
      houseCountAfter: 4,
    });
    expect(result.isSurcharged).toBe(true);
    expect(result.surchargeRate).toBe(0.12);
  });

  it("조정지역 + 1주택: 중과 없음", () => {
    const result = assessSurcharge({
      propertyType: "housing",
      acquisitionCause: "purchase",
      acquisitionValue: 500_000_000,
      acquiredBy: "individual",
      isRegulatedArea: true,
      houseCountAfter: 1,
    });
    expect(result.isSurcharged).toBe(false);
    expect(result.exceptions?.some(e => e.includes("1주택"))).toBe(true);
  });

  it("비조정지역 + 다주택: 중과 없음", () => {
    const result = assessSurcharge({
      propertyType: "housing",
      acquisitionCause: "purchase",
      acquisitionValue: 500_000_000,
      acquiredBy: "individual",
      isRegulatedArea: false,
      houseCountAfter: 3,
    });
    expect(result.isSurcharged).toBe(false);
    expect(result.exceptions?.some(e => e.includes("비조정"))).toBe(true);
  });

  // C1 버그 수정 검증: 상속·증여는 조정지역 다주택 중과 배제 (지방세법 §13의2 — 유상취득만 적용)
  it("상속 + 조정지역 + 2주택: 중과 없음 (무상취득 배제)", () => {
    const result = assessSurcharge({
      propertyType: "housing",
      acquisitionCause: "inheritance",
      acquisitionValue: 500_000_000,
      acquiredBy: "individual",
      isRegulatedArea: true,
      houseCountAfter: 2,
    });
    expect(result.isSurcharged).toBe(false);
  });

  it("증여 + 조정지역 + 3주택: 중과 없음 (무상취득 배제)", () => {
    const result = assessSurcharge({
      propertyType: "housing",
      acquisitionCause: "gift",
      acquisitionValue: 500_000_000,
      acquiredBy: "individual",
      isRegulatedArea: true,
      houseCountAfter: 3,
    });
    expect(result.isSurcharged).toBe(false);
  });

  it("매매 + 조정지역 + 2주택: 8% 중과 적용 (유상취득)", () => {
    const result = assessSurcharge({
      propertyType: "housing",
      acquisitionCause: "purchase",
      acquisitionValue: 500_000_000,
      acquiredBy: "individual",
      isRegulatedArea: true,
      houseCountAfter: 2,
    });
    expect(result.isSurcharged).toBe(true);
    expect(result.surchargeRate).toBe(0.08);
  });
});

// ============================================================
// assessSurcharge — 생애최초 감면 (§36의3)
// ============================================================

describe("assessSurcharge — 생애최초 감면", () => {
  it("생애최초 + 수도권 4억 이하: 감면 eligible=true", () => {
    const result = assessSurcharge({
      propertyType: "housing",
      acquisitionCause: "purchase",
      acquisitionValue: 400_000_000,
      acquiredBy: "individual",
      isFirstHome: true,
      isMetropolitan: true,
      acquisitionTax: 4_000_000,
    });
    expect(result.firstHomeReduction?.isEligible).toBe(true);
    expect(result.firstHomeReduction?.reductionAmount).toBe(2_000_000); // 최대 200만원
  });

  it("생애최초 + 취득가액 12억 초과: 감면 불가 (§36의3① 단일 기준)", () => {
    const result = assessSurcharge({
      propertyType: "housing",
      acquisitionCause: "purchase",
      acquisitionValue: 1_300_000_000, // 13억 — 현행 12억 한도 초과
      acquiredBy: "individual",
      isFirstHome: true,
      isMetropolitan: true,
      acquisitionTax: 39_000_000,
    });
    expect(result.firstHomeReduction?.isEligible).toBe(false);
    expect(result.firstHomeReduction?.reductionAmount).toBe(0);
  });

  it("생애최초 + 비수도권 3억 이하: 감면 eligible=true", () => {
    const result = assessSurcharge({
      propertyType: "housing",
      acquisitionCause: "purchase",
      acquisitionValue: 250_000_000,
      acquiredBy: "individual",
      isFirstHome: true,
      isMetropolitan: false,
      acquisitionTax: 2_500_000,
    });
    expect(result.firstHomeReduction?.isEligible).toBe(true);
    expect(result.firstHomeReduction?.reductionAmount).toBe(2_000_000);
  });

  it("생애최초 + 취득가액 4억 (현행법 12억 한도 내): 감면 eligible", () => {
    // 구법에서는 비수도권 3억 한도였으나 현행(§36의3) 12억 단일 기준으로 eligible
    const result = assessSurcharge({
      propertyType: "housing",
      acquisitionCause: "purchase",
      acquisitionValue: 350_000_000,
      acquiredBy: "individual",
      isFirstHome: true,
      isMetropolitan: false,
      acquisitionTax: 3_500_000,
    });
    expect(result.firstHomeReduction?.isEligible).toBe(true);
  });

  it("생애최초 + 취득세 100만원: 감면액 = 100만원 (본세 내)", () => {
    const result = assessSurcharge({
      propertyType: "housing",
      acquisitionCause: "purchase",
      acquisitionValue: 200_000_000,
      acquiredBy: "individual",
      isFirstHome: true,
      isMetropolitan: false,
      acquisitionTax: 1_000_000,
    });
    expect(result.firstHomeReduction?.isEligible).toBe(true);
    expect(result.firstHomeReduction?.reductionAmount).toBe(1_000_000); // 본세 100만원 < 200만원 한도
  });

  it("생애최초 + 조정지역 2주택 중과: 감면 불가 (surchargeRate > 3%)", () => {
    const result = assessSurcharge({
      propertyType: "housing",
      acquisitionCause: "purchase",
      acquisitionValue: 300_000_000,
      acquiredBy: "individual",
      isFirstHome: true,
      isMetropolitan: false,
      isRegulatedArea: true,
      houseCountAfter: 2,
      acquisitionTax: 24_000_000,
    });
    expect(result.isSurcharged).toBe(true);
    expect(result.firstHomeReduction?.isEligible).toBe(false);
  });

  it("isFirstHome=false: firstHomeReduction=undefined", () => {
    const result = assessSurcharge({
      propertyType: "housing",
      acquisitionCause: "purchase",
      acquisitionValue: 300_000_000,
      acquiredBy: "individual",
      isFirstHome: false,
    });
    expect(result.firstHomeReduction).toBeUndefined();
  });

  it("상속은 생애최초 감면 대상 아님 (유상취득 아님)", () => {
    const result = assessSurcharge({
      propertyType: "housing",
      acquisitionCause: "inheritance",
      acquisitionValue: 200_000_000,
      acquiredBy: "individual",
      isFirstHome: true,
      isMetropolitan: false,
    });
    // 상속은 isOnerousHousing 아님 → firstHomeReduction=undefined
    expect(result.firstHomeReduction).toBeUndefined();
  });
});

// ============================================================
// isExemptFromSurcharge_LowValue — 1억 이하 배제
// ============================================================

describe("isExemptFromSurcharge_LowValue", () => {
  it("공시가 1억 이하: 중과 배제 (true)", () => {
    expect(isExemptFromSurcharge_LowValue(100_000_000)).toBe(true);
    expect(isExemptFromSurcharge_LowValue(80_000_000)).toBe(true);
  });

  it("공시가 1억 초과: 배제 안 됨 (false)", () => {
    expect(isExemptFromSurcharge_LowValue(100_000_001)).toBe(false);
    expect(isExemptFromSurcharge_LowValue(200_000_000)).toBe(false);
  });

  it("도시정비구역 내: 1억 이하여도 배제 불가 (false)", () => {
    expect(isExemptFromSurcharge_LowValue(80_000_000, true)).toBe(false);
    expect(isExemptFromSurcharge_LowValue(50_000_000, true)).toBe(false);
  });

  it("도시정비구역 아님(false): 정상 배제 적용", () => {
    expect(isExemptFromSurcharge_LowValue(90_000_000, false)).toBe(true);
  });
});

// ============================================================
// resolveFinalRate — 최종 세율 결정
// ============================================================

describe("resolveFinalRate", () => {
  it("중과세 적용: surchargeRate 반환", () => {
    const decision = {
      isSurcharged: true,
      surchargeRate: 0.12,
      exceptions: [],
      warnings: [],
      legalBasis: [],
    };
    expect(resolveFinalRate(0.01, decision)).toBe(0.12);
  });

  it("중과세 미적용: basicRate 반환", () => {
    const decision = {
      isSurcharged: false,
      exceptions: [],
      warnings: [],
      legalBasis: [],
    };
    expect(resolveFinalRate(0.03, decision)).toBe(0.03);
  });

  it("isSurcharged=true이지만 surchargeRate 없음: basicRate 반환", () => {
    const decision = {
      isSurcharged: true,
      surchargeRate: undefined,
      exceptions: [],
      warnings: [],
      legalBasis: [],
    };
    expect(resolveFinalRate(0.02, decision)).toBe(0.02);
  });
});
