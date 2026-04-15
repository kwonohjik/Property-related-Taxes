/**
 * 취득세 계산 엔진 통합 테스트
 *
 * 주요 시나리오:
 * - 주택 유상취득 (6억 이하 / 선형보간 / 9억 초과)
 * - 다주택 중과세 (조정대상지역 2주택 8% / 3주택+ 12%)
 * - 법인 주택 중과 (12%)
 * - 무상취득 (상속 / 증여)
 * - 원시취득 (신축)
 * - 비과세 (정부 취득)
 * - 부담부증여 분리 계산
 * - 생애최초 감면
 * - 간주취득 (과점주주)
 * - 농지 상속 특례 (2.3%)
 */

import { describe, it, expect } from "vitest";
import { calcAcquisitionTax } from "../../lib/tax-engine/acquisition-tax";
import { linearInterpolationRate, calcRuralSpecialTax } from "../../lib/tax-engine/acquisition-tax-rate";
import type { AcquisitionTaxInput } from "../../lib/tax-engine/types/acquisition.types";

// ============================================================
// 선형보간 세율 단위 테스트
// ============================================================

describe("linearInterpolationRate", () => {
  it("6억 이하: 1%", () => {
    expect(linearInterpolationRate(600_000_000)).toBe(0.01);
  });

  it("6억 1원 초과: 선형보간 적용 (소수 5자리 반올림으로 여전히 1.000%)", () => {
    // 600_000_001원은 1원 차이로 rate가 0.01000에 극히 가깝기 때문에
    // 5자리 반올림 시 0.01000 = 0.01 (테스트: 범위 안에 있음)
    const rate = linearInterpolationRate(600_000_001);
    expect(rate).toBeGreaterThanOrEqual(0.01);
    expect(rate).toBeLessThan(0.03);
  });

  it("7억: 약 1.66667%", () => {
    const rate = linearInterpolationRate(700_000_000);
    expect(rate).toBeCloseTo(0.01667, 4);
  });

  it("7.5억: 2%", () => {
    const rate = linearInterpolationRate(750_000_000);
    expect(rate).toBeCloseTo(0.02, 5);
  });

  it("9억 이상: 3%", () => {
    expect(linearInterpolationRate(900_000_000)).toBe(0.03);
    expect(linearInterpolationRate(1_000_000_000)).toBe(0.03);
  });

  it("8억: 2% 초과 3% 미만", () => {
    // 8억은 명확히 선형보간 구간 중간값
    const rate = linearInterpolationRate(800_000_000);
    expect(rate).toBeGreaterThan(0.02);
    expect(rate).toBeLessThan(0.03);
  });
});

// ============================================================
// 농어촌특별세 단위 테스트
// ============================================================

describe("calcRuralSpecialTax", () => {
  it("85㎡ 이하 주택: 0원 (면적 면제)", () => {
    const result = calcRuralSpecialTax({
      taxBase: 1_000_000_000,
      appliedRate: 0.03,
      acquisitionTax: 30_000_000,
      areaSqm: 84,
      propertyType: "housing",
    });
    expect(result).toBe(0);
  });

  it("세율 2% 이하: 0원", () => {
    const result = calcRuralSpecialTax({
      taxBase: 500_000_000,
      appliedRate: 0.01,
      acquisitionTax: 5_000_000,
      areaSqm: 100,
      propertyType: "housing",
    });
    expect(result).toBe(0);
  });

  it("세율 3%, 100㎡: 취득가액 × 1% × 10% = 과세표준 × 0.1%", () => {
    const taxBase = 1_000_000_000;
    const result = calcRuralSpecialTax({
      taxBase,
      appliedRate: 0.03,
      acquisitionTax: 30_000_000,
      areaSqm: 100,
      propertyType: "housing",
    });
    // (0.03 - 0.02) × 1,000,000,000 × 0.10 = 1,000,000
    expect(result).toBe(1_000_000);
  });

  it("세율 8% (중과), 100㎡: (8% - 2%) × 1억 × 10%", () => {
    const taxBase = 100_000_000;
    const result = calcRuralSpecialTax({
      taxBase,
      appliedRate: 0.08,
      acquisitionTax: 8_000_000,
      areaSqm: 100,
      propertyType: "housing",
    });
    // (0.08 - 0.02) × 100,000,000 × 0.10 = 600,000
    expect(result).toBe(600_000);
  });
});

// ============================================================
// 취득세 통합 계산 테스트
// ============================================================

const baseInput: Partial<AcquisitionTaxInput> = {
  acquiredBy: "individual",
  balancePaymentDate: "2024-03-15",
  registrationDate: "2024-03-20",
};

