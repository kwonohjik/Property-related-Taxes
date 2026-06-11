// P3 — §98의3·§98의5·§98의6 풀 파이프라인 통합 anchor
//
// - P3-7: 단기세율 배제 특칙 (§98의3④ — suppressShortTermRate) + 농특세 비과세
// - P3-8: §98의5 5년 내 80% 세액감면 + 농특세 비과세
// - P3-9: §98의6 1호 5년 내 50% + 농특세 20%
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

/** §98의3 적격 reduction (비과밀) */
const UNSOLD_983_REDUCTION = {
  type: "unsold_98_3" as const,
  residencyType983: "resident" as const,
  houseType983: "purchased" as const,
  contractDate983: new Date("2009-06-15"),
  isOutsideSeoulNotDesignated983: true,
  isOverconcentration983: false,
  isUnsoldConfirmed983: true,
  isFirstContract983: true,
  isNotOccupiedAtContract983: true,
  isNotRecontract983: true,
  standardPriceAtAcquisition983: 200_000_000,
  standardPriceAt5Years983: 300_000_000,
  standardPriceAtTransfer983: 400_000_000,
};

describe("P3 하이브리드 통합 anchor", () => {
  it("P3-7: §98의3 적격 + 보유 1년 6개월 — 단기세율(40%) 배제·기본세율·100% 감면·농특세 0", () => {
    const rates = makeMockRates();
    const r = calculateTransferTax(
      baseTransferInput({
        transferPrice: 800_000_000,
        acquisitionPrice: 500_000_000,
        // 2009.6 계약 후 준공 지연 취득 — 5년 내 양도 (보유 1년 6개월).
        // 대조군이 60% 단기세율이므로 특칙(§104①1호 강제) 효과가 anchor로 실증됨.
        acquisitionDate: new Date("2023-01-15"),
        transferDate: new Date("2024-07-15"),
        householdHousingCount: 2,
        reductions: [UNSOLD_983_REDUCTION],
      }),
      rates,
    );
    // 보유 3년 미만 — LTHD 0. transferIncome 300M, taxBase 297.5M
    expect(r.longTermHoldingDeduction).toBe(0);
    expect(r.taxBase).toBe(297_500_000);
    // 단기세율 배제 (특칙 — §98의3④2호): 40% 단일세율(119,000,000) 대신
    // 기본 누진 297.5M × 38% − 19.94M = 93,110,000
    expect(r.calculatedTax).toBe(93_110_000);
    expect(r.appliedRate).toBe(0.38);
    // 5년 내 — 100% 세액감면 (비과밀)
    expect(r.reductionAmount).toBe(93_110_000);
    expect(r.reductionTypeApplied).toBe("unsold_98_3");
    expect(r.determinedTax).toBe(0);
    // 농특세 비과세 (농특세령 §4⑦1호)
    expect(r.unsold983Detail?.ruralSurtaxExempt).toBe(true);
    expect(r.unsold983Detail?.ruralSurtax).toBe(0);
    expect(r.steps.some((s) => s.label.includes("농어촌특별세"))).toBe(false);
    expect(r.totalTax).toBe(0);
  });

  it("P3-7 대조군: 동일 입력 + 토글 미확인(불적격) → 주택 단기세율 60% 적용 (178,500,000)", () => {
    const rates = makeMockRates();
    const r = calculateTransferTax(
      baseTransferInput({
        transferPrice: 800_000_000,
        acquisitionPrice: 500_000_000,
        acquisitionDate: new Date("2023-01-15"),
        transferDate: new Date("2024-07-15"),
        householdHousingCount: 2,
        reductions: [{ ...UNSOLD_983_REDUCTION, isOutsideSeoulNotDesignated983: false }],
      }),
      rates,
    );
    expect(r.unsold983Detail?.isEligible).toBe(false);
    // 주택 보유 2년 미만 — §104①2호 60% 단일세율 (특칙 미적용)
    expect(r.calculatedTax).toBe(178_500_000);
    expect(r.appliedRate).toBe(0.6);
  });

  it("P3-8: §98의5 5년 내 인하율 15% — 감면 80% 67,192,000·농특세 0·총 18,477,800", () => {
    const rates = makeMockRates();
    const r = calculateTransferTax(
      baseTransferInput({
        transferPrice: 800_000_000,
        acquisitionPrice: 500_000_000,
        acquisitionDate: new Date("2011-06-15"),
        transferDate: new Date("2016-01-01"), // 4년 6개월 — 5년 내
        householdHousingCount: 2,
        reductions: [{
          type: "unsold_98_5" as const,
          contractDate985: new Date("2010-06-15"),
          priceReductionRatePct985: 15,
          isNonCapitalUnsoldAtCutoff985: true,
          isFirstContract985: true,
          isNotOccupiedAtContract985: true,
          isNotRecontract985: true,
          standardPriceAtAcquisition985: 200_000_000,
          standardPriceAt5Years985: 300_000_000,
          standardPriceAtTransfer985: 400_000_000,
        }],
      }),
      rates,
    );
    // LTHD 4년 8% = 24M → transferIncome 276M → taxBase 273.5M → 83,990,000
    expect(r.longTermHoldingDeduction).toBe(24_000_000);
    expect(r.calculatedTax).toBe(83_990_000);
    // 80% 세액감면 = 67,192,000
    expect(r.reductionAmount).toBe(67_192_000);
    expect(r.determinedTax).toBe(16_798_000);
    // 농특세 비과세
    expect(r.unsold985Detail?.ruralSurtaxExempt).toBe(true);
    expect(r.localIncomeTax).toBe(1_679_800);
    expect(r.totalTax).toBe(18_477_800);
  });

  it("P3-9: §98의6 1호 5년 내 — 감면 50% 46,555,000·농특세 9,311,000·총 60,521,500", () => {
    const rates = makeMockRates();
    const r = calculateTransferTax(
      baseTransferInput({
        transferPrice: 800_000_000,
        acquisitionPrice: 500_000_000,
        acquisitionDate: new Date("2011-09-01"),
        transferDate: new Date("2014-01-01"), // 2년 4개월 — 5년 내 (단기세율도 배제 대상 아님: 24개월+)
        householdHousingCount: 2,
        reductions: [{
          type: "unsold_98_6" as const,
          hoType986: "seller_rented" as const,
          contractDate986: new Date("2011-08-01"),
          stdPriceSumAtBase986: 550_000_000,
          floorAreaSqm986: 84.5,
          isUnsoldAfterCompletion986: true,
          isFirstContract986: true,
          isNotOccupiedAfterCompletion986: true,
          isNotRecontract986: true,
          sellerRented2Years986: true,
          standardPriceAtAcquisition986: 200_000_000,
          standardPriceAt5Years986: 300_000_000,
          standardPriceAtTransfer986: 400_000_000,
        }],
      }),
      rates,
    );
    // 보유 3년 미만 — LTHD 0. taxBase 297.5M → 93,110,000
    expect(r.calculatedTax).toBe(93_110_000);
    // 50% 세액감면 = 46,555,000
    expect(r.reductionAmount).toBe(46_555_000);
    expect(r.determinedTax).toBe(46_555_000);
    // 농특세 = 감면세액 × 20% (비과세 열거 없음)
    expect(r.unsold986Detail?.ruralSurtax).toBe(9_311_000);
    expect(r.steps.some((s) => s.label.includes("§98의6 농어촌특별세"))).toBe(true);
    expect(r.localIncomeTax).toBe(4_655_500);
    expect(r.totalTax).toBe(60_521_500);
  });
});
