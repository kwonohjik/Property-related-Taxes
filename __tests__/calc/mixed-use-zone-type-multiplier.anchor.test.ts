/**
 * anchor: 겸용주택 부수토지 배율의 **용도지역 축** (UI 리뷰 高 `desc-promises-unreachable-branch`).
 *
 * 배율은 `getHousingMultiplier(zoneType, isMetro, transferDate)`가 **2축**으로 정한다
 * (`non-business-land/urban-area.ts:106`). 그런데 겸용 경로만 ④가
 * `zoneType: "residential"`을 **하드코딩**해 도달 가능한 값이 3배·5배 둘뿐이었다 —
 * 화면 설명이 약속한 「도시지역 밖 10배」·「수도권 녹지 5배」는 영원히 적용되지 않았고,
 * 비도시지역 상가주택은 인정 부수토지가 절반으로 잘려 초과분이 비사업용 토지로 넘어가
 * +10%p 중과·장특 배제를 받았다(세액 과대).
 *
 * ⭐ 미선택(`""`)은 **키를 싣지 않는다** — 엔진의 `?? "residential"` 폴백이 종전 동작을
 *    유지한다(구 세션 회귀 0). ⑧은 배율이 실제로 갈릴 때(정착면적 × 3배 초과)만 요구한다.
 */
import { describe, it, expect } from "vitest";
import { buildMixedUsePayload } from "@/lib/calc/transfer-tax-api-mixed-use";
import { validateMixedUseAreas } from "@/lib/calc/transfer-tax-validate-mixed-area";
import { getHousingMultiplier } from "@/lib/tax-engine/non-business-land/urban-area";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

/** 정착 100㎡ · 부수토지 900㎡ — 3배(300)·5배(500)·10배(1000)에서 초과분이 모두 다르다. */
function asset(over: Record<string, unknown> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    isMixedUseHouse: true,
    residentialFloorArea: "100",
    nonResidentialFloorArea: "100",
    buildingFootprintArea: "200",
    mixedUseTotalLandArea: "1800",
    mixedResidentialLandAreaOverride: "900",
    mixedResidentialFootprintOverride: "100",
    mixedIsMetropolitanArea: true,
    ...over,
  } as unknown as AssetForm;
}

function form(a: AssetForm): TransferFormData {
  return { assets: [a], transferDate: "2027-03-10" } as unknown as TransferFormData;
}

function payloadZone(a: AssetForm): unknown {
  const p = buildMixedUsePayload(a, form(a)) as Record<string, unknown> | undefined;
  return p ? (p as Record<string, unknown>).zoneType : undefined;
}

describe("겸용주택 부수토지 — 용도지역 축", () => {
  it("🔑 선택한 용도지역이 ④를 통해 엔진에 도달한다 (종전 하드코딩)", () => {
    expect(payloadZone(asset({ mixedZoneType: "agriculture_forest" }))).toBe("agriculture_forest");
    expect(payloadZone(asset({ mixedZoneType: "green" }))).toBe("green");
  });

  it("미선택이면 키를 싣지 않는다 — 엔진 폴백이 종전 동작을 유지한다", () => {
    expect(payloadZone(asset())).toBeUndefined();
  });

  it("🔑 도시지역 밖 10배가 이제 도달한다 (종전에는 영원히 3·5배)", () => {
    expect(getHousingMultiplier("agriculture_forest", true).multiplier).toBe(10);
    expect(getHousingMultiplier("residential", true).multiplier).toBe(3);
    // 900㎡ 부수토지 · 정착 100㎡ → 10배면 초과 0, 3배면 600㎡가 비사업용으로 넘어간다.
    expect(900 - 100 * 10).toBeLessThanOrEqual(0);
    expect(900 - 100 * 3).toBe(600);
  });

  it("수도권 녹지 5배도 도달한다", () => {
    expect(getHousingMultiplier("green", true).multiplier).toBe(5);
  });

  it("🔴 ⑧: 초과가 생길 수 있으면 용도지역을 요구한다", () => {
    expect(validateMixedUseAreas(asset(), "자산")).toMatch(/용도지역을 선택하세요/);
  });

  it("🔑 ⑧: 3배로도 초과가 없으면 묻지 않는다 (필요 없는 입력 강제 금지)", () => {
    const small = asset({
      mixedResidentialLandAreaOverride: "250", // 정착 100 × 3배 = 300 이내
      mixedCommercialLandAreaOverride: "1550",
    });
    expect(validateMixedUseAreas(small, "자산")).toBeNull();
  });

  it("⑧: 용도지역을 고르면 통과한다", () => {
    expect(validateMixedUseAreas(asset({ mixedZoneType: "green" }), "자산")).toBeNull();
  });

  /**
   * ⭐ 임계 배율은 **축마다 다르다** — 리뷰 게이트가 잡아낸 오탐이다.
   * 수도권 밖은 도시지역이 일률 5배라 **3배는 애초에 도달 불가**이고,
   * 2022.1.1. 前 양도는 부칙 §39 경과조치로 도시지역이 일률 5배다.
   * 임계를 3으로 고정하면 3~5배 구간에서 「어느 선택도 결과가 같은데」 차단한다.
   */
  it("🔑 수도권 밖 3~5배 구간 — 어느 용도지역도 초과 0이라 묻지 않는다", () => {
    // 정착 100㎡ · 부수토지 400㎡ → 3배(300) 초과이지만 5배(500) 이내.
    const outside = asset({
      mixedIsMetropolitanArea: false,
      mixedResidentialLandAreaOverride: "400",
      mixedCommercialLandAreaOverride: "1400",
    });
    for (const z of ["residential", "green", "unplanned", "agriculture_forest"] as const) {
      expect(getHousingMultiplier(z, false).multiplier).toBeGreaterThanOrEqual(5);
    }
    expect(validateMixedUseAreas(outside, "자산")).toBeNull();
  });

  it("수도권 밖에서도 5배를 넘으면 묻는다 (미탐 방지)", () => {
    const outside = asset({
      mixedIsMetropolitanArea: false,
      mixedResidentialLandAreaOverride: "900", // 5배(500) 초과 · 10배(1000) 이내 → 선택이 갈린다
    });
    expect(validateMixedUseAreas(outside, "자산")).toMatch(/용도지역을 선택하세요/);
  });

  it("🔑 2022.1.1. 前 양도 — 경과조치로 도시지역 일률 5배라 임계도 5다", () => {
    // 수도권이어도 종전 규정에서는 3배가 없다(부칙 §39).
    const before2022 = asset({
      mixedResidentialLandAreaOverride: "400",
      mixedCommercialLandAreaOverride: "1400",
    });
    expect(validateMixedUseAreas(before2022, "자산", "2021-12-31")).toBeNull();
    // 같은 입력이 2022.1.1. 이후 양도면 3배 초과라 묻는다.
    expect(validateMixedUseAreas(before2022, "자산", "2022-01-01")).toMatch(
      /용도지역을 선택하세요/,
    );
  });
});
