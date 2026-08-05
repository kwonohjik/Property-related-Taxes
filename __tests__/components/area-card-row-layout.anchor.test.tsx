/**
 * 면적 카드 한 행 배치 + 기준시가 계산기 연면적 칸 제거 — anchor
 *
 * 계획서: docs/02-design/features/general-building-area-row-always-visible.plan.md
 *
 * 고정 계약:
 *   A1 GB 「건물 연면적」은 **취득가액 산정 방식과 무관하게 항상** 렌더된다
 *      (종전 `useEstimatedAcquisition` 게이트 — 실거래가 모드에서 입력 경로가 없어
 *       「양도시 기준시가」 계산기 prefill이 항상 빈 값이었다)
 *   A2 GB 면적 3필드는 **한 행**(sm:grid-cols-3)의 형제로 렌더된다
 *   A3 GB·CB 면적 카드에 hint 문단이 없다
 *   A4 1시점 기준시가 계산기는 `hideFloorAreaInput`일 때 연면적 **입력 칸이 없고**,
 *      상위 값이 비면 입력 위치 안내만 남긴다(연면적 0 오산 방지)
 *   A5 일괄 계산 모달은 `hideFloorAreaInput` + **행 1개**일 때만 연면적 칸을 숨긴다.
 *      「+ 부분 추가」로 2행이 되면 각 행이 자기 연면적을 받아야 한다(층별 구조·용도 분할).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { AssetAreaGeneralBuilding } from "@/components/calc/transfer/asset-sections/AssetAreaGeneralBuilding";
import { AssetAreaCommercial } from "@/components/calc/transfer/asset-sections/AssetAreaCommercial";
import { BuildingStdPriceModalButton } from "@/components/calc/building-std-price/BuildingStdPriceModalButton";
import { MultiPointBuildingStdPriceModal } from "@/components/calc/building-std-price/MultiPointBuildingStdPriceModal";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

// RTL cleanup은 프로젝트 규약상 수동 등록 (memory feedback_rtl_manual_cleanup_required)
afterEach(() => cleanup());

function gbAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    acquisitionCause: "purchase",
    acquisitionDate: "2010-05-01",
    ...over,
  } as AssetForm;
}

function cbAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "commercial_building",
    acquisitionCause: "purchase",
    acquisitionDate: "2010-05-01",
    ...over,
  } as AssetForm;
}

describe("A1 — GB 연면적은 취득가액 산정 방식과 무관하게 항상 렌더", () => {
  it("실거래가 모드(useEstimatedAcquisition=false)에서도 「건물 연면적」이 있다", () => {
    render(
      <AssetAreaGeneralBuilding
        asset={gbAsset({ useEstimatedAcquisition: false })}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText("건물 연면적")).toBeInTheDocument();
  });

  it("환산취득가 모드에서도 그대로 있다 (회귀 0)", () => {
    render(
      <AssetAreaGeneralBuilding
        asset={gbAsset({ useEstimatedAcquisition: true })}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText("건물 연면적")).toBeInTheDocument();
  });
});

describe("A2 — GB 면적 3필드는 한 행", () => {
  it("3필드가 sm:grid-cols-3 그리드의 형제로 렌더된다", () => {
    const { container } = render(
      <AssetAreaGeneralBuilding asset={gbAsset()} onChange={vi.fn()} />,
    );
    const row = container.querySelector(".sm\\:grid-cols-3");
    expect(row).not.toBeNull();
    expect(row!.querySelectorAll('[data-slot="field-card"]')).toHaveLength(3);
  });
});

describe("A3 — 면적 카드에 hint 문단이 없다", () => {
  it("GB: 토지·연면적·바닥면적 hint 3종이 모두 사라졌다", () => {
    render(<AssetAreaGeneralBuilding asset={gbAsset()} onChange={vi.fn()} />);
    expect(screen.queryByText(/등기부등본 또는 토지대장/)).toBeNull();
    expect(screen.queryByText(/환산취득가 참고용/)).toBeNull();
    expect(screen.queryByText(/가장 넓은/)).toBeNull();
  });

  it("CB: 전용·공유·대지 hint 3종이 모두 사라졌다", () => {
    render(<AssetAreaCommercial asset={cbAsset()} onChange={vi.fn()} />);
    expect(screen.queryByText(/분양면적에서 공유면적 제외/)).toBeNull();
    expect(screen.queryByText(/계단·복도 등 공유부분/)).toBeNull();
    expect(screen.queryByText(/대지권 면적/)).toBeNull();
  });

  it("CB: 라벨 3종은 그대로 남는다", () => {
    render(<AssetAreaCommercial asset={cbAsset()} onChange={vi.fn()} />);
    expect(screen.getByText("전용면적")).toBeInTheDocument();
    expect(screen.getByText("공유면적")).toBeInTheDocument();
    expect(screen.getByText("대지면적")).toBeInTheDocument();
  });
});

describe("A4 — 1시점 기준시가 계산기 연면적 칸", () => {
  it("hideFloorAreaInput + prefill 있음 → 연면적 입력 칸도 안내도 없다", () => {
    render(
      <BuildingStdPriceModalButton
        lockedTaxType="transfer"
        hideFloorAreaInput
        prefill={{ floorArea: "180.96" }}
        onApply={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /건물 기준시가 계산/ }));
    expect(screen.queryByPlaceholderText("건물 연면적")).toBeNull();
    expect(screen.queryByText(/기본정보/)).toBeNull();
  });

  it("hideFloorAreaInput + prefill 없음 → 칸은 없고 입력 위치 안내만 남는다", () => {
    render(
      <BuildingStdPriceModalButton
        lockedTaxType="transfer"
        hideFloorAreaInput
        onApply={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /건물 기준시가 계산/ }));
    expect(screen.queryByPlaceholderText("건물 연면적")).toBeNull();
    expect(screen.getByText(/기본정보.*면적·규모/)).toBeInTheDocument();
  });

  it("미지정(상속·증여 등 나머지 호출부) → 연면적 칸 유지 (회귀 0)", () => {
    render(
      <BuildingStdPriceModalButton lockedTaxType="transfer" onApply={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /건물 기준시가 계산/ }));
    expect(screen.getByPlaceholderText("건물 연면적")).toBeInTheDocument();
  });
});

describe("A5 — 일괄 계산 모달 연면적 칸은 행 1개일 때만 숨긴다", () => {
  const twoPoints = [
    { key: "acquisition" as const, label: "취득시", year: 2010, landPricePerM2: "" },
    { key: "transfer" as const, label: "양도시", year: 2025, landPricePerM2: "" },
  ];

  it("hideFloorAreaInput + 행 1개(기본) → 연면적 칸이 없다", () => {
    render(
      <MultiPointBuildingStdPriceModal
        points={twoPoints}
        onApply={vi.fn()}
        hideFloorAreaInput
        housingFloorAreaPrefill="180.96"
      />,
    );
    fireEvent.click(screen.getByText("2시점 건물기준시가 일괄 계산"));
    expect(screen.queryByPlaceholderText("연면적")).toBeNull();
  });

  it("hideFloorAreaInput + 「+ 부분 추가」로 2행 → 각 행에 연면적 칸이 나타난다", () => {
    render(
      <MultiPointBuildingStdPriceModal
        points={twoPoints}
        onApply={vi.fn()}
        hideFloorAreaInput
        housingFloorAreaPrefill="180.96"
      />,
    );
    fireEvent.click(screen.getByText("2시점 건물기준시가 일괄 계산"));
    fireEvent.click(screen.getByText("+ 부분 추가"));
    expect(screen.getAllByPlaceholderText("연면적")).toHaveLength(2);
  });

  it("미지정(겸용·PHD 등 나머지 호출부) → 행 1개에서도 연면적 칸 유지 (회귀 0)", () => {
    render(<MultiPointBuildingStdPriceModal points={twoPoints} onApply={vi.fn()} />);
    fireEvent.click(screen.getByText("2시점 건물기준시가 일괄 계산"));
    expect(screen.getByPlaceholderText("연면적")).toBeInTheDocument();
  });
});
