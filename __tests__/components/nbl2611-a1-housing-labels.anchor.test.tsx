/**
 * NBL2611 A1 — 주택부수토지 화면 안내 anchor (V9-J 배율 배지 양도일 · V4-Q 정착면적 정의).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { HousingLandDetailSection } from "@/components/calc/transfer/nbl/HousingLandDetailSection";
import { VillaLandDetailSection } from "@/components/calc/transfer/nbl/VillaLandDetailSection";
import { getHousingMultiplier } from "@/lib/tax-engine/non-business-land/urban-area";
import { FOOTPRINT_DEFINITION } from "@/lib/calc/footprint-definition-copy";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(() => cleanup());

function asset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "land",
    nblUseDetailedJudgment: true,
    nblLandType: "housing_site",
    nblIsMetropolitanArea: "yes",
    nblZoneType: "general_residential",
    ...over,
  } as AssetForm;
}

describe("NBL2611-V9-J 주택부수토지 배율 배지 — 양도일을 본다", () => {
  it("엔진 전제: 수도권 일반주거 — 2022.1.1. 전 5배 · 이후 3배", () => {
    expect(getHousingMultiplier("general_residential", true, new Date("2021-12-31")).multiplier).toBe(5);
    expect(getHousingMultiplier("general_residential", true, new Date("2022-01-01")).multiplier).toBe(3);
  });

  it("2021-12-31 양도: 배지 5배 (종전: 양도일을 안 받아 3배 표시)", () => {
    render(<HousingLandDetailSection asset={asset()} onAssetChange={vi.fn()} transferDate="2021-12-31" />);
    expect(screen.getByText(/5배 적용/)).toBeInTheDocument();
    expect(screen.queryByText(/3배 적용/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/2022\.1\.1\. 전 양도분\(종전 규정\)/).length).toBeGreaterThan(0);
  });

  it("2022-01-01 양도: 배지 3배", () => {
    render(<HousingLandDetailSection asset={asset()} onAssetChange={vi.fn()} transferDate="2022-01-01" />);
    expect(screen.getByText(/3배 적용/)).toBeInTheDocument();
  });

  it("양도일 미입력: 현행 규정 기준임을 배지에 밝힌다", () => {
    render(<HousingLandDetailSection asset={asset()} onAssetChange={vi.fn()} />);
    expect(screen.getByText(/양도일 미입력, 현행 규정 기준/)).toBeInTheDocument();
  });

  it("별장 재분류 경로도 같은 배지(양도일 전달)", () => {
    render(
      <VillaLandDetailSection
        asset={asset({ nblLandType: "villa_land" } as Partial<AssetForm>)}
        onAssetChange={vi.fn()}
        transferDate="2021-12-31"
      />,
    );
    expect(screen.getByText(/5배 적용/)).toBeInTheDocument();
  });
});

describe("NBL2611-V4-Q 정착면적 안내 — 건축면적(「건축법 시행령」 §119) 단일 문구", () => {
  it("공용 문구는 건축면적·§119①2호·해석례를 가리키고 「1층」·「땅에 닿는」 표현이 없다", () => {
    expect(FOOTPRINT_DEFINITION).toContain("건축면적");
    expect(FOOTPRINT_DEFINITION).toContain("「건축법 시행령」 §119①2호");
    expect(FOOTPRINT_DEFINITION).toContain("서면-2018-부동산-3849");
    expect(FOOTPRINT_DEFINITION).not.toMatch(/1층|땅에 닿/);
  });

  it("주택부수토지 화면 hint가 공용 문구를 쓴다", () => {
    render(<HousingLandDetailSection asset={asset()} onAssetChange={vi.fn()} />);
    expect(screen.getByText(/연면적이 아닙니다/)).toBeInTheDocument();
    expect(screen.getByText(/건축법 시행령」 §119①2호/)).toBeInTheDocument();
  });

  it("별장 화면 정착면적 hint도 같은 정의를 쓴다", () => {
    render(
      <VillaLandDetailSection asset={asset({ nblLandType: "villa_land" } as Partial<AssetForm>)} onAssetChange={vi.fn()} />,
    );
    expect(screen.getByText(new RegExp(FOOTPRINT_DEFINITION.slice(0, 20)))).toBeInTheDocument();
  });
});
