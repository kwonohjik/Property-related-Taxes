/**
 * §97②2호 swap API 배선 가드 (⑫⑬⑭ decision b) — buildGeneralBuildingValuation.
 *
 * - 비-증축(G2/G4): capitalExpenditure + transferExpense 둘 다 payload 전달.
 * - 증축(G3): capitalExpenditure만 (transferExpense는 bundledExpenses legacy fallback으로
 *   소비될 수 있어 F1 이중차감 방지 위해 제외).
 */
import { describe, it, expect } from "vitest";
import { buildGeneralBuildingValuation } from "@/lib/calc/transfer-tax-api-gb";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

/** GB 환산 최소 입력 + capex. */
function gbAsset(overrides: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    useEstimatedAcquisition: true,
    acquisitionDate: "1999-05-24",
    gbLandArea: "85",
    gbBuildingArea: "180.96",
    gbBuildingFootprintArea: "90.48",
    gbTransferLandPricePerSqm: "10830000",
    gbTransferBuildingValue: "20629440",
    gbAcqLandPricePerSqm: "2800000",
    gbAcqBuildingValue: "28144700",
    gbBuildingAcquisitionCause: "purchase",
    gbZoneType: "commercial",
    gbIsMetropolitan: true,
    capitalExpenditure: "800000000",
    transferExpense: "10000000",
    ...overrides,
  } as AssetForm;
}

describe("§97②2호 swap API 배선 (buildGeneralBuildingValuation)", () => {
  it("비-증축(G2): capitalExpenditure + transferExpense 둘 다 전달", () => {
    const p = buildGeneralBuildingValuation(gbAsset()) as Record<string, unknown>;
    expect(p.capitalExpenditure).toBe(800_000_000);
    expect(p.transferExpense).toBe(10_000_000);
  });

  it("증축(G3): capitalExpenditure만 전달, transferExpense 제외 (F1 decision b)", () => {
    const p = buildGeneralBuildingValuation(
      gbAsset({
        gbHasExtension: true,
        gbExtensionDate: "2015-06-01",
        gbExtensionAcquisitionCause: "newConstruction",
        gbExtensionAcquisitionMode: "estimated",
        gbTransferExtensionBuildingStdPrice: "8000000",
        gbAcquisitionExtensionBuildingStdPrice: "6000000",
      }),
    ) as Record<string, unknown>;
    expect(p.capitalExpenditure).toBe(800_000_000);
    expect(p.transferExpense).toBeUndefined();
  });
});
