import { describe, it, expect } from "vitest";
import {
  calcAppraisalFeeDeduction,
  APPRAISAL_FEE_LIMITS,
} from "@/lib/tax-engine/deductions/appraisal-fee-deduction";
import { calcInheritanceTax } from "@/lib/tax-engine/inheritance-tax";
import { calcGiftTax } from "@/lib/tax-engine/gift-tax";
import type {
  InheritanceTaxInput,
  GiftTaxInput,
} from "@/lib/tax-engine/types/inheritance-gift.types";

// 감정평가수수료 공제 (상속 §20의3 / 증여 §46의2 준용)
// 설계: docs/02-design/features/appraisal-fee-deduction.engine.design.md

describe("감정평가수수료 공제 — calcAppraisalFeeDeduction (AF-1~8)", () => {
  const INH = { hasAppraisalValuation: true, taxType: "inheritance" as const };
  const INH_NO_APPRAISAL = { hasAppraisalValuation: false, taxType: "inheritance" as const };

  it("[AF-1] 부동산 감정 300만 + 감정가 신고 → 전액 300만", () => {
    const r = calcAppraisalFeeDeduction({ realEstateAppraisalFee: 3_000_000 }, INH);
    expect(r.total).toBe(3_000_000);
    expect(r.breakdown).toHaveLength(1);
    expect(r.breakdown[0].amount).toBe(3_000_000);
  });

  it("[AF-2] 부동산 감정 700만(한도 초과) → 500만 cap", () => {
    const r = calcAppraisalFeeDeduction({ realEstateAppraisalFee: 7_000_000 }, INH);
    expect(r.total).toBe(5_000_000);
    expect(r.total).toBe(APPRAISAL_FEE_LIMITS.REAL_ESTATE);
  });

  it("[AF-3] 부동산 감정 300만 + 감정가 미신고 → 0 + 경고(§20의3②)", () => {
    const r = calcAppraisalFeeDeduction({ realEstateAppraisalFee: 3_000_000 }, INH_NO_APPRAISAL);
    expect(r.total).toBe(0);
    expect(r.breakdown).toHaveLength(0);
    expect(r.warnings.some((w) => w.includes("§20의3②"))).toBe(true);
  });

  it("[AF-4] 비상장 신용평가 1,500만(법인1·기관1) → 1천만 cap", () => {
    const r = calcAppraisalFeeDeduction(
      { unlistedStockAppraisalFee: 15_000_000, unlistedTargetCount: 1, unlistedAgencyCount: 1 },
      INH,
    );
    expect(r.total).toBe(10_000_000);
  });

  it("[AF-5] 비상장 1,500만(법인2·기관1) → 한도 2천만 → 1,500만 전액", () => {
    const r = calcAppraisalFeeDeduction(
      { unlistedStockAppraisalFee: 15_000_000, unlistedTargetCount: 2, unlistedAgencyCount: 1 },
      INH,
    );
    expect(r.total).toBe(15_000_000);
  });

  it("[AF-6] 서화·골동품 700만 → 500만 cap", () => {
    const r = calcAppraisalFeeDeduction({ tangibleAppraisalFee: 7_000_000 }, INH);
    expect(r.total).toBe(5_000_000);
  });

  it("[AF-7] 3종 동시(부동산500만+비상장1천만+서화500만) → 2,000만", () => {
    const r = calcAppraisalFeeDeduction(
      {
        realEstateAppraisalFee: 5_000_000,
        unlistedStockAppraisalFee: 10_000_000,
        tangibleAppraisalFee: 5_000_000,
      },
      INH,
    );
    expect(r.total).toBe(20_000_000);
    expect(r.breakdown).toHaveLength(3);
  });

  it("[AF-8] 미입력(undefined) → 0 (회귀 가드)", () => {
    expect(calcAppraisalFeeDeduction(undefined, INH).total).toBe(0);
    expect(calcAppraisalFeeDeduction({}, INH).total).toBe(0);
  });

  it("[AF-증여] taxType=gift → lawRef §46의2 준용 표기", () => {
    const r = calcAppraisalFeeDeduction(
      { realEstateAppraisalFee: 3_000_000 },
      { hasAppraisalValuation: true, taxType: "gift" },
    );
    expect(r.total).toBe(3_000_000);
    expect(r.breakdown[0].lawRef).toContain("§46의2");
    expect(r.breakdown[0].lawRef).toContain("준용");
  });
});