describe("calcAcquisitionTax — 주택 유상취득", () => {
  it("5억 주택 (1주택, 비조정지역): 취득세 1%", () => {
    const input: AcquisitionTaxInput = {
      ...baseInput as AcquisitionTaxInput,
      propertyType: "housing",
      acquisitionCause: "purchase",
      reportedPrice: 500_000_000,
      standardValue: 450_000_000,
      houseCountAfter: 1,
      isRegulatedArea: false,
    };

    const result = calcAcquisitionTax(input);

    expect(result.appliedRate).toBe(0.01);
    expect(result.acquisitionTax).toBe(5_000_000);
    expect(result.isSurcharged).toBe(false);
    expect(result.isExempt).toBe(false);
  });

  it("7억 주택 선형보간 세율: 약 1.66667%", () => {
    const input: AcquisitionTaxInput = {
      ...baseInput as AcquisitionTaxInput,
      propertyType: "housing",
      acquisitionCause: "purchase",
      reportedPrice: 700_000_000,
      standardValue: 600_000_000,
      houseCountAfter: 1,
      isRegulatedArea: false,
    };

    const result = calcAcquisitionTax(input);

    expect(result.rateType).toBe("linear_interpolation");
    expect(result.acquisitionTax).toBe(Math.floor(700_000_000 * linearInterpolationRate(700_000_000)));
    expect(result.isSurcharged).toBe(false);
  });

  it("10억 주택 (1주택, 비조정지역): 취득세 3%", () => {
    const input: AcquisitionTaxInput = {
      ...baseInput as AcquisitionTaxInput,
      propertyType: "housing",
      acquisitionCause: "purchase",
      reportedPrice: 1_000_000_000,
      standardValue: 900_000_000,
      houseCountAfter: 1,
      isRegulatedArea: false,
    };

    const result = calcAcquisitionTax(input);

    expect(result.appliedRate).toBe(0.03);
    expect(result.acquisitionTax).toBe(30_000_000);
  });
});

describe("calcAcquisitionTax — 다주택 중과", () => {
  it("조정대상지역 2주택: 8% 중과", () => {
    const input: AcquisitionTaxInput = {
      ...baseInput as AcquisitionTaxInput,
      propertyType: "housing",
      acquisitionCause: "purchase",
      reportedPrice: 500_000_000,
      standardValue: 450_000_000,
      houseCountAfter: 2,
      isRegulatedArea: true,
    };

    const result = calcAcquisitionTax(input);

    expect(result.isSurcharged).toBe(true);
    expect(result.appliedRate).toBe(0.08);
    expect(result.acquisitionTax).toBe(500_000_000 * 0.08);
  });

  it("조정대상지역 3주택: 12% 중과", () => {
    const input: AcquisitionTaxInput = {
      ...baseInput as AcquisitionTaxInput,
      propertyType: "housing",
      acquisitionCause: "purchase",
      reportedPrice: 400_000_000,
      standardValue: 350_000_000,
      houseCountAfter: 3,
      isRegulatedArea: true,
    };

    const result = calcAcquisitionTax(input);

    expect(result.isSurcharged).toBe(true);
    expect(result.appliedRate).toBe(0.12);
    expect(result.acquisitionTax).toBe(400_000_000 * 0.12);
  });

  it("비조정지역 2주택: 기본세율 (중과 없음)", () => {
    const input: AcquisitionTaxInput = {
      ...baseInput as AcquisitionTaxInput,
      propertyType: "housing",
      acquisitionCause: "purchase",
      reportedPrice: 500_000_000,
      standardValue: 450_000_000,
      houseCountAfter: 2,
      isRegulatedArea: false,
    };

    const result = calcAcquisitionTax(input);

    expect(result.isSurcharged).toBe(false);
    expect(result.appliedRate).toBe(0.01);
  });
});

describe("calcAcquisitionTax — 법인 중과", () => {
  it("법인 주택 매매: 12% 중과", () => {
    const input: AcquisitionTaxInput = {
      ...baseInput as AcquisitionTaxInput,
      propertyType: "housing",
      acquisitionCause: "purchase",
      reportedPrice: 800_000_000,
      standardValue: 700_000_000,
      acquiredBy: "corporation",
      houseCountAfter: 1,
      isRegulatedArea: false,
    };

    const result = calcAcquisitionTax(input);

    expect(result.isSurcharged).toBe(true);
    expect(result.appliedRate).toBe(0.12);
    expect(result.rateType).toBe("surcharge_corporate");
  });
});

