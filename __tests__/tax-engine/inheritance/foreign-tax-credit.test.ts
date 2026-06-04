import { describe, it, expect } from "vitest";
import { calcForeignTaxCredit } from "@/lib/tax-engine/credits/foreign-tax-credit";
import { calcInheritanceTaxCredits } from "@/lib/tax-engine/inheritance-gift-tax-credit";

// 상증법 §29 / 상증령 §21① — 외국납부세액공제 점유비 한도
// 공제 = Min( ① 산출세액 × (국외 상속재산 과세표준 ÷ 상속세 과세표준) , ② 외국 부과 상속세액 )
// 교재(상속세 실무서) 460–461p 공식 계산사례 anchor.
describe("외국납부세액공제 §29 — 상증령 §21① 점유비 한도 (calcForeignTaxCredit 단위)", () => {
  it("FTC-01: 교재 사례 한도①(3.75억) < 외국세액②(4억) → 공제 375,000,000", () => {
    const r = calcForeignTaxCredit({
      foreignTaxPaid: 400_000_000,
      computedTax: 1_500_000_000,
      foreignInheritanceTaxBase: 1_000_000_000,
      overallTaxBase: 4_000_000_000,
      mode: "inheritance",
    });
    expect(r.creditAmount).toBe(375_000_000);
    expect(r.detail?.creditLimit).toBe(375_000_000);
    expect(r.detail?.computedTax).toBe(1_500_000_000);
    expect(r.detail?.foreignInheritanceTaxBase).toBe(1_000_000_000);
    expect(r.detail?.overallTaxBase).toBe(4_000_000_000);
  });

  it("FTC-02: 외국세액②(3억) < 한도①(3.75억) → 공제 300,000,000", () => {
    const r = calcForeignTaxCredit({
      foreignTaxPaid: 300_000_000,
      computedTax: 1_500_000_000,
      foreignInheritanceTaxBase: 1_000_000_000,
      overallTaxBase: 4_000_000_000,
      mode: "inheritance",
    });
    expect(r.creditAmount).toBe(300_000_000);
  });

  it("FTC-03: 국외 상속재산 과세표준 미입력 → 한도 0 → 공제 0", () => {
    const r = calcForeignTaxCredit({
      foreignTaxPaid: 400_000_000,
      computedTax: 1_500_000_000,
      overallTaxBase: 4_000_000_000,
      mode: "inheritance",
    });
    expect(r.creditAmount).toBe(0);
  });

  it("FTC-04: 전체 과세표준 0 → c=0 방어 → 공제 0", () => {
    const r = calcForeignTaxCredit({
      foreignTaxPaid: 400_000_000,
      computedTax: 1_500_000_000,
      foreignInheritanceTaxBase: 1_000_000_000,
      overallTaxBase: 0,
      mode: "inheritance",
    });
    expect(r.creditAmount).toBe(0);
  });

  it("FTC-05: 국외과표 ≥ 전체과표(비율 100%) → 한도 = 산출세액 전액", () => {
    const r = calcForeignTaxCredit({
      foreignTaxPaid: 1_600_000_000,
      computedTax: 1_500_000_000,
      foreignInheritanceTaxBase: 4_000_000_000,
      overallTaxBase: 4_000_000_000,
      mode: "inheritance",
    });
    expect(r.creditAmount).toBe(1_500_000_000);
  });

  it("FTC-06: 외국세액 0 → 공제 0, detail 없음", () => {
    const r = calcForeignTaxCredit({
      foreignTaxPaid: 0,
      computedTax: 1_500_000_000,
      foreignInheritanceTaxBase: 1_000_000_000,
      overallTaxBase: 4_000_000_000,
      mode: "inheritance",
    });
    expect(r.creditAmount).toBe(0);
    expect(r.detail).toBeUndefined();
  });

  it("FTC-07: 소액 floor 검증 (1001 × 1 ÷ 3 = 333, Math.round 금지)", () => {
    const r = calcForeignTaxCredit({
      foreignTaxPaid: 500,
      computedTax: 1_001,
      foreignInheritanceTaxBase: 1,
      overallTaxBase: 3,
      mode: "inheritance",
    });
    expect(r.creditAmount).toBe(333);
  });

  it("FTC-09: gift §59 — overallTaxBase 미전달 → 한도 = computedTax 전액(회귀 방지)", () => {
    const r = calcForeignTaxCredit({
      foreignTaxPaid: 400_000_000,
      computedTax: 1_500_000_000,
      mode: "gift",
    });
    expect(r.creditAmount).toBe(400_000_000);
    // gift는 점유비 한도 미적용 → detail 없음
    expect(r.detail).toBeUndefined();
  });
});

describe("외국납부세액공제 §29 — 통합 (calcInheritanceTaxCredits, R1 잔액 클램핑)", () => {
  it("FTC-08: §28 증여세액공제 존재 시 — §29 한도는 totalComputedTax(원 산출세액) 기준 + 잔액 클램핑", () => {
    const result = calcInheritanceTaxCredits({
      creditInput: {
        // §28 증여세액공제 발생 (상속인·10년 내·납부세액 有)
        priorGifts: [
          {
            giftDate: "2022-01-01",
            isHeir: true,
            giftAmount: 500_000_000,
            giftTaxPaid: 80_000_000,
          },
        ],
        // §29 — 국외 과세표준 = 전체 과세표준 → 한도 = 산출세액 전액
        foreignTaxPaid: 1_500_000_000,
        foreignInheritanceTaxBase: 4_000_000_000,
        isFiledOnTime: false,
      },
      computedTax: 1_500_000_000,
      generationSkipSurcharge: 0,
      taxableEstateValue: 4_000_000_000,
      taxBase: 4_000_000_000,
      deathDate: "2024-06-01",
    });

    // §28 공제 발생
    expect(result.giftTaxCredit).toBeGreaterThan(0);
    // §29 한도 = §28 차감 前 totalComputedTax(1500M) × (4000M ÷ 4000M) = 1500M (remainingTax 기준 아님)
    expect(result.foreignCreditDetail?.creditLimit).toBe(1_500_000_000);
    expect(result.foreignCreditDetail?.computedTax).toBe(1_500_000_000);
    // 잔액 클램핑: foreignTaxCredit = totalComputedTax − §28 공제 (공제후보 1500M > 잔액)
    expect(result.foreignTaxCredit).toBe(1_500_000_000 - result.giftTaxCredit);
    expect(result.foreignTaxCredit).toBeLessThan(1_500_000_000);
    // echo creditAmount = 클램핑 후 최종
    expect(result.foreignCreditDetail?.creditAmount).toBe(result.foreignTaxCredit);
  });
});
