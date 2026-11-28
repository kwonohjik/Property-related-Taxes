/**
 * U-17 결과 ⑦ — 가업자산상당액 산식 줄(분수) · 특례 자산가액 초과 인수 채무 이월 줄.
 *
 * 결과는 엔진에서 받는다(손으로 짠 픽스처가 결함을 가리지 않게).
 *   D1: 주식 50억 · 총자산 100억 · 사업무관 20억 · 채무 45억 → 상당액 40억 · 초과 채무 5억 일반 차감
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { calcGiftTax } from "@/lib/tax-engine/gift-tax";
import type { GiftTaxInput, EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import { GiftTwoStreamDetailSection } from "@/components/calc/results/GiftTwoStreamDetailSection";

afterEach(cleanup);

function run(debt: number) {
  const input: GiftTaxInput = {
    giftDate: "2025-01-15",
    donorRelation: "lineal_ascendant_adult",
    donor: "father",
    giftItems: [
      {
        id: "s",
        category: "unlisted_stock",
        name: "가업주식",
        marketValue: 5_000_000_000,
        assumedDebtForGift: debt,
        corporateTotalAssets: 10_000_000_000,
        corporateNonBusinessAssets: { nonBusinessLand: 2_000_000_000 },
      } as EstateItem,
    ],
    priorGiftsWithin10Years: [],
    isGenerationSkip: false,
    isMinorDonee: false,
    deductionInput: { donorRelation: "lineal_ascendant_adult", priorUsedDeduction: 0 },
    creditInput: { isFiledOnTime: true, specialTreatment: "family_business", familyBusinessYears: 15 },
  };
  return calcGiftTax(input);
}

describe("GiftTwoStreamDetailSection — U-17", () => {
  it("가업자산상당액 산식은 분수 막대로 그려진다 (리터럴 ÷ 없음)", () => {
    const { container } = render(<GiftTwoStreamDetailSection result={run(0)} />);
    const bar = container.querySelector("span.border-t");
    expect(bar?.textContent).toBe("법인 총자산 10,000,000,000");
    expect(container.textContent).not.toContain("÷");
  });

  it("🔑 특례 자산가액을 넘는 인수 채무 5억이 일반 차감 줄로 표시된다", () => {
    const r = run(4_500_000_000);
    expect(r.specialStreamDebtExcessToOrdinary).toBe(500_000_000);
    render(<GiftTwoStreamDetailSection result={r} />);
    expect(screen.getByText(/특례 자산가액을 넘는 인수 채무 — 버리지 않고 일반 증여 과세가액에서 차감/)).toBeTruthy();
    expect(screen.getByText("- 500,000,000")).toBeTruthy();
  });

  it("초과 채무가 없으면 그 줄은 없다", () => {
    render(<GiftTwoStreamDetailSection result={run(500_000_000)} />);
    expect(screen.queryByText(/특례 자산가액을 넘는 인수 채무/)).toBeNull();
  });
});
