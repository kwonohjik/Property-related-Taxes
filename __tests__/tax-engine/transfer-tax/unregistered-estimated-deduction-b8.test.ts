// B8 회귀 — 미등기양도자산 개산공제율 3/1000 (소득세법 시행령 §163⑥1호·2호가목 단서)
//
// 환산·감정·매매사례 모드의 개산공제는 일반 3/100이나, §104③ 미등기양도자산은 3/1000(0.3%).
// 수정 전에는 isUnregistered 무시하고 3% 일괄 적용 → 미등기 시 과다공제(양도차익 과소).
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const mockRates = makeMockRates();

// 환산취득가 = 500M × 100M/500M = 100,000,000 (취득·양도 기준시가 비율 1/5)
const ESTIMATED_BASE = {
  propertyType: "land" as const,
  transferPrice: 500_000_000,
  useEstimatedAcquisition: true,
  standardPriceAtAcquisition: 100_000_000,
  standardPriceAtTransfer: 500_000_000,
  isOneHousehold: false,
  householdHousingCount: 2,
};

describe("[B8] 미등기 개산공제 0.3% vs 등기 3%", () => {
  it("등기(3%): 개산공제 3,000,000 → 양도차익 397,000,000", () => {
    const r = calculateTransferTax(
      baseTransferInput({ ...ESTIMATED_BASE, isUnregistered: false }),
      mockRates,
    );
    // 500,000,000 − 환산 100,000,000 − 개산공제 3,000,000
    expect(r.transferGain).toBe(397_000_000);
  });

  it("미등기(0.3%): 개산공제 300,000 → 양도차익 399,700,000", () => {
    const r = calculateTransferTax(
      baseTransferInput({ ...ESTIMATED_BASE, isUnregistered: true }),
      mockRates,
    );
    // 500,000,000 − 환산 100,000,000 − 개산공제 300,000 (3/1000)
    expect(r.transferGain).toBe(399_700_000);
  });
});
