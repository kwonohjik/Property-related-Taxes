/**
 * 양도세 엔진 종합 감사 (2026-07-03) 수정 회귀 앵커
 *
 * C-1: 분양권 2년 이상 보유 → §104①1호 60% 단일세율 (일반 누진세율 오적용 방지)
 * C-3: 합산과세에서 reducibleIncome 미노출 세액감면(§99 등) 소실 방지
 * H-7: 겸용주택 표2 장기보유공제 — 보유분·거주분 각 40% 상한 (합산 후 80% 오적용 방지)
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import {
  calculateTransferTaxAggregate,
  type AggregateTransferInput,
  type TransferTaxItemInput,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import { calcLongTermRate } from "@/lib/tax-engine/transfer-tax-mixed-use-helpers";
import { makeMockRates, baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";

const R = makeMockRates();

// ─────────────────────────────────────────────────────────────
// C-1: 분양권 2년 이상 보유 → 60% (소득세법 §104①1호)
// ─────────────────────────────────────────────────────────────
describe("C-1 회귀: 분양권 2년 이상 보유 → §104①1호 60% 단일세율", () => {
  it("presale_right 보유 5년(≥2년) 비조정지역 → appliedRate=0.60 (일반 누진세율 아님)", () => {
    const input = baseTransferInput({
      propertyType: "presale_right",
      transferPrice: 600_000_000,
      acquisitionPrice: 300_000_000,
      acquisitionDate: new Date("2019-01-01"),
      transferDate: new Date("2024-06-01"), // 약 5.4년 ≥ 2년
      isRegulatedArea: false,
      isOneHousehold: false,
      householdHousingCount: 0,
      expenses: 0,
      reductions: [],
      annualBasicDeductionUsed: 0,
    });
    const r = calculateTransferTax(input, R);
    // §104①1호: 분양권은 보유기간 무관 60% (수정 전에는 6~45% 일반 누진세율로 fall-through)
    expect(r.appliedRate).toBe(0.6);
    // 분양권 LTHD 배제(§95②) → 차익 3억 − 기본공제 250만 = 과표 297,500,000 → ×0.60
    expect(r.calculatedTax).toBe(178_500_000);
  });

  it("presale_right 1~2년 보유 → 60% (기존 동작 회귀 확인)", () => {
    const input = baseTransferInput({
      propertyType: "presale_right",
      transferPrice: 600_000_000,
      acquisitionPrice: 300_000_000,
      acquisitionDate: new Date("2023-01-01"),
      transferDate: new Date("2024-06-01"), // 약 1.4년 (1~2년)
      isRegulatedArea: false,
      isOneHousehold: false,
      householdHousingCount: 0,
      expenses: 0,
      reductions: [],
      annualBasicDeductionUsed: 0,
    });
    const r = calculateTransferTax(input, R);
    expect(r.appliedRate).toBe(0.6);
  });
});

// ─────────────────────────────────────────────────────────────
// C-3: 합산과세 세액감면 소실 방지
// ─────────────────────────────────────────────────────────────
describe("C-3 회귀: 합산과세에서 reducibleIncome 미노출 세액감면 소실 방지", () => {
  it("신축주택(§99) 100% 감면 1건 합산 → reductionAmount = 단건 엔진과 동일(소실 0 아님)", () => {
    const assetOverride = {
      propertyType: "housing" as const,
      transferPrice: 800_000_000,
      acquisitionPrice: 300_000_000,
      acquisitionDate: new Date("2019-06-01"),
      transferDate: new Date("2024-06-01"),
      isOneHousehold: false,
      householdHousingCount: 0,
      expenses: 0,
      reductions: [{ type: "new_housing" as const, region: "non_metropolitan" as const }],
      annualBasicDeductionUsed: 0,
    };

    // 단건 엔진 기준값
    const single = calculateTransferTax(baseTransferInput(assetOverride), R);
    expect(single.reductionAmount).toBeGreaterThan(0);

    // 합산 엔진(1건)
    const base = baseTransferInput();
    const input: AggregateTransferInput = {
      taxYear: 2024,
      annualBasicDeductionUsed: 0,
      properties: [
        {
          ...(base as unknown as TransferTaxItemInput),
          propertyId: "A",
          propertyLabel: "신축주택 A",
          ...assetOverride,
        },
      ],
    };
    const agg = calculateTransferTaxAggregate(input, R);
    // 수정 전: reducibleIncome 미노출 → 재계산·레거시 양쪽 탈락 → reductionAmount = 0 (소실)
    expect(agg.reductionAmount).toBeGreaterThan(0);
    expect(agg.reductionAmount).toBe(single.reductionAmount);
  });
});

// ─────────────────────────────────────────────────────────────
// H-7: 겸용주택 표2 LTHD 보유분·거주분 각 40% 상한
// ─────────────────────────────────────────────────────────────
describe("H-7 회귀: calcLongTermRate 표2 — 보유분·거주분 각 40% 상한 후 합산", () => {
  it("보유 15년·거주 3년 → 40% + 12% = 52% (합산 후 80% 상한 오적용 시 72%)", () => {
    expect(calcLongTermRate(15, 3, true)).toBeCloseTo(0.52, 10);
  });
  it("보유 18년·거주 2년 → 40% + 8% = 48%", () => {
    expect(calcLongTermRate(18, 2, true)).toBeCloseTo(0.48, 10);
  });
  it("보유 20년·거주 20년 → 40% + 40% = 80% (각 상한 후 합계 상한)", () => {
    expect(calcLongTermRate(20, 20, true)).toBeCloseTo(0.8, 10);
  });
  it("보유 5년·거주 5년 → 20% + 20% = 40% (상한 미도달)", () => {
    expect(calcLongTermRate(5, 5, true)).toBeCloseTo(0.4, 10);
  });
  it("표1(비1세대1주택) 회귀 불변: 보유 10년 → 20%", () => {
    expect(calcLongTermRate(10, 0, false)).toBeCloseTo(0.2, 10);
  });
});
