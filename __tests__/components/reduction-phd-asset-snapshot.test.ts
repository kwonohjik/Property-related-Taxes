/**
 * F5 — §99의3 감면 PHD ↔ 자산-수준 PHD dual-truth 완화 스냅샷 (buildAssetPhdSnapshot).
 * 자산 PHD(§164⑤) 활성 시 동일 3시점 base를 "자산 카드 PHD 가져오기" 소스로 노출.
 * 계획서: docs/02-design/features/transfer-surcharge-transition-followups.plan.md §F5.
 */
import { describe, it, expect } from "vitest";
import { buildAssetPhdSnapshot } from "@/components/calc/transfer/UnifiedReductionPanel";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

function assetWithPhd(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    usePreHousingDisclosure: true,
    phdFirstDisclosureDate: "2006-01-01",
    phdFirstDisclosureHousingPrice: "250,000,000",
    phdResidentialLandArea: "120.5",
    phdLandPricePerSqmAtAcq: "1,000,000",
    phdLandPricePerSqmAtFirst: "1,500,000",
    phdBuildingStdPriceAtAcq: "80,000,000",
    phdBuildingStdPriceAtFirst: "100,000,000",
    ...over,
  };
}

describe("buildAssetPhdSnapshot", () => {
  it("자산 PHD 활성 + 값 존재 → 동일 3시점 base 스냅샷 (버튼 활성)", () => {
    const snap = buildAssetPhdSnapshot(assetWithPhd());
    expect(snap).toEqual({
      firstDisclosureDate: "2006-01-01",
      firstDisclosurePrice: "250,000,000",
      landAreaSqm: "120.5",
      landPricePerSqmAtAcq: "1,000,000",
      landPricePerSqmAtFirst: "1,500,000",
      buildingStdAtAcq: "80,000,000",
      buildingStdAtFirst: "100,000,000",
    });
  });

  it("usePreHousingDisclosure OFF → undefined (버튼 비활성)", () => {
    expect(buildAssetPhdSnapshot(assetWithPhd({ usePreHousingDisclosure: false }))).toBeUndefined();
  });

  it("PHD 활성이나 모든 값 빈 문자열 → undefined (빈 스냅샷 노출 안 함)", () => {
    const empty = {
      ...makeDefaultAsset(1),
      usePreHousingDisclosure: true,
      phdFirstDisclosureDate: "",
      phdFirstDisclosureHousingPrice: "",
      phdResidentialLandArea: "",
      acquisitionArea: "",
      phdLandPricePerSqmAtAcq: "",
      phdLandPricePerSqmAtFirst: "",
      phdBuildingStdPriceAtAcq: "",
      phdBuildingStdPriceAtFirst: "",
    } as AssetForm;
    expect(buildAssetPhdSnapshot(empty)).toBeUndefined();
  });

  it("landAreaSqm fallback — phdResidentialLandArea 없으면 acquisitionArea 사용", () => {
    const snap = buildAssetPhdSnapshot(
      assetWithPhd({ phdResidentialLandArea: "", acquisitionArea: "99.9" }),
    );
    expect(snap?.landAreaSqm).toBe("99.9");
  });
});
