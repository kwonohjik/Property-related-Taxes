/**
 * F-7 ⑤ — 컴패니언 일반건물의 미등기(§104③) 입력은 **토지·건물 2축**이다.
 *
 * 종전에는 컴패니언이면 종류와 무관하게 단일 「미등기 양도」 토글(`isUnregistered`)을 띄웠는데,
 * route GB 분기는 `generalBuildingValuation.unregisteredLand`·`unregisteredBuilding`만 읽어
 * 켜도 세액이 바뀌지 않았다(실측 184,140,000 = 끈 것과 같다).
 *
 * 긍정 짝: 일반건물이 아닌 컴패니언은 단일 토글을 그대로 받는다(F7C-4).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { AssetSectionBasic } from "@/components/calc/transfer/asset-sections/AssetSectionBasic";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(() => cleanup());

function renderBasic(
  assetKind: AssetForm["assetKind"],
  over: Partial<AssetForm> = {},
  onChange: (patch: Partial<AssetForm>) => void = vi.fn(),
  isFirst = false,
) {
  const asset: AssetForm = {
    ...makeDefaultAsset(2),
    assetKind,
    acquisitionCause: "purchase",
    acquisitionDate: "2010-05-01",
    ...over,
  };
  return render(
    <AssetSectionBasic
      asset={asset}
      onChange={onChange}
      isMultiBundled={false}
      onAddAsset={vi.fn()}
      showFormDates={false}
      transferDate="2026-05-01"
      filingDate=""
      filingOverdue={false}
      filingDeadline=""
      onFormChange={vi.fn()}
      isFirst={isFirst}
    />,
  );
}

describe("F-7 ⑤ 컴패니언 일반건물 미등기 2축", () => {
  it("F7C-1 일반건물 컴패니언은 토지·건물 토글을 띄우고 단일 토글은 띄우지 않는다", () => {
    renderBasic("general_building");
    expect(screen.getByRole("switch", { name: /^토지 미등기 양도/ })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /^건물 미등기 양도/ })).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: /^미등기 양도/ })).toBeNull();
  });

  it("F7C-2 토글이 각 축 필드를 패치한다", () => {
    const onChange = vi.fn();
    renderBasic("general_building", {}, onChange);
    fireEvent.click(screen.getByRole("switch", { name: /^토지 미등기 양도/ }));
    expect(onChange).toHaveBeenLastCalledWith({ gbLandUnregistered: true });
    fireEvent.click(screen.getByRole("switch", { name: /^건물 미등기 양도/ }));
    expect(onChange).toHaveBeenLastCalledWith({ gbBuildingUnregistered: true });
  });

  it("F7C-3 옛 단일 값이 남아 있으면 안내 카드가 옮기기·지우기 경로를 준다", () => {
    const onChange = vi.fn();
    renderBasic("general_building", { isUnregistered: true }, onChange);
    expect(screen.getByText(/계산에 반영되지 않았습니다/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "토지·건물 모두 미등기로 옮기기" }));
    expect(onChange).toHaveBeenLastCalledWith({
      isUnregistered: false,
      gbLandUnregistered: true,
      gbBuildingUnregistered: true,
    });
    fireEvent.click(screen.getByRole("button", { name: "이전 값 지우기" }));
    expect(onChange).toHaveBeenLastCalledWith({ isUnregistered: false });
  });

  it("F7C-3b 옛 값이 없으면 안내 카드는 없다", () => {
    renderBasic("general_building");
    expect(screen.queryByText(/계산에 반영되지 않았습니다/)).toBeNull();
  });

  it("F7C-4 (긍정 짝) 일반건물이 아닌 컴패니언은 단일 토글을 그대로 받는다", () => {
    const onChange = vi.fn();
    renderBasic("land", {}, onChange);
    fireEvent.click(screen.getByRole("switch", { name: /^미등기 양도/ }));
    expect(onChange).toHaveBeenLastCalledWith({ isUnregistered: true });
    expect(screen.queryByRole("switch", { name: /^토지 미등기 양도/ })).toBeNull();
  });

  it("F7C-5 주 자산 일반건물은 여기서 어느 토글도 띄우지 않는다(Step4 ⑤가 정본)", () => {
    renderBasic("general_building", {}, vi.fn(), true);
    expect(screen.queryByRole("switch", { name: /^토지 미등기 양도/ })).toBeNull();
    expect(screen.queryByRole("switch", { name: /^미등기 양도/ })).toBeNull();
  });
});
