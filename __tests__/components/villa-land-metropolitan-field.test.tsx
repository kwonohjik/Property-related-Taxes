/**
 * @vitest-environment jsdom
 *
 * anchor: 별장 화면의 「수도권 여부」 ⑤ 입력 경로 — UI 리뷰 高.
 *
 * 별장은 요건 미해당 시 엔진이 **주택부수토지로 자동 재분류**하고(`engine.ts:118`),
 * 그 뒤 인정면적은 `getHousingMultiplier(zoneType, isMetropolitan)`이 정한다. 그런데
 * 수도권 입력은 주택부수토지 화면(`HousingLandDetailSection`)에만 있어서, 별장 경로는
 * 항상 「미지정 → 보수적 기본값(수도권) 3배」로 계산됐다(`housing-land.ts:68`).
 *
 * 두 화면이 같은 값을 쓰므로 위젯을 `shared/MetropolitanAreaField`로 단일화한다 —
 * 배지의 배율 문구도 엔진 표에서 파생하므로 두 화면이 갈릴 수 없다.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { VillaLandDetailSection } from "@/components/calc/transfer/nbl/VillaLandDetailSection";
import { HousingLandDetailSection } from "@/components/calc/transfer/nbl/HousingLandDetailSection";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

function asset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...createDefaultTransferFormData().assets[0],
    assetKind: "land",
    nblUseDetailedJudgment: true,
    nblLandType: "villa_land",
    nblZoneType: "general_residential",
    ...over,
  } as AssetForm;
}

function metroRadios(): NodeListOf<HTMLInputElement> {
  // name은 assetId 스코프다 — 자산마다 달라지므로 셀렉터도 접두사로 잡는다.
  return document.querySelectorAll<HTMLInputElement>(
    'input[name^="nblIsMetropolitanArea-"]',
  );
}

describe("별장 화면 수도권 여부", () => {
  it("🔑 V-1: 별장 화면에 수도권 라디오가 렌더된다 (종전에는 입력 경로 자체가 없었다)", () => {
    render(<VillaLandDetailSection asset={asset()} onAssetChange={() => {}} />);
    const radios = metroRadios();
    expect(radios.length).toBe(3); // 수도권 · 비수도권 · 미확인
    expect([...radios].some((r) => r.checked)).toBe(false); // 기본 미선택
  });

  it("🔑 V-2: 비수도권을 고르면 자산에 기록된다 (①까지 배선)", () => {
    const onAssetChange = vi.fn();
    render(<VillaLandDetailSection asset={asset()} onAssetChange={onAssetChange} />);
    const no = [...metroRadios()].find((r) => r.value === "no");
    no?.click();
    expect(onAssetChange).toHaveBeenCalledWith({ nblIsMetropolitanArea: "no" });
  });

  it("V-3: 배지가 엔진 배율을 그대로 보인다 — 비수도권 일반주거는 5배", () => {
    const { container } = render(
      <VillaLandDetailSection
        asset={asset({ nblIsMetropolitanArea: "no" })}
        onAssetChange={() => {}}
      />,
    );
    expect(container.textContent).toContain("5배 적용");
  });

  it("V-4: 같은 입력에서 수도권을 고르면 3배 — 두 배율이 실제로 갈린다", () => {
    const { container } = render(
      <VillaLandDetailSection
        asset={asset({ nblIsMetropolitanArea: "yes" })}
        onAssetChange={() => {}}
      />,
    );
    expect(container.textContent).toContain("3배 적용");
  });

  it("V-5: 주택부수토지 화면도 같은 위젯을 쓴다 (두 화면이 갈릴 수 없다)", () => {
    render(
      <HousingLandDetailSection
        asset={asset({ nblLandType: "housing_site", nblIsMetropolitanArea: "no" })}
        onAssetChange={() => {}}
      />,
    );
    expect(metroRadios().length).toBe(3);
  });
});
