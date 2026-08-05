/**
 * @vitest-environment jsdom
 *
 * anchor A-6·A-10 — 일반건물 「토지·건물 취득일 다름」 UI (P4)
 *
 * 계획서: `docs/02-design/features/general-building-part-major-acquisition.plan.md` §3.1 · §3.6(3)
 *
 * 고정 계약:
 *   A-6-1 토글은 **취득원인 블록 밖(최상단)**에 있다 — 상속·증여에서도 끌 수 있어야 한다
 *   A-6-2 분리 OFF면 건물 취득일 칸이 없다(토지 카드의 「취득일」 하나가 두 파트를 기록)
 *   A-6-3 분리 ON이면 건물 취득일 칸이 나타난다
 *   A-6-4 Q4 — 건물 취득원인 「신축(자가건축)」 선택 시 분리를 **같은 배치로** 자동 ON
 *   A-6-5 토글 OFF 전환은 `landAcquisitionDate`를 건물 취득일로 되맞춘다(불변식 §3.2(1))
 *   A-10  용도변경 미리보기 — 분리 ON·1주택이면 토지·건물 기산일을 **둘 다** 보여준다
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { GeneralBuildingAcquisitionCards } from "@/components/calc/transfer/GeneralBuildingAcquisitionCards";
import { GeneralBuildingConversionSection } from "@/components/calc/transfer/GeneralBuildingConversionSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

const LAND = "1999-05-24";
const BUILDING = "2015-03-01";

function gbAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    acquisitionCause: "purchase",
    gbBuildingAcquisitionCause: "purchase",
    acquisitionDate: LAND,
    landAcquisitionDate: LAND,
    hasSeperateLandAcquisitionDate: false,
    ...over,
  } as AssetForm;
}

function renderCards(over: Partial<AssetForm> = {}) {
  const onChange = vi.fn();
  render(
    <GeneralBuildingAcquisitionCards
      asset={gbAsset(over)}
      onChange={onChange}
      transferDate="2026-02-16"
    />,
  );
  return onChange;
}

/** 「건물 취득」 카드 안으로 스코프를 좁힌다 — 토지 카드에도 「취득원인」이 있다. */
function buildingCard(): HTMLElement {
  const title = screen.getByText("건물 취득");
  return title.closest("div.rounded-lg") as HTMLElement;
}

describe("A-6 — 분리 토글과 취득일 칸", () => {
  it("토글은 취득원인이 상속이어도 렌더된다 (취득원인 블록 밖)", () => {
    renderCards({ acquisitionCause: "inheritance" });
    expect(screen.getByText("토지·건물 취득일 다름")).toBeTruthy();
  });

  it("분리 OFF — 건물 취득일 칸이 없다", () => {
    renderCards();
    expect(screen.queryByText("건물 취득일")).toBeNull();
  });

  it("분리 ON — 건물 취득일 칸이 나타난다", () => {
    renderCards({ hasSeperateLandAcquisitionDate: true, acquisitionDate: BUILDING });
    expect(screen.getByText("건물 취득일")).toBeTruthy();
  });

  it("Q4 — 「신축(자가건축)」 선택 시 분리를 같은 배치로 자동 ON", () => {
    const onChange = renderCards();
    fireEvent.click(within(buildingCard()).getByText("신축(자가건축)"));
    expect(onChange).toHaveBeenCalledWith({
      gbBuildingAcquisitionCause: "newConstruction",
      hasSeperateLandAcquisitionDate: true,
    });
  });

  it("신축이 아닌 원인은 분리 상태를 건드리지 않는다", () => {
    const onChange = renderCards();
    fireEvent.click(within(buildingCard()).getByText("상속"));
    expect(onChange).toHaveBeenCalledWith({ gbBuildingAcquisitionCause: "inheritance" });
  });

  it("토글 OFF 전환은 토지 취득일을 건물 취득일로 되맞춘다 (불변식)", () => {
    const onChange = renderCards({
      hasSeperateLandAcquisitionDate: true,
      landAcquisitionDate: LAND,
      acquisitionDate: BUILDING,
    });
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith({
      hasSeperateLandAcquisitionDate: false,
      landAcquisitionDate: BUILDING,
    });
  });
});

