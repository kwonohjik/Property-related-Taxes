/**
 * 증환지 증가분 양도시 기준시가 Live fallback — API 파생 회귀 앵커
 *
 * 순서 무관 자동: 증가분(isReplotIncrement)의 standardPriceAtTransfer가 비어 있어도
 * buildAssetPayload가 당초분(primary) ㎡당 × 증가분 면적으로 파생해 엔진에 전달.
 * (UI display fallback + validate와 동일 규칙 — 3중 동기화)
 * docs/00-pm/transfer-replot-increase-autofill.plan.md
 */
import { describe, it, expect } from "vitest";
import { buildAssetPayload } from "@/lib/calc/transfer-tax-api-helpers";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

function primaryLand(perSqm: string): AssetForm {
  return { ...makeDefaultAsset(1), assetKind: "land", standardPricePerSqmAtTransfer: perSqm };
}
function incrementLand(overrides: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(2),
    assetKind: "land",
    isReplotIncrement: true,
    transferArea: "32.2",
    standardPriceAtTransfer: "",
    isPrimaryForHouseholdFlags: false,
    ...overrides,
  };
}

const TD = "2023-05-01";

describe("증환지 증가분 Live fallback — buildAssetPayload 파생", () => {
  it("증가분 총액 빈값 + 당초분 ㎡당 있으면 → 파생(㎡당 × 증가분면적)", () => {
    const r = buildAssetPayload(incrementLand(), "apportioned", TD, undefined, undefined, primaryLand("1000000"));
    // floor(1,000,000 × 32.2) = 32,200,000
    expect(r.standardPriceAtTransfer).toBe(32_200_000);
  });

  it("증가분이 자기 총액을 직접 입력했으면 자기 값 우선(override)", () => {
    const r = buildAssetPayload(
      incrementLand({ standardPriceAtTransfer: "50000000" }),
      "apportioned",
      TD,
      undefined,
      undefined,
      primaryLand("1000000"),
    );
    expect(r.standardPriceAtTransfer).toBe(50_000_000);
  });

  it("증가분 아님(일반 자산)이면 파생 안 함", () => {
    const normal = incrementLand({ isReplotIncrement: false });
    const r = buildAssetPayload(normal, "apportioned", TD, undefined, undefined, primaryLand("1000000"));
    expect(r.standardPriceAtTransfer).toBeUndefined();
  });

  it("당초분 ㎡당이 없으면 파생 불가(빈값 유지) — validate가 당초분 입력 유도", () => {
    const r = buildAssetPayload(incrementLand(), "apportioned", TD, undefined, undefined, primaryLand(""));
    expect(r.standardPriceAtTransfer).toBeUndefined();
  });

  it("primary 미전달 시 파생 안 함(방어)", () => {
    const r = buildAssetPayload(incrementLand(), "apportioned", TD, undefined, undefined, undefined);
    expect(r.standardPriceAtTransfer).toBeUndefined();
  });
});