describe("calcAcquisitionTax — 무상취득", () => {
  it("주택 상속: 2.8%", () => {
    const input: AcquisitionTaxInput = {
      acquiredBy: "individual",
      propertyType: "housing",
      acquisitionCause: "inheritance",
      reportedPrice: 0,
      standardValue: 500_000_000,
      balancePaymentDate: "2024-01-10",
    };

    const result = calcAcquisitionTax(input);

    expect(result.appliedRate).toBe(0.028);
    expect(result.acquisitionTax).toBe(Math.floor(500_000_000 * 0.028));
  });

  it("농지 상속: 2.3% 특례", () => {
    const input: AcquisitionTaxInput = {
      acquiredBy: "individual",
      propertyType: "land_farmland",
      acquisitionCause: "inheritance_farmland",
      reportedPrice: 0,
      standardValue: 100_000_000,
      balancePaymentDate: "2024-01-10",
    };

    const result = calcAcquisitionTax(input);

    expect(result.appliedRate).toBe(0.023);
    expect(result.acquisitionTax).toBe(Math.floor(100_000_000 * 0.023));
  });

  it("주택 증여: 3.5%", () => {
    const input: AcquisitionTaxInput = {
      acquiredBy: "individual",
      propertyType: "housing",
      acquisitionCause: "gift",
      reportedPrice: 0,
      standardValue: 600_000_000,
      contractDate: "2024-02-01",
    };

    const result = calcAcquisitionTax(input);

    expect(result.appliedRate).toBe(0.035);
    expect(result.acquisitionTax).toBe(Math.floor(600_000_000 * 0.035));
  });
});

describe("calcAcquisitionTax — 원시취득 (신축)", () => {
  it("신축: 공사비 × 2.8%", () => {
    const input: AcquisitionTaxInput = {
      acquiredBy: "individual",
      propertyType: "housing",
      acquisitionCause: "new_construction",
      reportedPrice: 0,
      constructionCost: 300_000_000,
      usageApprovalDate: "2024-05-20",
    };

    const result = calcAcquisitionTax(input);

    expect(result.appliedRate).toBe(0.028);
    expect(result.acquisitionTax).toBe(Math.floor(300_000_000 * 0.028));
    expect(result.taxBaseMethod).toBe("construction_cost");
  });
});

describe("calcAcquisitionTax — 비과세", () => {
  it("정부 취득: 비과세", () => {
    const input: AcquisitionTaxInput = {
      acquiredBy: "government",
      propertyType: "housing",
      acquisitionCause: "purchase",
      reportedPrice: 500_000_000,
      balancePaymentDate: "2024-03-01",
    };

    const result = calcAcquisitionTax(input);

    expect(result.isExempt).toBe(true);
    expect(result.totalTax).toBe(0);
    expect(result.exemptionType).toBe("government_acquisition");
  });
});

describe("calcAcquisitionTax — 부담부증여", () => {
  it("시가 10억, 채무 4억: 유상 4억(매매세율) + 무상 6억(증여세율)", () => {
    const input: AcquisitionTaxInput = {
      acquiredBy: "individual",
      propertyType: "housing",
      acquisitionCause: "burdened_gift",
      reportedPrice: 0,
      marketValue: 1_000_000_000,
      encumbrance: 400_000_000,
      contractDate: "2024-04-01",
    };

    const result = calcAcquisitionTax(input);

    expect(result.burdenedGiftBreakdown).toBeDefined();
    const bd = result.burdenedGiftBreakdown!;
    expect(bd.onerousTaxBase).toBe(400_000_000);
    expect(bd.gratuitousTaxBase).toBe(600_000_000);
    // 유상: 4억 채무, 전체 시가 10억 기준 세율 3% → 4억 × 3% = 12,000,000
    // (지방세법: 부담부증여 유상분 세율은 전체 취득가액 기준 결정)
    expect(bd.onerousTax).toBe(12_000_000);
    // 무상: 6억 × 3.5% = 21,000,000
    expect(bd.gratuitousTax).toBe(21_000_000);
    expect(result.acquisitionTax).toBe(33_000_000);
  });
});

