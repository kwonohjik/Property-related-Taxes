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

// 2026-07-15 배타 해제 — PHD ON에서도 부수토지 override가 유효하다(UI 편집 가능·API 전송).
// 종전 이 describe는 "PHD ON → override 무시"를 고정했다. 근거는 "PHD의
// preHousingDisclosure.landArea가 담당"이었으나 그 필드는 ⑫ Zod가 strip해 엔진 미도달이었다
// → PHD ON이면 부수토지를 어디서도 지정할 수 없었다. 게이트를 걷었으므로 anchor도 반전한다.
// (종전의 "차단하면 해소 불가능한 덫" 우려는 칸이 editable이 되면서 소멸 — 사용자가 고칠 수 있다.)
describe("[PHD 무관] PHD ON에서도 부수토지 override를 검증한다 (UI·API와 동일)", () => {
  it("★PHD ON + 합 불일치 override → 차단 (PHD OFF와 동일)", () => {
    expect(
      V(asset({
        usePreHousingDisclosure: true,
        mixedResidentialLandAreaOverride: "90.29",
        mixedCommercialLandAreaOverride: "78.01",
      })),
    ).toMatch(/168\.3.*200.*다릅니다/);
  });

  it("PHD ON + 범위 초과 override(250 > 200) → 차단 (동일)", () => {
    expect(
      V(asset({ usePreHousingDisclosure: true, mixedResidentialLandAreaOverride: "250" })),
    ).toMatch(/주택 부수토지.*전체 토지면적/);
  });

  it("PHD ON + 합 일치 → 통과", () => {
    expect(
      V(asset({
        usePreHousingDisclosure: true,
        mixedResidentialLandAreaOverride: "90.29",
        mixedCommercialLandAreaOverride: "109.71",
      })),
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
