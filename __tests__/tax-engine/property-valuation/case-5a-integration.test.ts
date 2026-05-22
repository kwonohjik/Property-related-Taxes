/**
 * Phase 5-A 통합 anchor — V2 입력 자동 통합 + Validation + Zod
 *
 * 검증 대상:
 *   - evaluateAllEstateItems → V2 입력 자동 평가
 *   - validateUnlistedStockV2 (lib/calc/inheritance-validate.ts)
 *   - unlistedStockValuationV2Schema (lib/validators/unlisted-stock-valuation-v2.schema.ts)
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-valuation-besshi-4-buppyo-3.plan.md
 */

import { describe, it, expect } from "vitest";
import { evaluateAllEstateItems } from "@/lib/tax-engine/property-valuation";
import { validateUnlistedStockV2 } from "@/lib/calc/inheritance-validate";
import { unlistedStockValuationV2Schema } from "@/lib/validators/unlisted-stock-valuation-v2.schema";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

// 사례 6 V2 입력 (PDF p1541~1548)
const case6V2Item: EstateItem = {
  id: "stock-1",
  name: "㈜향기 비상장주식",
  category: "unlisted_stock",
  unlistedStockValuationV2: {
    corpName: "㈜향기",
    businessStartDate: new Date("2000-01-01"),
    evaluationDate: new Date("2024-01-20"),
    faceValuePerShare: 5_000,
    totalShares: 50_000,
    ownedShares: 26_000,
    isRealEstateHeavy: false,
    fiscalYears: [
      { fiscalYearLabel: "2023", fiscalYearEndDate: new Date("2023-12-31"), taxableIncome: 76_842_660 },
      { fiscalYearLabel: "2022", fiscalYearEndDate: new Date("2022-12-31"), taxableIncome: 62_416_500 },
      { fiscalYearLabel: "2021", fiscalYearEndDate: new Date("2021-12-31"), taxableIncome: -5_311_910 },
    ],
    capitalChanges: [],
    netAssetValueRaw: {
      bsTotalAssets: 2_476_889_520,
      assetValuationDelta: 91_548_350,
      corpTaxReservedAmount: 0,
      paidInCapitalIncrease: 0,
      otherEarnedRights: 0,
      prepaidExpenses: 65_400_500,
      preGiftRetainedEarnings: 0,
      bsTotalLiabilities: 1_833_780_000,
      corporateTaxPayable: 32_627_890,
      farmingSurtax: 0,
      localIncomeTax: 3_262_780,
      dividendPayable: 0,
      retirementProvision: 445_785_000,
      otherProvision: 0,
      reserveExcluded: 0,
      allowanceExcluded: 301_770_000,
      deferredTaxAdjustment: 0,
    },
    isContinuousLossLastThreeYears: false,
    capitalizationRate: 0.10,
    isMaxShareholder: true,
    companySize: "large",
  },
};

// ============================================================
// V2 입력 자동 평가 통합
// ============================================================

describe("[5-A] evaluateAllEstateItems — V2 입력 자동 평가", () => {
  it("V2 입력이 있는 unlisted_stock은 자동 평가 (PropertyValuationResult 반환)", () => {
    const results = evaluateAllEstateItems([case6V2Item]);
    expect(results.length).toBe(1);
    expect(results[0].estateItemId).toBe("stock-1");
    expect(results[0].method).toBe("book_value");
    // 사례 6 anchor: 340,392,000원
    expect(results[0].valuatedAmount).toBe(340_392_000);
  });

  it("breakdown에 1주당 순자산·순손익·평가액·할증·총 평가액 포함", () => {
    const results = evaluateAllEstateItems([case6V2Item]);
    const labels = results[0].breakdown.map((b) => b.label);
    expect(labels).toContain("1주당 순자산가치 ④");
    expect(labels).toContain("1주당 순손익가치 ⑤");
    expect(labels).toContain("1주당 평가액 ⑥");
    expect(labels).toContain("보유 주식수");
    expect(labels).toContain("비상장주식 V2 평가액");
    // 일반기업 → 할증 ×120% 포함
    expect(labels.some((l) => l.includes("최대주주 할증평가"))).toBe(true);
  });

  it("V2 입력 없는 unlisted_stock은 기존 동작 (필터에서 제외)", () => {
    const legacyItem: EstateItem = {
      id: "stock-legacy",
      name: "legacy",
      category: "unlisted_stock",
      unlistedStockData: {
        totalShares: 10_000,
        ownedShares: 5_000,
        weightedNetIncome: 0,
        netAssetValue: 100_000_000,
        capitalizationRate: 0.10,
      },
    };
    const results = evaluateAllEstateItems([legacyItem]);
    // 기존 동작 — 필터에서 제외 (호출부에서 별도 처리)
    expect(results.length).toBe(0);
  });

  it("V2 + 다른 자산 혼합 — V2만 결과에 포함", () => {
    const cashItem: EstateItem = {
      id: "cash-1",
      name: "현금",
      category: "cash",
      marketValue: 50_000_000,
    };
    const results = evaluateAllEstateItems([case6V2Item, cashItem]);
    expect(results.length).toBe(2);
    const totalSum = results.reduce((s, r) => s + r.valuatedAmount, 0);
    expect(totalSum).toBe(340_392_000 + 50_000_000); // V2 + 현금
  });
});

// ============================================================
// validateUnlistedStockV2 — UI 통과 ↔ validate 차단 정합성
// ============================================================

