/**
 * @vitest-environment jsdom
 *
 * anchor P-1~P-3 — 「양도가액 토지·건물 안분 방식」의 **배치**(2026-08-07 · 사용자 요청)
 *
 * 종전에는 ③ 취득 탭의 `GeneralBuildingBlock` 안(② 건물 기준시가 카드에 중첩)에 있었다.
 * 양도가액을 토지·건물로 어떻게 나눌지는 **양도 정보**이므로 ② 양도 탭으로 옮겼다.
 *
 * 고정 계약:
 *   P-1 ② 양도 탭에서 일반건물이면 이 섹션이 렌더된다
 *   P-2 일반건물이 아니면 렌더되지 않는다 (다른 자산은 `LandBuildingSaleSplitSection` 경로)
 *   P-3 ③ 취득 탭(`GeneralBuildingBlock`)에는 더 이상 없다 — 두 탭에 동시에 뜨면
 *       같은 `data-testid`가 2개가 되어 E2E strict mode가 깨진다
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { AssetSectionTransfer } from "@/components/calc/transfer/asset-sections/AssetSectionTransfer";
import { GeneralBuildingBlock } from "@/components/calc/transfer/GeneralBuildingBlock";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

function gbAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    ...over,
  } as AssetForm;
}

function renderTransferTab(over: Partial<AssetForm> = {}) {
  render(
    <AssetSectionTransfer
      asset={gbAsset(over)}
      onChange={() => {}}
      bundledSaleMode="apportioned"
      transferDate="2026-02-16"
    />,
  );
}

describe("P-1·P-2 — ② 양도 탭이 이 섹션을 갖는다", () => {
  it("일반건물이면 안분 방식 라디오가 렌더된다", () => {
    renderTransferTab();
    expect(screen.getByTestId("gb-sale-split-mode")).toBeTruthy();
    expect(screen.getByText("양도가액 토지·건물 안분 방식")).toBeTruthy();
  });

  it("세 선택지가 법정 우선순위 순으로 한 행에 있다", () => {
    renderTransferTab();
    const radios = screen.getByTestId("gb-sale-split-mode").querySelectorAll('input[type="radio"]');
    expect(Array.from(radios).map((r) => (r as HTMLInputElement).value)).toEqual([
      "actual", // 구분 기장이 원칙 (§100②)
      "appraisal", // 안분한다면 감정평가액 우선 (부가령 §64①1호)
      "apportioned", // 그다음이 기준시가 (같은 항 2호)
    ]);
  });

  it("일반건물이 아니면 렌더되지 않는다", () => {
    render(
      <AssetSectionTransfer
        asset={{ ...makeDefaultAsset(1), assetKind: "housing" } as AssetForm}
        onChange={() => {}}
        bundledSaleMode="apportioned"
        transferDate="2026-02-16"
      />,
    );
    expect(screen.queryByTestId("gb-sale-split-mode")).toBeNull();
  });
});

describe("P-3 — ③ 취득 탭에는 더 이상 없다", () => {
  it("GeneralBuildingBlock이 안분 방식 섹션을 렌더하지 않는다 (중복 testid 방지)", () => {
    render(<GeneralBuildingBlock asset={gbAsset()} onChange={() => {}} transferDate="2026-02-16" />);
    expect(screen.queryByTestId("gb-sale-split-mode")).toBeNull();
    expect(screen.queryByText("양도가액 토지·건물 안분 방식")).toBeNull();
  });
});
