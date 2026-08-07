/**
 * 부담부증여 K-4 — 실지취득가액 안분 경로 (Pre-Do anchor)
 *
 * 증여재산을 상증법 §60② 시가로 평가 + 증여자 실지취득가 확인 →
 *   취득가액(자산별) = 실지취득가액 × 채무비율 (소령 §159①1호 본문, §97①1호가목).
 *   개산공제 미적용 — 실비(자본적지출 §163③ + 양도비 §163⑤)를 채무비율 안분.
 *
 * buildBurdenedGiftBreakdown 직접 호출(함수 레벨) — STEP 4 "actual" 분기 검증.
 */
import { describe, it, expect } from "vitest";
import { buildBurdenedGiftBreakdown } from "@/lib/tax-engine/burdened-gift-apportionment";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";

const rates = makeMockRates();

describe("부담부증여 K-4 — 실지취득가액 안분 (소령 §159①1호 본문)", () => {
  const info: BurdenedGiftInfo = {
    valuationMode: "sangjeungbeop_market",
    acquisitionMethod: "actual",
    lendingDepositTotal: 155_000_000, // 채무액 B
    mortgageDebtAmount: 0,
    annualRentTotal: 0,
    marketValueAtTransfer: 450_000_000, // 증여가액 C (시가)
    landStdPriceAtTransfer: 315_000_000,
    buildingStdPriceAtTransfer: 135_000_000,
    landStdPriceAtAcquisition: 147_000_000,
    buildingStdPriceAtAcquisition: 63_000_000,
    actualLandAcquisitionPrice: 100_000_000, // 증여자 실지취득가 (토지)
    actualBuildingAcquisitionPrice: 50_000_000, // 증여자 실지취득가 (건물)
  };

  const breakdown = buildBurdenedGiftBreakdown({
    landStdPriceAtTransfer: 315_000_000,
    buildingStdPriceAtTransfer: 135_000_000,
    landStdPriceAtAcquisition: 147_000_000,
    buildingStdPriceAtAcquisition: 63_000_000,
    info,
    capitalExpenditure: 10_000_000,
    transferExpense: 2_000_000,
  });

  it("acquisitionMethodUsed = actual", () => {
    expect(breakdown.acquisitionMethodUsed).toBe("actual");
  });

  it("취득가액 = 실지취득가액 × 채무비율 (B/C)", () => {
    // 토지: 100,000,000 × 155,000,000 / 450,000,000 = 34,444,444
    expect(breakdown.perAsset.land.acquisitionPrice).toBe(34_444_444);
    // 건물: 50,000,000 × 155,000,000 / 450,000,000 = 17,222,222
    expect(breakdown.perAsset.building.acquisitionPrice).toBe(17_222_222);
  });

  it("실지취득가 echo (actualAcquisition, 채무비율 적용 전)", () => {
    expect(breakdown.perAsset.land.actualAcquisition).toBe(100_000_000);
    expect(breakdown.perAsset.building.actualAcquisition).toBe(50_000_000);
  });

  it("개산공제 미적용 — 실비(자본적지출+양도비) 채무비율 안분 후 **성질별 시점 비율**", () => {
    // 실비 12,000,000 × 155,000,000 / 450,000,000 = 4,133,333 (채무 안분 — 합계 불변)
    //
    // W-5(2026-08-07) 이후 성질별로 나눈다(§100② 후문 — 자본적지출=취득시·양도비=양도시):
    //   자본적지출분 = 4,133,333 × 10,000,000 / 12,000,000 = 3,444,444
    //   양도비분     = 4,133,333 − 3,444,444              =   688,889 (잔액 흡수)
    //   토지 = floor(3,444,444 × 147,000,000/210,000,000)   ← 취득시 0.7 = 2,411,110
    //        + floor(  688,889 × 315,000,000/450,000,000)   ← 양도시 0.7 =   482,222
    //        = 2,893,332
    //   건물 = 4,133,333 − 2,893,332 = 1,240,001 (잔액 흡수)
    //
    // ⚠️ 이 fixture는 두 시점 비율이 **우연히 같다**(0.7/0.7). 그런데도 종전(2,893,333)과
    //    **1원** 다른 것은 성질별로 나누면서 **floor가 두 번** 걸리기 때문이다 — 비율 변화가
    //    아니라 절사 산물이다. **합계 4,133,333은 불변**이고 건물이 잔액을 흡수한다
    //    (메모리 `feedback_floor_residual_absorption`).
    expect(breakdown.perAsset.land.estimatedDeduction).toBe(2_893_332);
    expect(breakdown.perAsset.building.estimatedDeduction).toBe(1_240_001);
    // 합계 보존 — 이것이 깨지면 절사 규약이 무너진 것이다.
    expect(
      breakdown.perAsset.land.estimatedDeduction + breakdown.perAsset.building.estimatedDeduction,
    ).toBe(4_133_333);
  });

  it("자산별 양도가액 = 채무액 안분 (합 = B, K-5와 동일)", () => {
    expect(
      breakdown.perAsset.land.transferPrice + breakdown.perAsset.building.transferPrice,
    ).toBe(155_000_000);
  });
});

