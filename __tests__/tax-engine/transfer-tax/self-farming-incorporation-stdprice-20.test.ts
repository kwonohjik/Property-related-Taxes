// #20 회귀 — 자경농지 편입 부분감면(조특령 §66⑤⑥) 실지 모드 기준시가 3점 배선.
//
// 편입 비율 = (편입시 − 취득시)/(양도시 − 취득시) 기준시가는 실지 양도에서도 필요하나,
// 자산-수준 stdAcq/stdTransfer는 환산 모드에서만 채워짐 → 실지 모드는 항상 silent-0였음.
// reduction 전용 필드(standardPriceAtAcquisition/Transfer) 도입으로 실지 모드도 산출.
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const rates = makeMockRates();

// 실지거래가액 모드 자경농지 — 자산-수준 기준시가 미도달(환산 아님)
function farmlandBase(overrides: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "land",
    isOneHousehold: false,
    householdHousingCount: 0,
    acquisitionDate: new Date("2010-01-01"),
    transferDate: new Date("2022-06-01"), // 편입 2020-02-14 + 3년(2023-02-14) 이내
    acquisitionPrice: 100_000_000,
    transferPrice: 600_000_000,
    ...overrides,
  });
}

describe("[#20] 자경 편입 부분감면 실지 모드 기준시가 3점 배선", () => {
  it("reduction 3점 제공(실지 모드) → 편입 부분감면 산출(비율 2/3)", () => {
    const result = calculateTransferTax(
      farmlandBase({
        reductions: [
          {
            type: "self_farming",
            farmingYears: 8,
            incorporationDate: new Date("2020-02-14"),
            incorporationZoneType: "residential",
            standardPriceAtIncorporation: 3000,
            standardPriceAtAcquisition: 1000, // reduction 전용 입력(실지 모드)
            standardPriceAtTransfer: 4000,
          },
        ],
      }),
      rates,
    );
    // 배선 전: 자산 stdAcq/stdTransfer=undefined → silent-0. 배선 후: 비율 2/3 부분감면 적용
    expect(result.reductionAmount).toBeGreaterThan(0);
    expect(result.selfFarmingReductionDetail?.partialReductionApplied).toBe(true);
    expect(result.selfFarmingReductionDetail?.reducibleRatio).toBeCloseTo(2 / 3, 4);
  });

  it("reduction 3점 미제공(실지 모드) → silent-0 유지(회귀 baseline)", () => {
    const result = calculateTransferTax(
      farmlandBase({
        reductions: [
          {
            type: "self_farming",
            farmingYears: 8,
            incorporationDate: new Date("2020-02-14"),
            incorporationZoneType: "residential",
            standardPriceAtIncorporation: 3000,
            // stdAcq/stdTransfer 없음 + 실지 모드 → 자산 fallback도 undefined
          },
        ],
      }),
      rates,
    );
    expect(result.reductionAmount).toBe(0);
    expect(result.selfFarmingReductionDetail?.qualifies).toBe(false);
  });

  it("편입일 없음 → 전액 감면(부분감면 미발동)", () => {
    const result = calculateTransferTax(
      farmlandBase({
        reductions: [{ type: "self_farming", farmingYears: 8 }],
      }),
      rates,
    );
    expect(result.reductionAmount).toBeGreaterThan(0);
    expect(result.selfFarmingReductionDetail?.partialReductionApplied).toBe(false);
  });
});