describe("[⑧] validateUnlistedStockV2", () => {
  it("V1·V2 모두 없으면 차단", () => {
    const item: EstateItem = {
      id: "x",
      name: "test",
      category: "unlisted_stock",
    };
    expect(validateUnlistedStockV2(item)).toMatch(/legacy 입력 또는 V2 입력 중 하나는 필수/);
  });

  it("V2 정상 입력 통과", () => {
    expect(validateUnlistedStockV2(case6V2Item)).toBeNull();
  });

  it("사업연도 종료일 순서 역전 차단", () => {
    const item: EstateItem = {
      ...case6V2Item,
      unlistedStockValuationV2: {
        ...case6V2Item.unlistedStockValuationV2!,
        fiscalYears: [
          { fiscalYearLabel: "2021", fiscalYearEndDate: new Date("2021-12-31"), taxableIncome: 0 },
          { fiscalYearLabel: "2022", fiscalYearEndDate: new Date("2022-12-31"), taxableIncome: 0 },
          { fiscalYearLabel: "2023", fiscalYearEndDate: new Date("2023-12-31"), taxableIncome: 0 },
        ],
      },
    };
    expect(validateUnlistedStockV2(item)).toMatch(/2년전 사업연도 종료일은 1년전보다 이전/);
  });

  it("소유주식수 > 발행주식총수 차단", () => {
    const item: EstateItem = {
      ...case6V2Item,
      unlistedStockValuationV2: {
        ...case6V2Item.unlistedStockValuationV2!,
        ownedShares: 60_000, // 50,000 초과
      },
    };
    expect(validateUnlistedStockV2(item)).toMatch(/보유주식수.*발행주식총수.*초과/);
  });

  it("평가기준일 < 사업개시일 차단", () => {
    const item: EstateItem = {
      ...case6V2Item,
      unlistedStockValuationV2: {
        ...case6V2Item.unlistedStockValuationV2!,
        evaluationDate: new Date("1999-01-01"), // 사업개시일 2000-01-01 이전
      },
    };
    expect(validateUnlistedStockV2(item)).toMatch(/평가기준일은 사업개시일 이후/);
  });

  it("자본금 변동일 > 평가기준일 차단", () => {
    const item: EstateItem = {
      ...case6V2Item,
      unlistedStockValuationV2: {
        ...case6V2Item.unlistedStockValuationV2!,
        capitalChanges: [
          {
            changeType: "paid_in",
            changeDate: new Date("2025-01-01"), // 평가기준일 2024-01-20 이후
            sharesIssued: 1000,
            pricePerShare: 5000,
          },
        ],
      },
    };
    expect(validateUnlistedStockV2(item)).toMatch(/자본금 변동일.*평가기준일 이전/);
  });

  it("유상증자(paid_in) 1주당 납입금액 누락 차단 (§56⑤)", () => {
    const item: EstateItem = {
      ...case6V2Item,
      unlistedStockValuationV2: {
        ...case6V2Item.unlistedStockValuationV2!,
        capitalChanges: [
          {
            changeType: "paid_in",
            changeDate: new Date("2023-06-30"),
            sharesIssued: 1000,
            // pricePerShare 누락
          },
        ],
      },
    };
    expect(validateUnlistedStockV2(item)).toMatch(/유상증자.*1주당 납입금액/);
  });

  it("unlisted_stock 아닌 자산은 null 반환 (no-op)", () => {
    const cashItem: EstateItem = { id: "c", name: "cash", category: "cash" };
    expect(validateUnlistedStockV2(cashItem)).toBeNull();
  });
});

// ============================================================
// Zod 스키마 — UI 통과 ↔ Zod 차단 정합성 (⑧ ↔ ⑫)
// ============================================================

describe("[⑨⑩⑫] unlistedStockValuationV2Schema Zod 검증", () => {
  it("사례 6 V2 입력 — 정상 통과", () => {
    const result = unlistedStockValuationV2Schema.safeParse(case6V2Item.unlistedStockValuationV2);
    expect(result.success).toBe(true);
  });

  it("netAssetOnlyReason — 4호(stock_80) 제거 → 5호(stock_holding_80) 통과", () => {
    const input = {
      ...case6V2Item.unlistedStockValuationV2!,
      netAssetOnlyReason: "stock_holding_80" as const,
    };
    expect(unlistedStockValuationV2Schema.safeParse(input).success).toBe(true);
  });

  it("companySize 3종 모두 통과", () => {
    for (const size of ["small", "medium", "large"] as const) {
      const input = { ...case6V2Item.unlistedStockValuationV2!, companySize: size };
      expect(unlistedStockValuationV2Schema.safeParse(input).success).toBe(true);
    }
  });

  it("changeType 3종 모두 통과 (유상증자 pricePerShare 필수)", () => {
    const input = {
      ...case6V2Item.unlistedStockValuationV2!,
      capitalChanges: [
        { changeType: "paid_in" as const, changeDate: new Date("2023-06-30"), sharesIssued: 1000, pricePerShare: 5000 },
        { changeType: "free_issue" as const, changeDate: new Date("2023-10-30"), sharesIssued: 500 },
        { changeType: "capital_reduction" as const, changeDate: new Date("2022-05-01"), sharesIssued: 200, pricePerShare: 5000 },
      ],
    };
    expect(unlistedStockValuationV2Schema.safeParse(input).success).toBe(true);
  });

  it("잘못된 netAssetOnlyReason (구 4호 'stock_80') 차단", () => {
    const input = {
      ...case6V2Item.unlistedStockValuationV2!,
      netAssetOnlyReason: "stock_80", // 구 4호 — 삭제됨
    };
    expect(unlistedStockValuationV2Schema.safeParse(input).success).toBe(false);
  });

  it("Date 강제 변환 (z.coerce.date) — string 입력 허용", () => {
    const input = {
      ...case6V2Item.unlistedStockValuationV2!,
      evaluationDate: "2024-01-20" as unknown as Date, // JSON 경유 string
    };
    const result = unlistedStockValuationV2Schema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.evaluationDate).toBeInstanceOf(Date);
    }
  });
});