// ============================================================
// K-4 통합 — calculateTransferTax 경로 (자본적지출·양도비 결선)
//   step.ts → buildBurdenedGiftBreakdown(capitalExpenditure) → estimatedDeduction → expenses → 양도차익
//   주택(housing): land=0, building 통째. 시가 1B, 채무 500M (B/C=0.5).
//   실지취득가 600M × 0.5 = 300M. 실비 40M × 0.5 = 20M.
// ============================================================
describe("K-4 통합 — calculateTransferTax 실비(자본적지출·양도비) 결선", () => {
  const input = baseTransferInput({
    propertyType: "housing",
    transferDate: new Date("2024-03-01"),
    acquisitionDate: new Date("2009-03-01"),
    transferPrice: 0,
    acquisitionPrice: 0,
    expenses: 0,
    transferType: "burdened_gift",
    acquisitionCause: "gift",
    isOneHousehold: false,
    householdHousingCount: 2,
    capitalExpenditure: 30_000_000,
    transferExpense: 10_000_000,
    burdenedGiftInfo: {
      valuationMode: "sangjeungbeop_market",
      acquisitionMethod: "actual",
      lendingDepositTotal: 300_000_000,
      mortgageDebtAmount: 200_000_000,
      annualRentTotal: 0,
      marketValueAtTransfer: 1_000_000_000, // 시가 C
      landStdPriceAtTransfer: 0,
      buildingStdPriceAtTransfer: 1_000_000_000,
      landStdPriceAtAcquisition: 0,
      buildingStdPriceAtAcquisition: 500_000_000,
      actualAcquisitionTotal: 600_000_000, // 증여자 실지취득가
    },
  });

  it("acquisitionMethodUsed=actual · 취득가액 = 실지 600M × 채무비율 0.5 = 300M", () => {
    const b = calculateTransferTax(input, rates).transferBurdenedGiftBreakdown!;
    expect(b.acquisitionMethodUsed).toBe("actual");
    expect(b.perAsset.building.acquisitionPrice).toBe(300_000_000);
    expect(b.perAsset.building.actualAcquisition).toBe(600_000_000);
  });

  it("실비(자본적지출 30M + 양도비 10M = 40M) 채무비율 안분 = 20M → estimatedDeduction(building)", () => {
    const b = calculateTransferTax(input, rates).transferBurdenedGiftBreakdown!;
    expect(b.perAsset.building.estimatedDeduction).toBe(20_000_000);
  });

  it("양도차익 = 양도가 500M − 취득가 300M − 실비 20M = 180M (실비 필요경비 결선 확인)", () => {
    const result = calculateTransferTax(input, rates);
    expect(result.transferGain).toBe(180_000_000);
  });
});
