/**
 * anchor — 겸용주택 면적 검증 ⑧ (V2 합계 차단 + override 범위 + three-state).
 *
 * 설계: docs/02-design/features/mixed-use-area-single-source-editable.plan.md §3-4
 *
 * ⚠️ `totalLand > 0` 게이트 — 전체 토지를 입력하지 않는 기존 E2E 3개를 보호한다(P1).
 */
import { describe, it, expect } from "vitest";
import { validateMixedUseAreas } from "@/lib/calc/transfer-tax-validate-mixed-area";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

function asset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    isMixedUseHouse: true,
    residentialFloorArea: "100",
    nonResidentialFloorArea: "100",
    mixedUseTotalLandArea: "200",
    buildingFootprintArea: "100",
    ...over,
  };
}
const V = (a: AssetForm) => validateMixedUseAreas(a, "자산 1") ?? "";

describe("[V2] 부수토지 합계 차단", () => {
  it("L1: override 전무 → 통과 (기존 사용자 = 회귀 0)", () => {
    expect(V(asset())).toBe("");
  });

  it("L2: 주택만 → 통과 (상가가 잔액 흡수)", () => {
    expect(V(asset({ mixedResidentialLandAreaOverride: "90.29" }))).toBe("");
  });

  it("L3: 상가만 → 통과", () => {
    expect(V(asset({ mixedCommercialLandAreaOverride: "78.01" }))).toBe("");
  });

  it("L4: 둘 다 + 합 일치(200) → 통과", () => {
    expect(
      V(asset({
        mixedResidentialLandAreaOverride: "90.29",
        mixedCommercialLandAreaOverride: "109.71",
      })),
    ).toBe("");
  });

  it("★L5: 둘 다 + 합 불일치(168.3 ≠ 200) → 차단", () => {
    expect(
      V(asset({
        mixedResidentialLandAreaOverride: "90.29",
        mixedCommercialLandAreaOverride: "78.01",
      })),
    ).toMatch(/168\.3.*200.*다릅니다/);
  });

  it("L6/L7: 0 + 200 (three-state 적법) → 통과", () => {
    expect(
      V(asset({
        mixedResidentialLandAreaOverride: "0",
        mixedCommercialLandAreaOverride: "200",
      })),
    ).toBe("");
  });
});

describe("[PHD 배타 게이트] PHD ON → 부수토지 override 무시 (UI·API와 동일)", () => {
  // PHD ON이면 UI가 두 칸을 disabled로 막고 ↻ 리셋 배지도 숨긴다. 그 상태에서 stale override로
  // 차단하면 사용자가 오류를 해소할 경로가 없다(UI 통과 ↔ validate 차단 모순).
  // 엔진도 API 변환(`transfer-tax-api-mixed-use.ts:33·38`)에서 override를 받지 않는다.
  it("★PHD ON + 합 불일치 override → 통과 (차단하면 해소 불가능한 덫)", () => {
    expect(
      V(asset({
        usePreHousingDisclosure: true,
        mixedResidentialLandAreaOverride: "90.29",
        mixedCommercialLandAreaOverride: "78.01",
      })),
    ).toBe("");
  });

  it("PHD ON + 범위 초과 override(250 > 200) → 통과 (동일 사유)", () => {
    expect(
      V(asset({ usePreHousingDisclosure: true, mixedResidentialLandAreaOverride: "250" })),
    ).toBe("");
  });

  it("PHD ON이어도 정착면적 override는 계속 검증 (PHD 무관 축 — §168의12)", () => {
    expect(
      V(asset({ usePreHousingDisclosure: true, mixedResidentialFootprintOverride: "150" })),
    ).toMatch(/주택 정착면적/);
  });
});

describe("[V2 게이트] totalLand = 0 → 검증 skip (기존 E2E 보호 — P1)", () => {
  it("전체 토지 미입력 시 선행 필수검증이 먼저 차단 (합계 메시지 아님)", () => {
    const err = V(asset({ mixedUseTotalLandArea: "" }));
    expect(err).toMatch(/전체 토지 면적/);
    expect(err).not.toMatch(/다릅니다/);
  });
});

describe("[범위 가드] override 0 ≤ x ≤ 전체", () => {
  it("주택 부수토지 > 전체 토지 → 차단", () => {
    expect(V(asset({ mixedResidentialLandAreaOverride: "250" }))).toMatch(/주택 부수토지.*전체 토지면적/);
  });

  it("상가 부수토지 음수 → 차단", () => {
    expect(V(asset({ mixedCommercialLandAreaOverride: "-1" }))).toMatch(/상가 부수토지/);
  });

  it("주택 정착면적 > 건물 정착면적 → 차단", () => {
    expect(V(asset({ mixedResidentialFootprintOverride: "150" }))).toMatch(
      /주택 정착면적.*건물 정착면적/,
    );
  });

  it("주택 정착면적 = 0 (three-state 적법) → 통과", () => {
    expect(V(asset({ mixedResidentialFootprintOverride: "0" }))).toBe("");
  });
});
