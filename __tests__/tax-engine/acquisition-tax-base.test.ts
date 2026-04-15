/**
 * 취득세 과세표준 결정 단위 테스트
 *
 * acquisition-tax-base.ts — determineTaxBase
 */

import { describe, it, expect } from "vitest";
import { determineTaxBase } from "../../lib/tax-engine/acquisition-tax-base";
import type { AcquisitionTaxInput } from "../../lib/tax-engine/types/acquisition.types";

// 최소 공통 입력 헬퍼
function base(override: Partial<AcquisitionTaxInput> = {}): AcquisitionTaxInput {
  return {
    propertyType: "housing",
    acquisitionCause: "purchase",
    reportedPrice: 500_000_000,
    acquisitionDate: "2024-01-01",
    acquiredBy: "individual",
    ...override,
  } as AcquisitionTaxInput;
}

// ============================================================
// 일반 유상취득
// ============================================================

describe("determineTaxBase — 유상취득", () => {
  it("신고가 > 0: 사실상취득가격 = 신고가 (천원 미만 절사)", () => {
    const result = determineTaxBase(base({ reportedPrice: 500_001_500 }));
    expect(result.method).toBe("actual_price");
    expect(result.taxBase).toBe(500_001_000); // 500,001,500 → 천원 절사 → 500,001,000
  });

  it("신고가 = 0: 시가표준액 사용", () => {
    const result = determineTaxBase(base({
      reportedPrice: 0,
      standardValue: 450_000_000,
    }));
    expect(result.method).toBe("standard_value");
    expect(result.taxBase).toBe(450_000_000);
  });

  it("신고가 < 시가표준액: 과세관청 경정 경고 포함", () => {
    const result = determineTaxBase(base({
      reportedPrice: 300_000_000,
      standardValue: 450_000_000,
    }));
    expect(result.method).toBe("actual_price");
    expect(result.taxBase).toBe(300_000_000);
    expect(result.warnings.some(w => w.includes("경정"))).toBe(true);
  });
});

// ============================================================
// 무상취득 (상속·증여)
// ============================================================

describe("determineTaxBase — 무상취득 (상속)", () => {
  it("상속 + 시가인정액 있음: 시가인정액 사용", () => {
    const result = determineTaxBase(base({
      acquisitionCause: "inheritance",
      reportedPrice: 0,
      marketValue: 500_000_000,
      standardValue: 400_000_000,
    }));
    expect(result.method).toBe("recognized_market");
    expect(result.taxBase).toBe(500_000_000);
  });

  it("상속 + 시가인정액 없음: 시가표준액 사용", () => {
    const result = determineTaxBase(base({
      acquisitionCause: "inheritance",
      reportedPrice: 0,
      standardValue: 400_000_000,
    }));
    expect(result.method).toBe("standard_value");
    expect(result.taxBase).toBe(400_000_000);
  });

  it("농지 상속: 시가표준액 사용", () => {
    const result = determineTaxBase(base({
      propertyType: "land_farmland",
      acquisitionCause: "inheritance_farmland",
      reportedPrice: 0,
      standardValue: 100_000_000,
    }));
    expect(result.method).toBe("standard_value");
    expect(result.taxBase).toBe(100_000_000);
  });
});

describe("determineTaxBase — 무상취득 (증여)", () => {
  it("증여 + 시가인정액 없음: 시가표준액 사용", () => {
    const result = determineTaxBase(base({
      acquisitionCause: "gift",
      reportedPrice: 0,
      standardValue: 300_000_000,
    }));
    expect(result.method).toBe("standard_value");
    expect(result.taxBase).toBe(300_000_000);
  });
});

// ============================================================
// 원시취득 (신축)
// ============================================================

describe("determineTaxBase — 원시취득", () => {
  it("공사비 있음: 공사비를 과세표준으로 사용", () => {
    const result = determineTaxBase(base({
      acquisitionCause: "new_construction",
      reportedPrice: 0,
      constructionCost: 300_000_000,
    }));
    expect(result.method).toBe("construction_cost");
    expect(result.taxBase).toBe(300_000_000);
  });

  it("공사비 없음: 시가표준액 사용 + 경고", () => {
    const result = determineTaxBase(base({
      acquisitionCause: "new_construction",
      reportedPrice: 0,
      standardValue: 250_000_000,
    }));
    expect(result.method).toBe("standard_value");
    expect(result.taxBase).toBe(250_000_000);
    expect(result.warnings.some(w => w.includes("공사비"))).toBe(true);
  });
});

