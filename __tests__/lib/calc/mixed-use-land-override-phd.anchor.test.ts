/**
 * anchor: 겸용주택 부수토지 override는 **PHD 여부와 무관**하게 엔진에 도달한다.
 *
 * 배경 — 배타가 지키던 것이 없었다:
 *   구현은 PHD ON이면 ①카드 override를 전송하지 않았다. 명분은 "PHD 쪽 입력
 *   (`preHousingDisclosure.landArea`)이 담당한다"였으나, 그 필드는 ⑫ Zod
 *   (`phdForMixedUseSchema` — landArea 미포함)가 strip해 **엔진에 도달한 적이 없다**.
 *   엔진(`transfer-tax-mixed-use-helpers.ts:167-169`)은 그래서 항상
 *   `derived.residentialLandArea`(자동 안분)로 떨어졌다.
 *   ⇒ PHD ON이면 사용자가 부수토지를 **어디서도 지정할 수 없었다**(자동 안분 강제).
 *
 * 부수토지 면적은 §164⑦이 정하는 값이 아니라 건축물대장·등기의 **사실관계**다.
 * ①카드를 면적 단일 소스로 삼는 요구사항과도 배타는 모순이었다.
 *
 * 엔진은 이미 `derived`가 override를 반영하므로, 전송 게이트만 걷으면 관철된다.
 */
import { describe, it, expect } from "vitest";
import { buildMixedUsePayload } from "@/lib/calc/transfer-tax-api-mixed-use";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { computeDerivedAreas } from "@/lib/tax-engine/mixed-use-derived-areas";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

function asset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    isMixedUseHouse: true,
    residentialFloorArea: "72",
    nonResidentialFloorArea: "48",
    mixedUseTotalLandArea: "200",
    buildingFootprintArea: "100",
    acquisitionDate: "2010-06-15",
    ...over,
  };
}
const form = { transferDate: "2025-05-01", assets: [] } as unknown as TransferFormData;
const payload = (a: AssetForm) =>
  buildMixedUsePayload(a, form) as Record<string, unknown> | undefined;

describe("[PHD ON] 부수토지 override 전송 — 배타 해제", () => {
  it("★PHD ON + 주택 부수토지 override → 엔진에 전달된다", () => {
    const p = payload(asset({ usePreHousingDisclosure: true, mixedResidentialLandAreaOverride: "90.29" }));
    expect(p?.residentialLandAreaOverride).toBe(90.29);
  });

  it("★PHD ON + 상가 부수토지 override → 엔진에 전달된다", () => {
    const p = payload(asset({ usePreHousingDisclosure: true, mixedCommercialLandAreaOverride: "109.71" }));
    expect(p?.commercialLandAreaOverride).toBe(109.71);
  });

  it("PHD OFF도 동일 (회귀 0)", () => {
    const p = payload(asset({ mixedResidentialLandAreaOverride: "90.29" }));
    expect(p?.residentialLandAreaOverride).toBe(90.29);
  });

  it("override 미설정 → 미전송 (three-state 유지 — 자동 안분)", () => {
    const p = payload(asset({ usePreHousingDisclosure: true }));
    expect(p).not.toHaveProperty("residentialLandAreaOverride");
    expect(p).not.toHaveProperty("commercialLandAreaOverride");
  });

  it('적법한 "0" 보존 (PHD ON에서도)', () => {
    const p = payload(asset({ usePreHousingDisclosure: true, mixedResidentialLandAreaOverride: "0" }));
    expect(p?.residentialLandAreaOverride).toBe(0);
  });
});

describe("[엔진 관철] override가 PHD 경로의 주택부수토지 면적을 실제로 바꾼다", () => {
  // 엔진 `buildHousingEstimatedAcq`는 PHD 분기에서 derived.residentialLandArea를 쓴다
  // (preHousingDisclosure.landArea는 Zod strip으로 항상 undefined).
  // 따라서 derived가 override를 반영하면 PHD 계산의 토지면적이 바뀐다.
  it("override 없으면 자동 안분(120), 있으면 지정값(90.29)", () => {
    const auto = computeDerivedAreas({
      residentialFloorArea: 72,
      nonResidentialFloorArea: 48,
      buildingFootprintArea: 100,
      totalLandArea: 200,
    });
    expect(auto.residentialLandArea).toBe(120);

    const overridden = computeDerivedAreas({
      residentialFloorArea: 72,
      nonResidentialFloorArea: 48,
      buildingFootprintArea: 100,
      totalLandArea: 200,
      residentialLandAreaOverride: 90.29,
    });
    expect(overridden.residentialLandArea).toBe(90.29);
    expect(overridden.commercialLandArea).toBe(109.71); // 잔액 흡수
  });
});
