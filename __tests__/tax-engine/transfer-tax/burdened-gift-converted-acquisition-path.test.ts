/**
 * 부담부증여 K-5 — 환산취득가액 경로 (Pre-Do anchor)
 *
 * 증여재산을 상증법 §60② 시가로 평가 + 실지취득가 불명 → 환산취득가액(소령 §176의2②2호).
 *   취득가액(자산별) = 자산별 양도가액 × (취득시 기준시가 ÷ 양도시 기준시가).
 *   조심2009광1812 처분청 산식: 채무액 × 취득기준시가합 ÷ 양도기준시가합.
 *
 * buildBurdenedGiftBreakdown 직접 호출(함수 레벨) — STEP 4 "converted" 분기 검증.
 * 시드: 채무 155M · 시가 450M · 양도기준시가(토315M+건135M) · 취득기준시가(토147M+건63M).
 */
import { describe, it, expect } from "vitest";
import { buildBurdenedGiftBreakdown } from "@/lib/tax-engine/burdened-gift-apportionment";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";

describe("부담부증여 K-5 — 환산취득가액 (소령 §176의2②2호)", () => {
  const info: BurdenedGiftInfo = {
    valuationMode: "sangjeungbeop_market",
    acquisitionMethod: "converted",
    lendingDepositTotal: 155_000_000, // 채무액 B
    mortgageDebtAmount: 0,
    annualRentTotal: 0,
    marketValueAtTransfer: 450_000_000, // 증여가액 C (시가)
    landStdPriceAtTransfer: 315_000_000,
    buildingStdPriceAtTransfer: 135_000_000,
    landStdPriceAtAcquisition: 147_000_000,
    buildingStdPriceAtAcquisition: 63_000_000,
  };

  const breakdown = buildBurdenedGiftBreakdown({
    landStdPriceAtTransfer: 315_000_000,
    buildingStdPriceAtTransfer: 135_000_000,
    landStdPriceAtAcquisition: 147_000_000,
    buildingStdPriceAtAcquisition: 63_000_000,
    info,
  });

  it("acquisitionMethodUsed = converted", () => {
    expect(breakdown.acquisitionMethodUsed).toBe("converted");
  });

  it("채무액 B = 155M · 증여가액 분모 C = 시가 450M", () => {
    expect(breakdown.assumedDebtAmount).toBe(155_000_000);
    expect(breakdown.giftValuation.max).toBe(450_000_000);
  });

  it("자산별 양도가액 = 채무액 안분 (합 = B)", () => {
    expect(breakdown.perAsset.land.transferPrice).toBe(108_500_000);
    expect(breakdown.perAsset.building.transferPrice).toBe(46_500_000);
    expect(
      breakdown.perAsset.land.transferPrice + breakdown.perAsset.building.transferPrice,
    ).toBe(155_000_000);
  });

  it("환산취득가액 = 양도가액 × 취득기준시가 ÷ 양도기준시가 (자산별)", () => {
    // 토지: 108,500,000 × 147,000,000 / 315,000,000 = 50,633,333
    expect(breakdown.perAsset.land.acquisitionPrice).toBe(50_633_333);
    // 건물: 46,500,000 × 63,000,000 / 135,000,000 = 21,700,000
    expect(breakdown.perAsset.building.acquisitionPrice).toBe(21_700_000);
  });

  it("자산별 합 ≈ 처분청 일괄 환산총액 (±1원 허용 — 자산별 독립 환산)", () => {
    // 처분청 일괄: 155,000,000 × 210,000,000 / 450,000,000 = 72,333,333
    const sum =
      breakdown.perAsset.land.acquisitionPrice + breakdown.perAsset.building.acquisitionPrice;
    expect(Math.abs(sum - 72_333_333)).toBeLessThanOrEqual(1);
  });

  it("개산공제 3% 적용 (K-5)", () => {
    expect(breakdown.perAsset.land.estimatedDeduction).toBe(1_518_999); // floor(50,633,333 × 0.03)
    expect(breakdown.perAsset.building.estimatedDeduction).toBe(651_000); // 21,700,000 × 0.03
  });

  it("환산 분모 echo — stdPriceAtTransfer = 양도시 자산 기준시가 (sangjeungbeopValue와 구분)", () => {
    expect(breakdown.perAsset.land.stdPriceAtTransfer).toBe(315_000_000);
    expect(breakdown.perAsset.building.stdPriceAtTransfer).toBe(135_000_000);
  });
});
