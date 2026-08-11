/**
 * §97②2호 swap API 배선 가드 (⑫⑬⑭ decision b) — buildGeneralBuildingValuation.
 *
 * - 비-증축(G2/G4): capitalExpenditure + transferExpense 둘 다 payload 전달.
 * - 증축(G3) × **원건물 실가**: capitalExpenditure만 (transferExpense는 bundledExpenses
 *   legacy fallback으로 **실제 소비되어** F1 이중차감이 되므로 제외).
 * - 증축(G3) × **원건물 환산**: 둘 다 전달 — 그 조합에서는 `bundledExpenses`가 소비되지 않는다.
 *
 * ## 🔄 「증축이면 제외」에서 「소비될 때만 제외」로 (2026-08-12 D-10)
 *
 * 종전 규칙은 원건물이 환산이어도 양도비를 뺐다. 그런데 원건물이 양쪽 다 환산이면 엔진이
 * 일괄 안분 필요경비를 **개산공제로 덮으므로**(`general-building-extension.ts`) `bundledExpenses`가
 * 아무 데도 소비되지 않는다 — 이중차감이 성립하지 않는데도 양도비가
 * 「소득세법」 제97조 제2항 제2호 **단서 나목**(= 제1항제2호 **및** 제3호의 **합계액**)에서 빠졌다.
 * 실측 결정세액 **28,979,117원 과대**.
 *
 * 계획서: `docs/02-design/features/transfer-gb-extension-4mode-matrix.plan.md` §4 D-10
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

  /** 원건물 **실가**(A/B) 조합 — `bundledExpenses`가 실제로 토지·건물1에 안분되어 소비된다. */
  const EXT_ORIGIN_ACTUAL = {
    ...EXT,
    useEstimatedAcquisition: false,
    fixedAcquisitionPrice: "300000000",
  };

  /**
   * 🔴 **증축 = 무조건 제외**는 틀렸다 (2026-08-07 W-1b).
   *
   * `bundledExpenses` fallback은 ① 전용 필드(`gbBundledAcquisitionExpenses`)
   * → ② `transferExpense` → ③ `directExpenses` 순이다.
   * **②가 채택될 때만** 이중차감이 생기므로, ①에서 멈추면 제외할 이유가 없다.
   *
   * 🔄 **픽스처를 원건물 실가로 옮겼다** (2026-08-12 D-10) — 이 규칙이 성립하는 유일한 축이다.
   *    원건물 환산에서는 ②가 채택돼도 그 값이 **소비되지 않으므로** 제외할 이유가 없다.
   */
  it("증축(G3) × 원건물 실가 + 전용 필드 **미입력** ⇒ ② 채택 → transferExpense 제외 (이중차감 회피)", () => {
    const p = buildGeneralBuildingValuation(gbAsset(EXT_ORIGIN_ACTUAL)) as Record<string, unknown>;
    expect(p.capitalExpenditure).toBe(800_000_000);
    // ②가 채택되어 bundledExpenses가 곧 양도비다 — 나목에 또 넣으면 두 번 반영된다.
    expect(p.bundledExpenses).toBe(10_000_000);
    expect(p.transferExpense).toBeUndefined();
  });

  it("🔴 증축(G3) × 원건물 실가 + 전용 필드 **입력** ⇒ ① 채택 → transferExpense **포함**", () => {
    const p = buildGeneralBuildingValuation(
      gbAsset({ ...EXT_ORIGIN_ACTUAL, gbBundledAcquisitionExpenses: "5000000" }),
    ) as Record<string, unknown>;
    expect(p.capitalExpenditure).toBe(800_000_000);
    // ①에서 멈췄으므로 양도비는 소비되지 않았다 ⇒ §97②2호 나목에 들어가야 한다.
    expect(p.bundledExpenses).toBe(5_000_000);
    expect(p.transferExpense).toBe(10_000_000);
  });

  /**
   * 🔴 **D-10 — 원건물 환산(C/D)에서는 전용 필드 미입력이어도 나목에 싣는다.**
   *
   * 위 두 테스트와 **대조군 쌍**이다. 한쪽만 보면 「무조건 포함」이나 「무조건 제외」로
   * 되돌아가는데, 둘 다 틀렸다는 것이 W-1b·D-10의 결론이다.
   */
  it("🔴 증축(G3) × 원건물 환산 ⇒ 전용 필드 미입력이어도 transferExpense **포함**", () => {
    const p = buildGeneralBuildingValuation(gbAsset(EXT)) as Record<string, unknown>;
    expect(p.capitalExpenditure).toBe(800_000_000);
    // fallback ②가 집기는 하지만 환산 파트에서 소비되지 않는다(개산공제로 덮인다).
    expect(p.bundledExpenses).toBe(10_000_000);
    expect(p.transferExpense).toBe(10_000_000);
  });
});
