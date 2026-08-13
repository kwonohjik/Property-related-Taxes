/**
 * @vitest-environment jsdom
 *
 * anchor: §99-164-10 최초공시 블록의 **배치와 게이트** (2026-08-13 3시점 통합).
 *
 * 계획서: `docs/02-design/features/gb-first-disclosure-3point-integration.plan.md` §4.2·§6.2
 *
 * 고정 계약:
 *   PL-1  토글이 「일반건물 — 취득 시나리오 가이드」 **직후** · ① 토지 공시지가 **직전**에 온다
 *   PL-2  ①② 안에 「최초공시시」 박스가 **취득시와 양도시 사이**에 온다 (시간 순)
 *   FD-8  stale 상태(플래그 true + 실거래가)에서 토글도 ①② 박스도 **렌더되지 않는다**
 *   PL-3  파트만 환산(분리 취득)에서도 토글이 렌더된다 — 플래그 축이면 여기서 죽는다
 *   K-6   지분(%) 분할 2번째 이후 카드에서 **전부 숨는다** (물건-수준 중복 입력 금지)
 *   PL-4  legacy 총액만 있으면 「저장된 총액 사용」 안내와 지우기 버튼이 뜬다
 *
 * ## 왜 배치를 테스트가 고정하는가
 *
 * 토글과 그것이 게이트하는 입력 칸(①②의 최초공시 박스)이 **떨어져 있다**. 순서가 흐트러지면
 * 「켜는 곳」과 「쓰는 곳」이 화면에서 멀어져 사용자가 무엇을 켰는지 잃는다 — 이 기능이
 * ① 기본정보에서 이전된 이유가 정확히 그것이었다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { GeneralBuildingBlock } from "@/components/calc/transfer/GeneralBuildingBlock";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

const TOGGLE_TITLE = "주택으로 최초공시 후 상가로 용도변경 (환산취득가)";

function gbAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    acquisitionCause: "purchase",
    useEstimatedAcquisition: true,
    acquisitionDate: "2010-06-01",
    gbLandArea: "200",
    gbBuildingArea: "300",
    ...over,
  } as AssetForm;
}

function renderBlock(over: Partial<AssetForm> = {}, shareAcquisitionOnly = false) {
  return render(
    <GeneralBuildingBlock
      asset={gbAsset(over)}
      onChange={() => {}}
      transferDate="2025-05-01"
      shareAcquisitionOnly={shareAcquisitionOnly}
    />,
  );
}

/** DOM 문서 순서로 위치를 비교한다. */
function orderOf(...els: (Element | null)[]): number[] {
  const all = Array.from(document.querySelectorAll("*"));
  return els.map((e) => (e ? all.indexOf(e) : -1));
}

describe("PL-1 — 토글은 취득 시나리오 가이드 직후 · ① 토지 공시지가 직전", () => {
  it("가이드 < 토글 < ① 토지 공시지가 순서다", () => {
    const { container } = renderBlock();
    const guide = screen.getByText("일반건물 — 취득 시나리오 가이드");
    const toggle = screen.getByText(TOGGLE_TITLE);
    const landCard = screen.getByText("토지 공시지가 (토지기준시가)");
    const [g, t, l] = orderOf(guide, toggle, landCard);
    expect(g).toBeGreaterThan(-1);
    expect(t).toBeGreaterThan(g);
    expect(l).toBeGreaterThan(t);
    expect(container).toBeTruthy();
  });
});

