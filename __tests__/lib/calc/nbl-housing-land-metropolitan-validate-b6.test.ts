// B6 회귀 — 주택부수토지(§168-12) 도시 주·상·공 배율 수도권 여부 미입력 차단.
//
// isMetropolitanArea 미선택 시 엔진(housing-land.ts)이 수도권(불리, 3배)로 default → 유리-default
// 정책상 계산 전 차단. 단, 배율이 실제 달라지는 urban 주·상·공 zoneType에서만(녹지·도시외 무관).
import { describe, it, expect } from "vitest";
import { validateNblDetailedJudgment } from "@/lib/calc/transfer-tax-validate-nbl";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

function nblAsset(overrides: Partial<AssetForm> = {}): AssetForm {
  return {
    ...createDefaultTransferFormData().assets[0],
    assetKind: "land",
    acquisitionCause: "purchase",
    acquisitionDate: "2015-01-01",
    acquisitionArea: "1000",
    nblUseDetailedJudgment: true,
    nblLandType: "housing_site",
    nblZoneType: "general_residential",
    nblIsMetropolitanArea: "",
    // PR-1(2026-09-02)에서 정착면적(E1-03)·도시지역 편입일(V5-b) 차단이 추가됐다.
    // 이 파일의 축은 **수도권 여부**뿐이므로, 다른 축의 필수 입력은 채워 두어 축을 격리한다.
    nblHousingFootprint: "100",
    nblUrbanIncorporationDate: "2010-01-01",
    ...overrides,
  } as AssetForm;
}

const msg = "수도권 여부를 선택하세요";

describe("[B6] 주택부수토지 수도권 여부 미입력 차단", () => {
  it("B6-1: housing_site + 일반주거(urban 주상공) + 수도권 미선택 → 차단", () => {
    expect(validateNblDetailedJudgment(nblAsset(), "자산 1", "2024-05-01")).toContain(msg);
  });

  it("B6-2: 수도권='yes' → 통과", () => {
    expect(validateNblDetailedJudgment(nblAsset({ nblIsMetropolitanArea: "yes" }), "자산 1", "2024-05-01")).toBeNull();
  });

  it("B6-3: 수도권='no' → 통과", () => {
    expect(validateNblDetailedJudgment(nblAsset({ nblIsMetropolitanArea: "no" }), "자산 1", "2024-05-01")).toBeNull();
  });

  it("B6-4: 녹지(green) + 미선택 → 통과(수도권 무관, 차단 금지)", () => {
    expect(validateNblDetailedJudgment(nblAsset({ nblZoneType: "green" }), "자산 1", "2024-05-01")).toBeNull();
  });

  it("B6-5: 도시 外(agriculture_forest) + 미선택 → 통과", () => {
    expect(validateNblDetailedJudgment(nblAsset({ nblZoneType: "agriculture_forest" }), "자산 1", "2024-05-01")).toBeNull();
  });

  it("B6-6: farmland(비 주택부수토지) + 미선택 → 통과", () => {
    expect(validateNblDetailedJudgment(nblAsset({ nblLandType: "farmland" }), "자산 1", "2024-05-01")).toBeNull();
  });

  it("B6-7: villa_land + urban 주거 + 미선택 → 통과(redirect edge, housing_site 한정)", () => {
    expect(validateNblDetailedJudgment(nblAsset({ nblLandType: "villa_land" }), "자산 1", "2024-05-01")).toBeNull();
  });

  it("B6-8: 무조건 의제(§168의14③) + 미선택 → 통과(배율 판정 skip)", () => {
    const exempt = nblAsset({
      nblExemptPublicExpropriation: true,
      nblExemptPublicNoticeDate: "2004-04-23", // ≤ 2006-12-31 → isExempt
    } as Partial<AssetForm>);
    expect(validateNblDetailedJudgment(exempt, "자산 1", "2024-05-01")).toBeNull();
  });
});
