/**
 * anchor — NBL 주택부수토지 정착면적 라벨·배율 안내 정확성 (Phase B)
 *
 * ## 정정 1 — 라벨이 법문과 달랐다 (과소과세 방향)
 *
 * 종전 라벨: "주택 **연면적**". 그러나 필드명은 `nblHousingFootprint`(정착면적)이고
 * 엔진도 정착면적으로 소비한다(`housing-land.ts:71` `allowedArea = footprint × multiplier`).
 *
 * 법령 원문 (KoreanLaw 실측 — 소득세법 MST 280405, 시행일 2026-07-01):
 *   법 §104조의3①5호: "주택부속토지 중 **주택이 정착된 면적**에 지역별로 대통령령으로
 *   정하는 배율을 곱하여 산정한 면적을 초과하는 토지"
 *
 * → 정착면적(바닥면적)이 맞다. 3층 건물이면 연면적이 바닥면적의 3배이므로, 라벨대로
 *   연면적을 입력하면 허용면적이 3배 과대 산정되어 **비사업용 판정을 놓친다**.
 *
 * ## 정정 2 — 배율 안내가 틀렸다
 *
 * 종전 UI: "비수도권: 10배 배율이 적용됩니다."
 * 그러나 §168의12는 **1호다목 수도권 밖 도시지역 = 5배**, 2호 그 밖(도시지역 外) = 10배다.
 * 엔진(`urban-area.ts:88`)은 이미 정확했고 **UI 안내만 틀렸다**(dual truth).
 *
 * → 배지를 엔진 `getHousingMultiplier` 재사용으로 전환(단일 진실). UI 재구현 금지 정책 준수.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { HousingLandDetailSection } from "@/components/calc/transfer/nbl/HousingLandDetailSection";
import { getHousingMultiplier } from "@/lib/tax-engine/non-business-land/urban-area";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(() => cleanup());

function renderSection(over: Partial<AssetForm> = {}) {
  const asset: AssetForm = {
    ...makeDefaultAsset(1),
    assetKind: "land",
    nblUseDetailedJudgment: true,
    nblLandType: "housing_site",
    ...over,
  } as AssetForm;
  return render(
    <HousingLandDetailSection asset={asset} onAssetChange={vi.fn()} />,
  );
}

describe("라벨 — 법문 「주택이 정착된 면적」", () => {
  it("「주택 정착면적」으로 표시된다", () => {
    renderSection();
    expect(screen.getByText("주택 정착면적")).toBeInTheDocument();
  });

  it("종전 오라벨 「주택 연면적」은 더 이상 없다", () => {
    renderSection();
    expect(screen.queryByText("주택 연면적")).not.toBeInTheDocument();
  });

  it("hint가 연면적과의 혼동을 명시적으로 차단한다", () => {
    renderSection();
    expect(screen.getByText(/연면적이 아닙니다/)).toBeInTheDocument();
  });
});

describe("배율 안내 — 엔진 단일 진실 (§168의12)", () => {
  it("비수도권 도시지역(주거)은 5배 — 종전 '10배' 오안내 정정", () => {
    renderSection({
      nblIsMetropolitanArea: "no",
      nblZoneType: "general_residential",
    } as Partial<AssetForm>);
    // 엔진 기대값과 대조 — UI가 자체 계산하지 않음을 보장
    const expected = getHousingMultiplier("general_residential", false);
    expect(expected.multiplier).toBe(5);
    expect(screen.getByText(new RegExp(`${expected.multiplier}배 적용`))).toBeInTheDocument();
  });

  it("비수도권 도시지역 外는 10배", () => {
    renderSection({
      nblIsMetropolitanArea: "no",
      nblZoneType: "agriculture_forest",
    } as Partial<AssetForm>);
    expect(getHousingMultiplier("agriculture_forest", false).multiplier).toBe(10);
    expect(screen.getByText(/10배 적용/)).toBeInTheDocument();
  });

  it("수도권 주·상·공은 3배", () => {
    renderSection({
      nblIsMetropolitanArea: "yes",
      nblZoneType: "general_residential",
    } as Partial<AssetForm>);
    expect(getHousingMultiplier("general_residential", true).multiplier).toBe(3);
    expect(screen.getByText(/3배 적용/)).toBeInTheDocument();
  });

  it("수도권 녹지는 5배", () => {
    renderSection({
      nblIsMetropolitanArea: "yes",
      nblZoneType: "green",
    } as Partial<AssetForm>);
    expect(getHousingMultiplier("green", true).multiplier).toBe(5);
    expect(screen.getByText(/5배 적용/)).toBeInTheDocument();
  });

  it("수도권 여부 미선택이면 배지 없음 (추정 표시 금지)", () => {
    renderSection({ nblIsMetropolitanArea: "" } as Partial<AssetForm>);
    expect(screen.queryByText(/배 적용/)).not.toBeInTheDocument();
  });
});