describe("PL-2 — ①② 안에서 최초공시시는 취득시와 양도시 사이", () => {
  const on = {
    gbHasFirstDisclosure: true,
    gbFirstDisclosureDate: "2005-04-30",
  };

  it("① 토지: 취득시 → 최초공시시 → 양도시", () => {
    renderBlock(on);
    // ① 카드 안의 시점 박스는 data-gb-stdprice로 구분된다.
    const boxes = Array.from(document.querySelectorAll("[data-gb-stdprice]"));
    // 토지 그룹이 먼저 나온다(자산 축 배치) — 앞 3개가 토지 시점들이다.
    const keys = boxes.map((b) => b.getAttribute("data-gb-stdprice"));
    expect(keys.slice(0, 3)).toEqual(["acq", "first", "transfer"]);
  });

  it("② 건물에도 최초공시시 박스가 있다", () => {
    renderBlock(on);
    // FieldCard 라벨 + CurrencyInput 접근성 라벨로 2개가 나온다(기존 시점들과 같은 구조).
    expect(screen.getAllByText("최초공시시 건물 기준시가").length).toBeGreaterThan(0);
    const boxes = Array.from(document.querySelectorAll('[data-gb-stdprice="first"]'));
    // 토지·건물 두 그룹에 하나씩.
    expect(boxes).toHaveLength(2);
  });

  it("토글이 꺼져 있으면 최초공시 박스가 없다 (종전 2시점)", () => {
    renderBlock({ gbHasFirstDisclosure: false });
    expect(document.querySelectorAll('[data-gb-stdprice="first"]')).toHaveLength(0);
  });
});

describe("FD-8 — stale 플래그가 유령 칸을 남기지 않는다", () => {
  /**
   * 실거래가로 전환하면 `gbHasFirstDisclosure`는 true로 **남는다**(모드 전환이 되돌리지 않는다).
   * 게이트를 `gbHasFirstDisclosure` 단독으로 걸면 토글은 사라지는데 ①②의 칸만 남는다.
   */
  const stale = {
    gbHasFirstDisclosure: true,
    gbFirstDisclosureDate: "2005-04-30",
    useEstimatedAcquisition: false,
    landAcqMode: "actual" as const,
    buildingAcqMode: "actual" as const,
  };

  it("토글이 렌더되지 않는다", () => {
    renderBlock(stale);
    expect(screen.queryByText(TOGGLE_TITLE)).toBeNull();
  });

  it("①② 최초공시 박스도 함께 사라진다", () => {
    renderBlock(stale);
    expect(document.querySelectorAll('[data-gb-stdprice="first"]')).toHaveLength(0);
    expect(screen.queryAllByText("최초공시시 건물 기준시가")).toHaveLength(0);
  });
});

describe("PL-3 — 파트만 환산에서도 토글이 뜬다 (파트 축 술어)", () => {
  it("자산 전체 플래그가 false여도 렌더된다", () => {
    renderBlock({
      useEstimatedAcquisition: false,
      hasSeperateLandAcquisitionDate: true,
      landAcquisitionDate: "2010-06-01",
      landAcqMode: "estimated",
      buildingAcqMode: "actual",
    });
    // 플래그 축이면 여기서 null이 되어 §99-164-10을 쓸 방법이 없어진다.
    expect(screen.getByText(TOGGLE_TITLE)).toBeTruthy();
  });
});

describe("K-6 — 지분(%) 분할 2번째 이후에서는 전부 숨는다", () => {
  it("토글도 ①② 박스도 없다 (물건-수준 중복 입력 금지)", () => {
    renderBlock({ gbHasFirstDisclosure: true, gbFirstDisclosureDate: "2005-04-30" }, true);
    expect(screen.queryByText(TOGGLE_TITLE)).toBeNull();
    expect(document.querySelectorAll('[data-gb-stdprice="first"]')).toHaveLength(0);
  });
});

describe("PL-4 — legacy 총액 안내", () => {
  it("단가가 없고 총액만 있으면 안내와 지우기 버튼이 뜬다", () => {
    renderBlock({
      gbHasFirstDisclosure: true,
      gbFirstDisclosureDate: "2005-04-30",
      gbFirstDisclosureLandPricePerSqm: "",
      gbFirstDisclosureLandStdPrice: "320000000",
    });
    expect(screen.getByTestId("gb-first-land-legacy-clear")).toBeTruthy();
    const landBox = document.querySelector('[data-gb-stdprice="first"]')!;
    expect(within(landBox as HTMLElement).getByText(/320,000,000원/)).toBeTruthy();
  });

  it("단가를 넣으면 안내가 사라진다 (legacy는 무시된다)", () => {
    renderBlock({
      gbHasFirstDisclosure: true,
      gbFirstDisclosureDate: "2005-04-30",
      gbFirstDisclosureLandPricePerSqm: "2000000",
      gbFirstDisclosureLandStdPrice: "320000000",
    });
    expect(screen.queryByTestId("gb-first-land-legacy-clear")).toBeNull();
  });
});
