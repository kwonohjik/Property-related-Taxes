/**
 * 단건 상세 계산 명세서 「가산세액」 산식의 §114조의2 **산정방식 라벨** anchor (PR-3).
 *
 * 종전에는 §114조의2분을 항상 「환산취득가액 가산세」로 적었다. 조문(소득세법 §114조의2①)은
 * 「감정가액 또는 환산취득가액」을 취득가액으로 한 경우라 **감정가액으로 붙은 가산세를 환산이라 부르면 틀린다.**
 * 부담부증여 K-7(감정가액) × 신축 연결(PR-3)로 이 조합이 화면에 나오면서 드러났다.
 * 엔진이 가산세 step에 싣는 `calculateBuildingPenalty`의 note(「… + 감정가액 적용」)가 산정방식의 정본이다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { baseTransferInput, makeMockRates } from "../tax-engine/_helpers/mock-rates";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";

const rates = makeMockRates();

function info(method: "appraisal" | "converted"): BurdenedGiftInfo {
  return {
    valuationMode: "sangjeungbeop_market",
    acquisitionMethod: method,
    marketValueAtTransfer: 500_000_000,
    lendingDepositTotal: 0,
    mortgageDebtAmount: 200_000_000,
    annualRentTotal: 0,
    mortgageSetAmount: 200_000_000,
    landStdPriceAtTransfer: 0,
    buildingStdPriceAtTransfer: 400_000_000,
    landStdPriceAtAcquisition: 0,
    buildingStdPriceAtAcquisition: 100_000_000,
    ...(method === "appraisal" ? { presumedLandAcquisitionPrice: 0, presumedBuildingAcquisitionPrice: 150_000_000 } : {}),
  };
}

function penaltyFormula(method: "appraisal" | "converted"): string {
  const r = calculateTransferTax(
    baseTransferInput({
      propertyType: "housing",
      transferDate: new Date("2024-03-01"),
      acquisitionDate: new Date("2021-01-01"),
      transferPrice: 0,
      acquisitionPrice: 0,
      expenses: 0,
      useEstimatedAcquisition: false,
      transferType: "burdened_gift",
      isOneHousehold: false,
      householdHousingCount: 2,
      isSelfBuilt: true,
      buildingType: "new",
      constructionDate: new Date("2021-01-01"),
      burdenedGiftInfo: info(method),
    }),
    rates,
  );
  expect(r.penaltyTax, "가산세가 실재해야 이 anchor가 구별력을 갖는다").toBeGreaterThan(0);
  const item = buildStatementItems(r, createDefaultTransferFormData(), undefined, undefined, undefined).get("penaltyTax");
  return item!.formula as string;
}

describe("명세서 가산세 산식의 §114조의2 산정방식 라벨", () => {
  it("감정가액으로 붙은 가산세는 「감정가액 가산세」로 적는다 (환산이라 적지 않는다)", () => {
    const f = penaltyFormula("appraisal");
    expect(f).toContain("§114조의2 감정가액 가산세");
    expect(f).not.toContain("환산취득가액 가산세");
  });

  it("🔴 구별력 — 환산취득가액으로 붙은 가산세는 종전대로 「환산취득가액 가산세」", () => {
    const f = penaltyFormula("converted");
    expect(f).toContain("§114조의2 환산취득가액 가산세");
    expect(f).not.toContain("감정가액 가산세");
  });
});