// ============================================================
// 부담부증여
// ============================================================

describe("determineTaxBase — 부담부증여", () => {
  it("총시가 1억, 채무 4천만: 유상(4천만) + 무상(6천만) 분리", () => {
    const result = determineTaxBase(base({
      acquisitionCause: "burdened_gift",
      reportedPrice: 0,
      encumbrance: 40_000_000,
      standardValue: 100_000_000,
    }));
    expect(result.method).toBe("split_onerous");
    expect(result.breakdown?.onerousTaxBase).toBe(40_000_000);
    expect(result.breakdown?.gratuitousTaxBase).toBe(60_000_000);
    expect(result.taxBase).toBe(100_000_000); // 합산
  });

  it("채무 > 총시가: 유상부분 = 총시가, 무상부분 = 0", () => {
    const result = determineTaxBase(base({
      acquisitionCause: "burdened_gift",
      reportedPrice: 0,
      encumbrance: 120_000_000,
      standardValue: 100_000_000,
    }));
    expect(result.breakdown?.onerousTaxBase).toBe(100_000_000);
    expect(result.breakdown?.gratuitousTaxBase).toBe(0);
  });

  it("채무 없음: 부담부증여 분기 통과 안 됨 (일반 증여로 처리)", () => {
    const result = determineTaxBase(base({
      acquisitionCause: "burdened_gift",
      reportedPrice: 0,
      encumbrance: 0,
      standardValue: 200_000_000,
    }));
    // encumbrance=0이면 calcGratuitousTaxBase 경로
    expect(result.method).toBe("standard_value");
  });
});

// ============================================================
// 특수관계인 거래
// ============================================================

describe("determineTaxBase — 특수관계인 거래", () => {
  it("신고가가 시가의 70%~130% 이내: 신고가 사용", () => {
    const result = determineTaxBase(base({
      reportedPrice: 400_000_000,
      marketValue: 500_000_000, // 70% = 350,000,000 / 130% = 650,000,000
      isRelatedParty: true,
    }));
    expect(result.method).toBe("actual_price");
    expect(result.taxBase).toBe(400_000_000);
  });

  it("신고가 < 시가의 70%: 시가인정액 사용", () => {
    const result = determineTaxBase(base({
      reportedPrice: 300_000_000, // 500,000,000의 60%
      marketValue: 500_000_000,
      isRelatedParty: true,
    }));
    expect(result.method).toBe("recognized_market");
    expect(result.taxBase).toBe(500_000_000);
  });

  it("시가 없음: 신고가 사용 + 경고", () => {
    const result = determineTaxBase(base({
      reportedPrice: 200_000_000,
      isRelatedParty: true,
    }));
    expect(result.method).toBe("actual_price");
    expect(result.warnings.some(w => w.includes("시가 산정 불가"))).toBe(true);
  });
});

// ============================================================
// 연부취득
// ============================================================

describe("determineTaxBase — 연부취득", () => {
  it("회차별 지급액 합산을 과세표준으로 사용", () => {
    const result = determineTaxBase(base({
      acquisitionCause: "purchase",
      reportedPrice: 0,
      installments: [
        { amount: 100_000_000, paymentDate: "2024-01-01" },
        { amount: 200_000_000, paymentDate: "2024-07-01" },
        { amount: 150_000_000, paymentDate: "2025-01-01" },
      ],
    }));
    expect(result.method).toBe("installment");
    expect(result.taxBase).toBe(450_000_000);
  });
});

// ============================================================
// 간주취득
// ============================================================

describe("determineTaxBase — 간주취득", () => {
  it("과점주주 간주취득: reportedPrice(차액)를 과세표준으로 사용", () => {
    const result = determineTaxBase(base({
      acquisitionCause: "deemed_major_shareholder",
      reportedPrice: 80_000_000, // 간주취득 차액
    }));
    expect(result.method).toBe("deemed_difference");
    expect(result.taxBase).toBe(80_000_000);
  });

  it("지목변경 간주취득", () => {
    const result = determineTaxBase(base({
      propertyType: "land",
      acquisitionCause: "deemed_land_category",
      reportedPrice: 30_000_000,
    }));
    expect(result.method).toBe("deemed_difference");
    expect(result.taxBase).toBe(30_000_000);
  });
});
