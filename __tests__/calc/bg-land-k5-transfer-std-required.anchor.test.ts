/**
 * 토지 부담부증여 「시가 + 환산취득가액」(K-5) — 양도시 기준시가 필수 (2026-09-30)
 *
 * 막다른 오류 작업(#1900 B2) 중 발견한 별건. 양도시 기준시가는 환산의 **분모**인데 ⑧이 토지에서는
 * 요구하지 않았다 — 비우면 4단계를 모두 통과하고 엔진이 토지 취득가액을 0으로 냈다(막히지 않는 오답).
 * E2E 짝: `e2e/transfer-dead-end-defects.spec.ts` 「별건」.
 */
import { describe, it, expect } from "vitest";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { validateBurdenedGiftAsset } from "@/lib/calc/transfer-tax-validate-bg";
import { buildBurdenedGiftInfo } from "@/lib/calc/transfer-tax-api-burdened-gift";
import { buildBurdenedGiftBreakdown } from "@/lib/tax-engine/burdened-gift-apportionment";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";

function landK5(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "land",
    acquisitionDate: "2015-03-01",
    transferType: "burdened_gift",
    bgValuationMode: "sangjeungbeop_market",
    bgMarketValueAtTransfer: "500000000",
    bgAcquisitionMethod: "converted",
    bgLendingDepositTotal: "100000000",
    bgDonorRelation: "lineal_descendant",
    acquisitionArea: "100",
    transferArea: "100",
    standardPriceAtAcq: "100000000",
    standardPriceAtTransfer: "",
    standardPricePerSqmAtTransfer: "",
    ...over,
  } as AssetForm;
}

const V = (a: AssetForm) => validateBurdenedGiftAsset(a, "자산");

describe("근거 — 비우면 엔진이 토지 취득가액을 0으로 낸다", () => {
  const landAcq = (a: AssetForm) => {
    const info = buildBurdenedGiftInfo(a) as unknown as BurdenedGiftInfo;
    return buildBurdenedGiftBreakdown({
      landStdPriceAtTransfer: info.landStdPriceAtTransfer,
      buildingStdPriceAtTransfer: info.buildingStdPriceAtTransfer,
      landStdPriceAtAcquisition: info.landStdPriceAtAcquisition,
      buildingStdPriceAtAcquisition: info.buildingStdPriceAtAcquisition,
      info,
    }).perAsset.land.acquisitionPrice;
  };

  it("양도시 기준시가 공란 → 취득가액 0", () => {
    expect(landAcq(landK5())).toBe(0);
  });

  it("양도시 기준시가 입력 → 취득가액이 생긴다 (대조)", () => {
    expect(landAcq(landK5({ standardPriceAtTransfer: "300000000" }))).toBeGreaterThan(0);
  });
});

describe("⑧ — 토지 K-5 양도시 기준시가", () => {
  it("공란이면 차단한다", () => {
    expect(V(landK5())).toMatch(/부담부증여 환산취득가액 — 양도시 기준시가/);
  });

  it("총액이 있으면 통과", () => {
    expect(V(landK5({ standardPriceAtTransfer: "300000000" }))).toBeNull();
  });

  it("㎡당 공시지가 + 양도면적이면 통과 — ④와 같은 해석", () => {
    expect(V(landK5({ standardPricePerSqmAtTransfer: "3000000" }))).toBeNull();
  });

  it("㎡당 공시지가만 있고 양도면적이 없으면 차단", () => {
    expect(V(landK5({ standardPricePerSqmAtTransfer: "3000000", transferArea: "" }))).toMatch(/양도시 기준시가/);
  });

  it("시가 + 실지(K-4)는 요구하지 않는다 — 양도시 기준시가를 쓰지 않는 축", () => {
    expect(V(landK5({ bgAcquisitionMethod: "actual", bgActualAcquisitionLand: "200000000" }))).toBeNull();
  });
});
