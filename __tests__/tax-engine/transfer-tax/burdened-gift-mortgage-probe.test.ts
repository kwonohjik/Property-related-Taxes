/**
 * G-H2 Pre-Do Probe — mortgage/rental selectedMode에서 양도가액 합 != 채무액(B) 확인.
 *
 * §159①2호: 양도가액 = A(자산별 §60~§66 평가가액) × B(채무액) / C(증여가액)
 * 자산별 합: (A_land + A_building) × B/C = supplementary × B/max (현재 구현)
 * 하지만 max > supplementary일 때 supplementary × B/max < B → 양도가액 합이 채무액 과소.
 *
 * 올바른 구현: 자산별 양도가액 = (자산 기준시가 / supplementary) × B
 *   → 합 = B (채무액과 일치)
 *
 * 이 파일은 수정 전 실패(현재 오류 확인) → 수정 후 PASS로 변경됨.
 */

import { describe, it, expect } from "vitest";
import { buildBurdenedGiftBreakdown, computeSangjeungbeopValuation } from "@/lib/tax-engine/burdened-gift-apportionment";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";

describe("G-H2 Pre-Do Probe — mortgage selectedMode 양도가액 = B", () => {
  // 조건: 채무(B) = 700M / supplementary = 500M / mortgage = 900M (→ max=900M)
  //   토지 기준시가 300M / 건물 기준시가 200M → supplementary = 500M
  //   lendingDeposit 200M + mortgageSet 700M = 900M (mortgage)
  //   B = lendingDeposit 200M + mortgageDebt 500M = 700M
  // 수정 전: landTransfer = 300M×700M/900M = 233,333,333 / building = 200M×700M/900M = 155,555,555
  //          total ≈ 388,888,888 ≠ 700M (채무액 과소)
  // 수정 후: landTransfer = 300M/500M × 700M = 420,000,000 / building = 200M/500M × 700M = 280,000,000
  //          total = 700M ✓ (floor 안분 잔액 흡수)

  const info: BurdenedGiftInfo = {
    valuationMode: "sangjeungbeop_standard",
    lendingDepositTotal: 200_000_000,     // 보증금 200M
    mortgageDebtAmount: 500_000_000,      // 차입금 500M → B = 700M
    mortgageSetAmount: 700_000_000,       // 저당 설정액 700M → mortgage = 200M + 700M = 900M
    annualRentTotal: 0,
    landStdPriceAtTransfer: 300_000_000,
    buildingStdPriceAtTransfer: 200_000_000,  // supplementary = 500M
    landStdPriceAtAcquisition: 100_000_000,
    buildingStdPriceAtAcquisition: 80_000_000,
  };

  it("computeSangjeungbeopValuation: selectedMode=mortgage, max=900M", () => {
    const sg = computeSangjeungbeopValuation(300_000_000, 200_000_000, info);
    // mortgage = 200M + 700M = 900M > supplementary 500M
    expect(sg.selectedMode).toBe("mortgage");
    expect(sg.max).toBe(900_000_000);
    expect(sg.supplementary).toBe(500_000_000);
  });

  it("§159①2호 자산별 양도가액 합 = B (채무액 700M)", () => {
    const bd = buildBurdenedGiftBreakdown({
      landStdPriceAtTransfer: 300_000_000,
      buildingStdPriceAtTransfer: 200_000_000,
      landStdPriceAtAcquisition: 100_000_000,
      buildingStdPriceAtAcquisition: 80_000_000,
      info,
    });
    const total = bd.perAsset.land.transferPrice + bd.perAsset.building.transferPrice;
    // §159①2호: 양도가액 합 = B = 700,000,000
    expect(bd.assumedDebtAmount).toBe(700_000_000);
    expect(total).toBe(700_000_000);
  });

  it("자산별 양도가액 비율 = 기준시가 비율 (300:200)", () => {
    const bd = buildBurdenedGiftBreakdown({
      landStdPriceAtTransfer: 300_000_000,
      buildingStdPriceAtTransfer: 200_000_000,
      landStdPriceAtAcquisition: 100_000_000,
      buildingStdPriceAtAcquisition: 80_000_000,
      info,
    });
    // 토지:건물 기준시가 비율 = 3:2
    // land = 300M/500M × 700M = 420,000,000
    // building = 200M/500M × 700M = 280,000,000
    // (floor 안분: land = floor(700M×300M/500M) = floor(420M) = 420M, building = 700M-420M = 280M)
    expect(bd.perAsset.land.transferPrice).toBe(420_000_000);
    expect(bd.perAsset.building.transferPrice).toBe(280_000_000);
  });
});

describe("G-H2 Pre-Do Probe — rental selectedMode 양도가액 = B", () => {
  // rental이 max인 케이스: annualRent = 72M (월세) → rentalCap = 72M/0.12 = 600M
  // lendingDeposit 150M → rental = 150M + 600M = 750M
  // supplementary = 토지300M + 건물200M = 500M
  // mortgage = 150M + 200M = 350M
  // max = 750M (rental)
  // B = 150M + 200M = 350M

  const infoRental: BurdenedGiftInfo = {
    valuationMode: "sangjeungbeop_standard",
    lendingDepositTotal: 150_000_000,
    mortgageDebtAmount: 200_000_000,
    annualRentTotal: 72_000_000,          // 연간 임대료 72M → 600M 환산
    landStdPriceAtTransfer: 300_000_000,
    buildingStdPriceAtTransfer: 200_000_000,
    landStdPriceAtAcquisition: 100_000_000,
    buildingStdPriceAtAcquisition: 80_000_000,
  };

  it("computeSangjeungbeopValuation: selectedMode=rental", () => {
    const sg = computeSangjeungbeopValuation(300_000_000, 200_000_000, infoRental);
    // rentalCap = floor(72M / 0.12) = 600M
    // rental = 150M + 600M = 750M
    expect(sg.selectedMode).toBe("rental");
    expect(sg.max).toBe(750_000_000);
  });

  it("§159①2호 rental: 자산별 양도가액 합 = B (350M)", () => {
    const bd = buildBurdenedGiftBreakdown({
      landStdPriceAtTransfer: 300_000_000,
      buildingStdPriceAtTransfer: 200_000_000,
      landStdPriceAtAcquisition: 100_000_000,
      buildingStdPriceAtAcquisition: 80_000_000,
      info: infoRental,
    });
    const total = bd.perAsset.land.transferPrice + bd.perAsset.building.transferPrice;
    expect(bd.assumedDebtAmount).toBe(350_000_000);
    // 수정 후: total = B = 350M
    expect(total).toBe(350_000_000);
  });
});