describe("A-6-7 — 파트별 취득가액 산정 방식 라디오", () => {
  it("분리 OFF면 파트 라디오가 없다 (자산 단위 라디오가 담당)", () => {
    renderCards();
    expect(screen.queryByText("토지 취득가액 산정 방식")).toBeNull();
    expect(screen.queryByText("건물 취득가액 산정 방식")).toBeNull();
  });

  it("분리 ON — 토지·건물 각각 산정 방식 라디오가 나타난다", () => {
    renderCards({ hasSeperateLandAcquisitionDate: true, acquisitionDate: BUILDING });
    expect(screen.getByText("토지 취득가액 산정 방식")).toBeTruthy();
    expect(screen.getByText("건물 취득가액 산정 방식")).toBeTruthy();
  });

  it("파트 미선택 시 자산 전체 레거시 플래그에서 파생한다 (dual-truth 회피)", () => {
    // 자산 단위가 환산 → 두 파트 라디오가 「환산취득가」로 표시돼야 한다
    renderCards({
      hasSeperateLandAcquisitionDate: true,
      acquisitionDate: BUILDING,
      useEstimatedAcquisition: true,
    });
    const checked = screen.getAllByRole("radio", { checked: true });
    const labels = checked.map((r) => r.closest("label")?.textContent ?? "");
    expect(labels.filter((t) => t.includes("환산취득가")).length).toBeGreaterThanOrEqual(2);
  });

  it("실거래가 파트만 금액 칸을 연다 — 환산 파트는 기준시가로 산정", () => {
    renderCards({
      hasSeperateLandAcquisitionDate: true,
      acquisitionDate: BUILDING,
      landAcqMode: "actual",
      buildingAcqMode: "estimated",
    });
    // exact — 「토지 취득가액 산정 방식」에 substring 매칭되는 것을 막는다.
    // All 변형 — FieldCard 라벨 + CurrencyInput 내부 라벨로 같은 문구가 2회 렌더된다(기존 패턴).
    expect(screen.getAllByText("토지 취득가액", { exact: true }).length).toBeGreaterThan(0);
    expect(screen.queryAllByText("건물 취득가액", { exact: true })).toHaveLength(0);
  });

  it("파트 라디오는 해당 파트 모드만 기록한다", () => {
    const onChange = renderCards({
      hasSeperateLandAcquisitionDate: true,
      acquisitionDate: BUILDING,
    });
    const landField = screen.getByText("토지 취득가액 산정 방식").closest("div") as HTMLElement;
    fireEvent.click(within(landField).getByText("환산취득가"));
    expect(onChange).toHaveBeenCalledWith({ landAcqMode: "estimated" });
  });
});

describe("A-10 — 용도변경 보유기간 기산일 미리보기", () => {
  function renderConversion(over: Partial<AssetForm> = {}) {
    render(
      <GeneralBuildingConversionSection
        asset={gbAsset({
          gbHouseToCommercialConversion: true,
          gbConversionDate: "2022-06-01",
          gbWasMultiHouseAtConversion: false,
          ...over,
        })}
        onChange={() => {}}
        transferDate="2026-02-16"
      />,
    );
  }

  it("분리 ON·1주택 — 토지·건물 기산일을 둘 다 표시한다 (§95④ 자산별)", () => {
    renderConversion({
      hasSeperateLandAcquisitionDate: true,
      landAcquisitionDate: LAND,
      acquisitionDate: BUILDING,
    });
    const label = screen.getByText(/보유기간 기산일/);
    expect(label.textContent).toContain(LAND);
    expect(label.textContent).toContain(BUILDING);
  });

  it("분리 OFF — 종전대로 한 줄", () => {
    renderConversion();
    expect(screen.getByText(/보유기간 기산일 = 당초 취득일/)).toBeTruthy();
  });

  it("다주택 — 용도변경일 1줄 + 토지·건물 공통 명시", () => {
    renderConversion({
      gbWasMultiHouseAtConversion: true,
      hasSeperateLandAcquisitionDate: true,
      landAcquisitionDate: LAND,
      acquisitionDate: BUILDING,
    });
    const label = screen.getByText(/보유기간 기산일 = 용도변경일/);
    expect(label.textContent).toContain("토지·건물 공통");
  });
});

/**
 * A-12 — 리뷰 FAIL#3 회귀 가드: 토지 카드 하위 블록의 취득일이 **토지 축**으로 간다.
 *
 * `CompanionAcqInheritanceBlock`은 상속개시일을 `onChange({ acquisitionDate, ... })`로 쓰는데,
 * M-1a 이후 그 필드는 **건물** 취득일이다. 라우팅하지 않으면 토지 카드에서 넣은 상속개시일이
 * 건물 취득일을 덮어쓰고 `landAcquisitionDate`는 갱신되지 않는다.
 */
describe("A-12 — 상속 블록 취득일 라우팅", () => {
  it("분리 OFF — 상속개시일이 토지·건물 두 축에 함께 기록된다", () => {
    const onChange = renderCards({ acquisitionCause: "inheritance" });
    const dateScope = screen.getByText("상속개시일").parentElement as HTMLElement;
    fireEvent.change(within(dateScope).getByLabelText("연도"), { target: { value: "2017" } });

    const patch = onChange.mock.calls.at(-1)?.[0] ?? {};
    expect(patch).toHaveProperty("landAcquisitionDate");
    expect(patch.landAcquisitionDate).toBe(patch.acquisitionDate);
    // 상속 전용 필드는 그대로 보존
    expect(patch).toHaveProperty("inheritanceStartDate");
  });

  it("분리 ON — 상속개시일은 **토지** 취득일에만 기록된다 (건물 취득일 덮어쓰기 금지)", () => {
    const onChange = renderCards({
      acquisitionCause: "inheritance",
      hasSeperateLandAcquisitionDate: true,
      acquisitionDate: BUILDING,
    });
    const dateScope = screen.getByText("상속개시일").parentElement as HTMLElement;
    fireEvent.change(within(dateScope).getByLabelText("연도"), { target: { value: "2017" } });

    const patch = onChange.mock.calls.at(-1)?.[0] ?? {};
    expect(patch).toHaveProperty("landAcquisitionDate");
    expect(patch).not.toHaveProperty("acquisitionDate");
  });
});