describe("감정평가수수료 — 엔진 통합 (AF-9~11)", () => {
  // 과세가액 = 토지 10억 − 장례비 최소 500만(§14, 증빙 무관) = 995,000,000
  it("[AF-9] 상속 과세표준 = 과세가액9.95억 − 공제5억 − 수수료500만 = 490,000,000", () => {
    const input: InheritanceTaxInput = {
      decedentType: "resident",
      deathDate: "2024-05-01",
      estateItems: [
        {
          id: "e1",
          category: "real_estate_land",
          name: "토지",
          marketValue: 1_000_000_000,
          valuationMethod: "appraisal", // §20의3② eligibility 충족
        },
      ],
      funeralExpense: 0,
      funeralIncludesBongan: false,
      debts: 0,
      preGiftsWithin10Years: [],
      heirs: [{ id: "h1", relation: "child" }],
      deductionInput: { heirs: [{ id: "h1", relation: "child" }] },
      creditInput: { isFiledOnTime: false },
      appraisalFee: { realEstateAppraisalFee: 5_000_000 },
    };
    const r = calcInheritanceTax(input);
    expect(r.appraisalFeeDeduction).toBe(5_000_000);
    // 995,000,000 − 500,000,000 − 5,000,000 = 490,000,000
    expect(r.taxBase).toBe(490_000_000);
  });

  it("[AF-9b] 미입력 시 과세표준 불변 (회귀 가드) — 수수료 차감 0", () => {
    const input: InheritanceTaxInput = {
      decedentType: "resident",
      deathDate: "2024-05-01",
      estateItems: [
        { id: "e1", category: "real_estate_land", name: "토지", marketValue: 1_000_000_000 },
      ],
      funeralExpense: 0,
      funeralIncludesBongan: false,
      debts: 0,
      preGiftsWithin10Years: [],
      heirs: [{ id: "h1", relation: "child" }],
      deductionInput: { heirs: [{ id: "h1", relation: "child" }] },
      creditInput: { isFiledOnTime: false },
    };
    const r = calcInheritanceTax(input);
    expect(r.appraisalFeeDeduction ?? 0).toBe(0);
    // 수수료 미입력 → AF-9 대비 정확히 500만 더 큼(차감 0). 995,000,000 − 500,000,000 = 495,000,000
    expect(r.taxBase).toBe(495_000_000);
  });

  it("[AF-10] 증여 50만 최저한 — (60만 − 수수료20만)=40만 → taxBase 0", () => {
    const input: GiftTaxInput = {
      giftDate: "2024-05-01",
      donorRelation: "lineal_descendant",
      donor: "father",
      giftItems: [{ id: "g1", category: "cash", name: "현금", marketValue: 50_600_000 }],
      priorGiftsWithin10Years: [],
      isGenerationSkip: false,
      isMinorDonee: false,
      deductionInput: { donorRelation: "lineal_descendant" },
      creditInput: { isFiledOnTime: true },
      appraisalFee: { tangibleAppraisalFee: 200_000 },
    };
    const r = calcGiftTax(input);
    expect(r.appraisalFeeDeduction).toBe(200_000);
    expect(r.taxBase).toBe(0);
  });

  it("[AF-11] 증여 ㉙·㉚ 정합 — 과세표준에서 수수료 차감 반영", () => {
    const input: GiftTaxInput = {
      giftDate: "2024-05-01",
      donorRelation: "lineal_descendant",
      donor: "father",
      giftItems: [{ id: "g1", category: "cash", name: "현금", marketValue: 1_000_000_000 }],
      priorGiftsWithin10Years: [],
      isGenerationSkip: false,
      isMinorDonee: false,
      deductionInput: { donorRelation: "lineal_descendant" },
      creditInput: { isFiledOnTime: true },
      // 3호 유형재산 — eligibility 무관, 500만 한도
      appraisalFee: { tangibleAppraisalFee: 5_000_000 },
    };
    const r = calcGiftTax(input);
    // 과세가액 10억 − 직계비속 공제 5천만 − 수수료 500만 = 945,000,000
    expect(r.appraisalFeeDeduction).toBe(5_000_000);
    expect(r.taxBase).toBe(945_000_000);
  });
});
