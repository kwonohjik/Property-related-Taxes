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

  /** 증축 공통 오버라이드 — 원건물 환산(C/D) 조합. */
  const EXT = {
    gbHasExtension: true,
    gbExtensionDate: "2015-06-01",
    gbExtensionAcquisitionCause: "newConstruction" as const,
    gbExtensionAcquisitionMode: "estimated" as const,
    gbTransferExtensionBuildingStdPrice: "8000000",
    gbAcquisitionExtensionBuildingStdPrice: "6000000",
  };

  /**
   * 🔴 **증축 = 무조건 제외**는 틀렸다 (2026-08-07 W-1b).
   *
   * `bundledExpenses` fallback은 ① 전용 필드(`gbBundledAcquisitionExpenses`)
   * → ② `transferExpense` → ③ `directExpenses` 순이다.
   * **②가 채택될 때만** 이중차감이 생기므로, ①에서 멈추면 제외할 이유가 없다.
   */
  it("증축(G3) + 전용 필드 **미입력** ⇒ ② 채택 → transferExpense 제외 (이중차감 회피)", () => {
    const p = buildGeneralBuildingValuation(gbAsset(EXT)) as Record<string, unknown>;
    expect(p.capitalExpenditure).toBe(800_000_000);
    // ②가 채택되어 bundledExpenses가 곧 양도비다 — 나목에 또 넣으면 두 번 반영된다.
    expect(p.bundledExpenses).toBe(10_000_000);
    expect(p.transferExpense).toBeUndefined();
  });

  it("🔴 증축(G3) + 전용 필드 **입력** ⇒ ① 채택 → transferExpense **포함**", () => {
    const p = buildGeneralBuildingValuation(
      gbAsset({ ...EXT, gbBundledAcquisitionExpenses: "5000000" }),
    ) as Record<string, unknown>;
    expect(p.capitalExpenditure).toBe(800_000_000);
    // ①에서 멈췄으므로 양도비는 소비되지 않았다 ⇒ §97②2호 나목에 들어가야 한다.
    expect(p.bundledExpenses).toBe(5_000_000);
    expect(p.transferExpense).toBe(10_000_000);
  });
});
