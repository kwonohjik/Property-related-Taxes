/**
 * 일반건물 의제취득일(1985.1.1.) 전 상속·증여 3자 max — 화면 (PR-4).
 *
 * ⑦ 결과 블록(`GbPreDeemedAcquisitionBlock`) · ⑤ 입력 안내(토지 등급 카드 · 건물 취득시 기준시가 hint).
 * 계획서: docs/02-design/features/inheritance-pre-deemed-clause-b-revisit.plan.md §15
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { GbPreDeemedAcquisitionBlock } from "@/components/calc/results/transfer/GbPreDeemedAcquisitionBlock";
import { GeneralBuildingAcquisitionCards } from "@/components/calc/transfer/GeneralBuildingAcquisitionCards";
import { GeneralBuildingBlock } from "@/components/calc/transfer/GeneralBuildingBlock";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";
import { GB_PRE_DEEMED_BUILDING_HINT, GB_PRE_DEEMED_LAND_NOTE } from "@/lib/calc/gb-pre-deemed";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

describe("⑦ 결과 블록 — 파트별 세 후보 · 채택 표시", () => {
  it("채택 후보만 「(미적용)」이 없다 · 없는 파트는 그리지 않는다", () => {
    render(
      <GbPreDeemedAcquisitionBlock
        echo={{ land: { reported: 50_000_000, sec164: 205_000_000, converted: 239_016_745, adopted: "converted" } }}
      />,
    );
    const land = within(screen.getByTestId("gb-pre-deemed-land"));
    expect(land.getByText("239,016,745")).toBeTruthy();
    expect(land.getAllByText("(미적용)")).toHaveLength(2);
    expect(screen.queryByTestId("gb-pre-deemed-building")).toBeNull();
  });

  it("①이 채택되면 ③이 「(미적용)」", () => {
    render(
      <GbPreDeemedAcquisitionBlock
        echo={{ building: { reported: 300_000_000, sec164: 150_000_000, converted: 174_890_301, adopted: "reported" } }}
      />,
    );
    const b = within(screen.getByTestId("gb-pre-deemed-building"));
    expect(b.getByText("③ 환산취득가액").textContent).toContain("(미적용)");
    expect(b.getByText("① 상증법 평가액").textContent).not.toContain("(미적용)");
  });

  it("두 파트 모두 없으면 아무것도 그리지 않는다", () => {
    const { container } = render(<GbPreDeemedAcquisitionBlock echo={{}} />);
    expect(container.innerHTML).toBe("");
  });
});

function gb(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    acquisitionCause: "inheritance",
    gbBuildingAcquisitionCause: "inheritance",
    hasSeperateLandAcquisitionDate: false,
    landAcquisitionDate: "1980-05-01",
    acquisitionDate: "1980-05-01",
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    ...over,
  } as AssetForm;
}

describe("⑤ 입력 안내 — 1985 전 상속·증여만", () => {
  it("토지 등급 카드: 1980 상속이면 의제취득일·③ 비교 안내", () => {
    render(<GeneralBuildingAcquisitionCards asset={gb()} onChange={() => {}} transferDate="2026-02-16" />);
    expect(screen.getByTestId("gb-pre-deemed-land-note").textContent).toBe(GB_PRE_DEEMED_LAND_NOTE);
  });

  it("토지 등급 카드: 1988 상속(1990.8.30. 전이지만 의제취득일 후)이면 안내 없음", () => {
    render(
      <GeneralBuildingAcquisitionCards
        asset={gb({ landAcquisitionDate: "1988-05-01", acquisitionDate: "1988-05-01" })}
        onChange={() => {}}
        transferDate="2026-02-16"
      />,
    );
    expect(screen.queryByTestId("gb-pre-deemed-land-note")).toBeNull();
  });

  it("건물 취득시 기준시가 hint: 1980 상속 = 의제취득일 안내 · 1995 상속 = 종전 문구", () => {
    render(<GeneralBuildingBlock asset={gb()} onChange={() => {}} transferDate="2026-02-16" />);
    expect(screen.getAllByText(GB_PRE_DEEMED_BUILDING_HINT).length).toBeGreaterThan(0);
    cleanup();
    render(
      <GeneralBuildingBlock
        asset={gb({ landAcquisitionDate: "1995-05-01", acquisitionDate: "1995-05-01" })}
        onChange={() => {}}
        transferDate="2026-02-16"
      />,
    );
    expect(screen.queryByText(GB_PRE_DEEMED_BUILDING_HINT)).toBeNull();
  });
});