describe("calcAcquisitionTax — 생애최초 감면", () => {
  it("3억 주택 생애최초 (비수도권): 최대 200만원 감면", () => {
    const input: AcquisitionTaxInput = {
      ...baseInput as AcquisitionTaxInput,
      propertyType: "housing",
      acquisitionCause: "purchase",
      reportedPrice: 250_000_000,
      standardValue: 200_000_000,
      houseCountAfter: 1,
      isRegulatedArea: false,
      isFirstHome: true,
      isMetropolitan: false,
    };

    const result = calcAcquisitionTax(input);

    // 취득세 250,000,000 × 1% = 2,500,000
    // 감면 = min(2,500,000, 2,000,000) = 2,000,000
    expect(result.reductionType).toBe("first_home");
    expect(result.reductionAmount).toBe(2_000_000);
    expect(result.totalTaxAfterReduction).toBe(result.totalTax - 2_000_000);
  });

  it("4억 주택 생애최초 (비수도권 한도 초과): 감면 불가", () => {
    const input: AcquisitionTaxInput = {
      ...baseInput as AcquisitionTaxInput,
      propertyType: "housing",
      acquisitionCause: "purchase",
      reportedPrice: 400_000_000,
      standardValue: 350_000_000,
      houseCountAfter: 1,
      isRegulatedArea: false,
      isFirstHome: true,
      isMetropolitan: false,
    };

    const result = calcAcquisitionTax(input);

    expect(result.reductionAmount).toBe(0);
  });
});

describe("calcAcquisitionTax — 간주취득 (과점주주)", () => {
  it("비상장 법인 과점주주 최초 취득: 전체 지분율 기준 과세", () => {
    const input: AcquisitionTaxInput = {
      acquiredBy: "individual",
      propertyType: "housing",
      acquisitionCause: "deemed_major_shareholder",
      reportedPrice: 0,
      deemedInput: {
        majorShareholder: {
          corporateAssetValue: 1_000_000_000,
          prevShareRatio: 0.3,
          newShareRatio: 0.6,
          isListed: false,
        },
      },
      contractDate: "2024-06-01",
    };

    const result = calcAcquisitionTax(input);

    // 과세표준 = 1,000,000,000 × 0.6 = 600,000,000
    expect(result.taxBase).toBe(600_000_000);
    expect(result.isSurcharged).toBe(false);
  });

  it("상장법인 과점주주: 비과세", () => {
    const input: AcquisitionTaxInput = {
      acquiredBy: "individual",
      propertyType: "housing",
      acquisitionCause: "deemed_major_shareholder",
      reportedPrice: 0,
      deemedInput: {
        majorShareholder: {
          corporateAssetValue: 1_000_000_000,
          prevShareRatio: 0.3,
          newShareRatio: 0.6,
          isListed: true,
        },
      },
      contractDate: "2024-06-01",
    };

    const result = calcAcquisitionTax(input);

    expect(result.totalTax).toBe(0);
  });
});

describe("calcAcquisitionTax — 부가세 검증", () => {
  it("주택 9억 초과: 지방교육세 = 과세표준 × 2% × 20%", () => {
    const taxBase = 1_000_000_000;
    const input: AcquisitionTaxInput = {
      ...baseInput as AcquisitionTaxInput,
      propertyType: "housing",
      acquisitionCause: "purchase",
      reportedPrice: taxBase,
      standardValue: 900_000_000,
      houseCountAfter: 1,
      isRegulatedArea: false,
    };

    const result = calcAcquisitionTax(input);

    // 지방교육세 = 1,000,000,000 × 0.02 × 0.20 = 4,000,000
    expect(result.localEducationTax).toBe(4_000_000);
  });

  it("주택 85㎡ 이하 주택: 농특세 0원", () => {
    const input: AcquisitionTaxInput = {
      ...baseInput as AcquisitionTaxInput,
      propertyType: "housing",
      acquisitionCause: "purchase",
      reportedPrice: 1_000_000_000,
      standardValue: 900_000_000,
      areaSqm: 84,
      houseCountAfter: 1,
      isRegulatedArea: false,
    };

    const result = calcAcquisitionTax(input);

    expect(result.ruralSpecialTax).toBe(0);
  });
});

describe("calcAcquisitionTax — 취득 시기 및 신고 기한", () => {
  it("잔금일과 등기일 중 빠른 날이 취득일", () => {
    const input: AcquisitionTaxInput = {
      acquiredBy: "individual",
      propertyType: "housing",
      acquisitionCause: "purchase",
      reportedPrice: 500_000_000,
      standardValue: 450_000_000,
      balancePaymentDate: "2024-03-10",
      registrationDate: "2024-03-20",
    };

    const result = calcAcquisitionTax(input);

    expect(result.acquisitionDate).toBe("2024-03-10");
  });

  it("신고 기한 = 취득일 + 60일", () => {
    const input: AcquisitionTaxInput = {
      acquiredBy: "individual",
      propertyType: "housing",
      acquisitionCause: "purchase",
      reportedPrice: 500_000_000,
      balancePaymentDate: "2024-01-01",
    };

    const result = calcAcquisitionTax(input);

    expect(result.filingDeadline).toBe("2024-03-01");
  });
});
