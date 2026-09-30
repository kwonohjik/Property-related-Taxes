/**
 * B1 — 토지 + 이월과세 + 부담부증여 시가·실지취득가액(K-4): 「당초 증여자」 토지 칸 하나로 충족 (2026-09-30)
 *
 * 토지 자산의 화면에는 「당초 증여자의 토지 실지취득가액」 칸 하나뿐이다(건물·총액 칸 없음). 종전에는
 * ⑧이 「분리 2칸 또는 총액」을 요구해 영구 차단이었고, ⑧만 풀면 엔진 게이트
 * (`assertCarryoverDonorBasis` K-4)가 같은 조건으로 **계산 단계에서 던졌다** — 세 층을 함께 고정한다.
 * E2E 짝: `e2e/transfer-dead-end-defects.spec.ts` B1.
 */
import { describe, it, expect } from "vitest";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { validateBurdenedGiftAsset } from "@/lib/calc/transfer-tax-validate-bg";
import { buildBurdenedGiftInfo } from "@/lib/calc/transfer-tax-api-burdened-gift";
import { assertCarryoverDonorBasis } from "@/lib/tax-engine/transfer-tax-carryover-burdened-gift";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";

function asset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "land",
    acquisitionCause: "carryover_gift",
    acquisitionDate: "2014-01-01",
    carryover: {
      ...CARRYOVER_DEFAULTS,
      giftRegistryDate: "2014-01-01",
      donorAcquisitionDate: "2010-01-01",
      donorRelation: "spouse",
      giftDateValuation: "300000000",
      donorAcquisitionPrice: "200000000",
    },
    transferType: "burdened_gift",
    bgValuationMode: "sangjeungbeop_market",
    bgMarketValueAtTransfer: "500000000",
    bgAcquisitionMethod: "actual",
    bgActualAcquisitionLand: "200000000",
    bgLendingDepositTotal: "100000000",
    bgDonorRelation: "lineal_descendant",
    bgCoDonorActualAcquisitionLand: "150000000",
    ...over,
  } as AssetForm;
}

const ct = { useEstimatedAcquisition: false } as Parameters<typeof assertCarryoverDonorBasis>[1];
const engineInfo = (a: AssetForm) => buildBurdenedGiftInfo(a) as unknown as BurdenedGiftInfo;

describe("⑧ validateBurdenedGiftAsset — 당초 증여자 K-4", () => {
  it("토지 — 토지 칸 하나로 통과", () => {
    expect(validateBurdenedGiftAsset(asset(), "자산")).toBeNull();
  });

  it("토지 — 토지 칸이 비면 그 칸을 요구한다 (긍정 짝)", () => {
    expect(validateBurdenedGiftAsset(asset({ bgCoDonorActualAcquisitionLand: "" }), "자산")).toMatch(/당초 증여자/);
  });

  it("일반건물은 종전대로 — 토지만으로는 부족하다 (건물 칸이 화면에 있다)", () => {
    const gb = asset({ assetKind: "general_building", bgCoDonorActualAcquisitionBuilding: "" });
    expect(validateBurdenedGiftAsset(gb, "자산")).toMatch(/당초 증여자/);
  });
});

describe("④ → 엔진 게이트", () => {
  it("토지 — 건물 부분은 0으로 실린다 (건물이 없는 사실)", () => {
    const d = engineInfo(asset()).carryoverDonorBasis;
    expect(d?.actualLandAcquisitionPrice).toBe(150_000_000);
    expect(d?.actualBuildingAcquisitionPrice).toBe(0);
  });

  it("토지 — 엔진 게이트를 통과한다 (종전: 「분리 2칸 또는 총액」으로 던졌다)", () => {
    expect(() => assertCarryoverDonorBasis(engineInfo(asset()), ct)).not.toThrow();
  });

  it("토지 칸이 비면 건물 0도 싣지 않는다 — 게이트가 그대로 막는다", () => {
    const a = asset({ bgCoDonorActualAcquisitionLand: "" });
    expect(engineInfo(a).carryoverDonorBasis?.actualBuildingAcquisitionPrice).toBeUndefined();
    expect(() => assertCarryoverDonorBasis(engineInfo(a), ct)).toThrow(/당초 증여자/);
  });

  it("일반건물은 건물 칸을 그대로 싣는다", () => {
    const gb = asset({ assetKind: "general_building", bgCoDonorActualAcquisitionBuilding: "50000000" });
    expect(engineInfo(gb).carryoverDonorBasis?.actualBuildingAcquisitionPrice).toBe(50_000_000);
  });
});
