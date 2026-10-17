/**
 * anchor — 엔진이 **자동으로 비사업용 토지로 가르는 파트**를 가진 자산에도 지정지역 질문이 입력 화면에 달린다.
 *
 * 기존 배치 anchor(`nbl-designated-area-placement`)는 «비사업용 토지 토글을 켠 토지»만 본다. 그 밖의 파트는 토글이 꺼져 있어
 * 질문이 뜰 자리가 없었다 — 여기서는 각 파트가 있을 때만 뜨는지(없는데 뜨면 소음, 있는데 안 뜨면 유예가 영영 켜지지 않는다)를 고정한다.
 *  - 주택 부수토지 컴패니언(`AssetSectionExtras`) · 일반건물(`GeneralBuildingNblSection`) · 주택 배율초과(`AssetAreaSection`)
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { AssetSectionExtras } from "@/components/calc/transfer/asset-sections/AssetSectionExtras";
import { GeneralBuildingNblSection } from "@/components/calc/transfer/GeneralBuildingNblSection";
import { AssetAreaSection } from "@/components/calc/transfer/asset-sections/AssetAreaSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);
const mk = (over: Partial<AssetForm>): AssetForm => ({ ...makeDefaultAsset(1), ...over }) as AssetForm;
const IN = "2012-06-01";
const OUT = "2016-01-01";

describe("주택 부수토지 컴패니언 — AssetSectionExtras", () => {
  const appurtenant = (over: Partial<AssetForm> = {}) => mk({ assetKind: "land", landNature: "appurtenant", isNonBusinessLand: false, ...over });
  const render1 = (a: AssetForm, d: string, onChange = vi.fn()) => render(<AssetSectionExtras asset={a} assetIndex={1} onChange={onChange} transferDate={d} />);
  const q = () => screen.queryByTestId("nbl-designated-area-question-companion-appurtenant-1");
  const toggled = () => screen.queryByTestId("nbl-designated-area-question-companion-1");

  it("부수토지 + 토글 꺼짐 + 2012-06-01 → 질문이 뜬다 (한도 초과분이 자동 비사업용 카드가 되므로)", () => {
    render1(appurtenant(), IN);
    expect(q()).not.toBeNull();
    expect(toggled()).toBeNull();
  });
  it("기간 밖이거나 독립 토지(standalone)면 뜨지 않는다", () => {
    const { unmount } = render1(appurtenant(), OUT);
    expect(q()).toBeNull();
    unmount();
    render1(appurtenant({ landNature: "standalone" }), IN);
    expect(q()).toBeNull();
  });
  it("토글이 켜진 토지는 기존 질문 한 번만 뜬다 (중복 렌더 없음)", () => {
    render1(appurtenant({ isNonBusinessLand: true }), IN);
    expect(toggled()).not.toBeNull();
    expect(q()).toBeNull();
  });
  it("질문 문구가 무엇이 비사업용인지(한도 초과분 토지) 밝힌다 — 토글을 켜지 않은 사용자가 «이 토지»로 오독하지 않도록", () => {
    render1(appurtenant(), IN);
    expect(q()!.textContent).toContain("한도 초과분 토지(주택 부수토지 배율 초과)");
  });
  it("클릭 → 그 자산에 isDesignatedArea 패치", () => {
    const onChange = vi.fn();
    render1(appurtenant(), IN, onChange);
    fireEvent.click(screen.getByTestId("nbl-designated-area-out-companion-appurtenant-1"));
    expect(onChange).toHaveBeenLastCalledWith({ isDesignatedArea: false });
  });
});

describe("일반건물 — GeneralBuildingNblSection", () => {
  const gb = (over: Partial<AssetForm> = {}) =>
    mk({ assetKind: "general_building", gbZoneType: "commercial", gbBuildingFootprintArea: "100", gbLandArea: "900", ...over });
  const render1 = (a: AssetForm, d: string, onChange = vi.fn()) => render(<GeneralBuildingNblSection asset={a} onChange={onChange} transferDate={d} />);
  const anyQ = () => document.querySelector('[data-testid^="nbl-designated-area-question-gb-"]');

  it("토지 900㎡ > 한도 300㎡(상업 3배 × 100㎡) + 2012-06-01 → 질문이 뜬다", () => {
    render1(gb(), IN);
    expect(anyQ()).not.toBeNull();
  });
  it("한도 이내(토지 200㎡)면 비사업용 카드가 없어 뜨지 않는다", () => {
    render1(gb({ gbLandArea: "200" }), IN);
    expect(anyQ()).toBeNull();
  });
  it("허가·사용승인 미이행(토지 전체 비사업용)이면 한도와 무관하게 뜬다 · 토지 면적이 비면 뜨지 않는다", () => {
    const { unmount } = render1(gb({ gbUnapprovedBuilding: true, gbLandArea: "200" }), IN);
    expect(anyQ()).not.toBeNull();
    unmount();
    render1(gb({ gbUnapprovedBuilding: true, gbLandArea: "" }), IN);
    expect(anyQ()).toBeNull();
  });
  it("기간 밖(2016-01-01)이면 뜨지 않는다", () => {
    render1(gb(), OUT);
    expect(anyQ()).toBeNull();
  });
  it("«지정지역» 클릭 → 그 자산에 isDesignatedArea:true 패치", () => {
    const onChange = vi.fn();
    render1(gb(), IN, onChange);
    const el = document.querySelector('[data-testid^="nbl-designated-area-in-gb-"]') as HTMLElement;
    fireEvent.click(el);
    expect(onChange).toHaveBeenLastCalledWith({ isDesignatedArea: true });
  });
});

describe("주택 배율초과 — AssetAreaSection", () => {
  // 수도권 주거 · 정착면적 100㎡ — 2012년 배율 5배(한도 500㎡), 2024년 3배(한도 300㎡)
  const housing = (area: string, over: Partial<AssetForm> = {}) =>
    mk({ assetKind: "housing", buildingFootprintArea: "100", appurtenantLandZone: "metropolitan_residential", isUrbanArea: true, acquisitionArea: area, transferArea: area, areaScenario: "same", ...over });
  const render1 = (a: AssetForm, d: string, onChange = vi.fn()) => render(<AssetAreaSection asset={a} onChange={onChange} transferDate={d} />);
  const q = () => document.querySelector('[data-testid^="nbl-designated-area-question-housing-"]');

  it("토지 900㎡ > 한도 500㎡ + 2012-06-01 → 질문이 뜬다", () => {
    render1(housing("900"), IN);
    expect(q()).not.toBeNull();
  });
  it("배율 이내(400㎡)이거나 기간 밖이면 뜨지 않는다", () => {
    const { unmount } = render1(housing("400"), IN);
    expect(q()).toBeNull();
    unmount();
    render1(housing("900"), OUT);
    expect(q()).toBeNull();
  });
  it("주택이 아니면 뜨지 않는다 (토지 자산은 기존 위젯이 담당)", () => {
    render1(mk({ assetKind: "land", buildingFootprintArea: "100", acquisitionArea: "900", transferArea: "900" }), IN);
    expect(q()).toBeNull();
  });
  it("«지정지역 아님» 클릭 → 그 자산에 isDesignatedArea:false 패치", () => {
    const onChange = vi.fn();
    render1(housing("900"), IN, onChange);
    fireEvent.click(document.querySelector('[data-testid^="nbl-designated-area-out-housing-"]') as HTMLElement);
    expect(onChange).toHaveBeenLastCalledWith({ isDesignatedArea: false });
  });
});

describe("일반건물 — AssetAreaSection이 양도일을 섹션에 넘긴다 (통과 배선)", () => {
  it("일반건물 자산을 AssetAreaSection으로 렌더해도 질문이 뜬다 · 기간 밖이면 뜨지 않는다", () => {
    const a = mk({ assetKind: "general_building", gbZoneType: "commercial", gbBuildingFootprintArea: "100", gbLandArea: "900" });
    const { unmount } = render(<AssetAreaSection asset={a} onChange={vi.fn()} transferDate={IN} />);
    expect(document.querySelector('[data-testid^="nbl-designated-area-question-gb-"]')).not.toBeNull();
    unmount();
    render(<AssetAreaSection asset={a} onChange={vi.fn()} transferDate={OUT} />);
    expect(document.querySelector('[data-testid^="nbl-designated-area-question-gb-"]')).toBeNull();
  });
});
