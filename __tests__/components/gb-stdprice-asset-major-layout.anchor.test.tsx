/**
 * @vitest-environment jsdom
 *
 * anchor: 일반건물 기준시가 입력 — **자산 축**(토지 → 건물, 각 그룹 안 취득 → 양도) 배치.
 *
 * 종전은 시점 축(①양도시[토지+건물] ②취득시[토지+건물])이었다. 3시점 화면
 * (`ThreePointAssetMajorRender` — 토지 공시지가 그룹 → 자산별 건물 그룹)과 축을 맞춘다.
 *
 * 고정 계약:
 *   A1. 4개 입력 박스 순서 = 토지취득 → 토지양도 → 건물취득 → 건물양도
 *   A2. 취득시 게이트 승계 — 실가(비증축·비부담부)에서는 취득 박스·일괄 런처·개산공제 안내가 없다
 *   A3. 시점 tone 계약 승계 — 취득=amber · 양도=emerald (바깥 그룹만 slate)
 *   A4. 「건물 기준시가 계산」 런처 2개는 `[data-gb-stdprice]` 스코프로 시점이 구분된다
 *
 * 계획 근거: components/calc/transfer/GeneralBuildingBlock.tsx 헤더 "배치 축을 시점 → 자산으로"
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { GeneralBuildingBlock } from "@/components/calc/transfer/GeneralBuildingBlock";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

function gbAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    acquisitionCause: "purchase",
    useEstimatedAcquisition: true, // 취득시 기준시가 노출 조건
    acquisitionDate: "2010-06-01",
    gbLandArea: "200",
    gbBuildingArea: "300",
    ...over,
  } as AssetForm;
}

function renderBlock(over: Partial<AssetForm> = {}) {
  return render(
    <GeneralBuildingBlock asset={gbAsset(over)} onChange={() => {}} transferDate="2025-05-01" />,
  );
}

describe("A1 — 토지(취득·양도) → 건물(취득·양도) 순서", () => {
  it("입력 박스 4개가 자산 축 순서로 배치된다", () => {
    const { container } = renderBlock();
    const boxes = Array.from(
      container.querySelectorAll<HTMLElement>("[data-gb-stdprice]"),
    );
    expect(boxes.map((b) => b.dataset.gbStdprice)).toEqual([
      "acq",
      "transfer",
      "acq",
      "transfer",
    ]);
    // 각 박스가 담는 필드로 "토지 그룹이 먼저"임을 고정한다.
    // (건물 라벨은 FieldCard <label> + CurrencyInput 내부 라벨로 2회 등장 — All 변형 사용)
    expect(within(boxes[0]).getByText("취득시 토지 공시지가")).toBeTruthy();
    expect(within(boxes[1]).getByText("양도시 토지 공시지가")).toBeTruthy();
    expect(within(boxes[2]).getAllByText("취득시 건물기준시가").length).toBeGreaterThan(0);
    expect(within(boxes[3]).getAllByText("양도시 건물기준시가").length).toBeGreaterThan(0);
  });

  it("그룹 제목이 ① 토지 · ② 건물이다", () => {
    renderBlock();
    expect(screen.getByText("토지 공시지가 (토지기준시가)")).toBeTruthy();
    expect(screen.getByText("건물 기준시가")).toBeTruthy();
  });
});

describe("A2 — 취득시 게이트 승계 (실가·비증축·비부담부)", () => {
  it("취득 축 안분이 없으면 취득 박스·일괄 런처가 모두 없다", () => {
    const { container } = renderBlock({ useEstimatedAcquisition: false });
    const boxes = Array.from(
      container.querySelectorAll<HTMLElement>("[data-gb-stdprice]"),
    );
    expect(boxes.map((b) => b.dataset.gbStdprice)).toEqual(["transfer", "transfer"]);
    expect(screen.queryByText("취득시 토지 공시지가")).toBeNull();
    expect(screen.queryByText("취득시 건물기준시가")).toBeNull();
    expect(screen.queryByTestId("gb-building-std-batch-open")).toBeNull();
    /* 개산공제 안내 박스는 2026-08-12에 삭제됐다(사용자 요청) — 단언을 남기면 게이트와
       무관하게 항상 참이라 구별력이 없다. */
  });

  /**
   * 이 계약이 보는 것은 **취득시 입력칸의 존재**이지 라벨 문자열이 아니다.
   * 2026-08-12에 증축 ON이면 라벨이 「취득시 **원건물** 기준시가」로 좁아졌다 —
   * ②가 받는 것이 건물1분뿐임을 화면에 드러내기 위해서다(§166⑥ 3-way 분모에서
   * 건물2가 이중 계상되는 오입력 차단). 계약의 취지는 그대로다.
   */
  it("증축 모드에서는 실가라도 취득시 입력이 살아난다", () => {
    renderBlock({ useEstimatedAcquisition: false, gbHasExtension: true });
    expect(screen.getByText("취득시 토지 공시지가")).toBeTruthy();
    expect(screen.getAllByText("취득시 원건물 기준시가").length).toBeGreaterThan(0);
  });

  it("증축이 없으면 라벨은 종전 그대로다 (대조군 — 라벨 분기가 증축 축에만 걸린다)", () => {
    renderBlock({ useEstimatedAcquisition: true });
    expect(screen.getAllByText("취득시 건물기준시가").length).toBeGreaterThan(0);
    expect(screen.queryByText("취득시 원건물 기준시가")).toBeNull();
  });
});

/**
 * 🆕 **A2b — 실가 경로에서도 「취득 축 안분이 필요하면」 열린다** (2026-08-07 P-2)
 *
 * 실가 경로가 일괄 취득가액·자본적지출을 **취득시** 기준시가 비율로 안분하게 됐다
 * (「소득세법」 제100조 제2항 본문 「취득 당시」 · `general-building-route-actual.ts`
 * `acqLandRatioNum`). 칸을 숨기면 **칸이 없는데 차단되는 dead-end**가 된다
 * (메모리 `feedback_ui_gate_removes_sole_input_path`).
 *
 * ⚠️ **`true`로 항상 열지는 않는다** — 그러면 `showBatchLauncher`가 함께 켜져 **시점별
 *    「건물 기준시가 계산」 런처가 숨고**, 기존 E2E 2건이 깨진다(CI 실측).
 *
 * 🔑 **UI·validate·엔진이 `needsGbActualAcqStdPrice` 한 함수를 공유한다.**
 */
describe("A2b — 실가 + 취득 축 안분 필요 시 노출 (P-2)", () => {
  it("🔴 자산 단위 취득가액이 있으면 취득 박스가 열린다", () => {
    const { container } = renderBlock({
      useEstimatedAcquisition: false,
      fixedAcquisitionPrice: "500,000,000",
    });
    const boxes = Array.from(container.querySelectorAll<HTMLElement>("[data-gb-stdprice]"));
    expect(boxes.map((b) => b.dataset.gbStdprice)).toContain("acq");
    expect(screen.getByText("취득시 토지 공시지가")).toBeTruthy();
  });

  it("🔴 자산 단위 자본적지출만 있어도 열린다", () => {
    renderBlock({ useEstimatedAcquisition: false, capitalExpenditure: "30,000,000" });
    expect(screen.getByText("취득시 토지 공시지가")).toBeTruthy();
  });

  it("거짓 노출 금지 — 파트별 실지취득가액이 둘 다 있으면 안분이 없어 열리지 않는다", () => {
    renderBlock({
      useEstimatedAcquisition: false,
      fixedAcquisitionPrice: "500,000,000",
      landAcquisitionPrice: "300,000,000",
      buildingAcquisitionPrice: "200,000,000",
    });
    expect(screen.queryByText("취득시 토지 공시지가")).toBeNull();
  });
});

describe("A3 — 시점 tone 계약 승계", () => {
  it("취득=amber · 양도=emerald (그룹은 slate)", () => {
    const { container } = renderBlock();
    const boxes = Array.from(
      container.querySelectorAll<HTMLElement>("[data-gb-stdprice]"),
    );
    for (const box of boxes) {
      const card = box.firstElementChild as HTMLElement;
      const expected = box.dataset.gbStdprice === "acq" ? "amber" : "emerald";
      expect(card.className).toContain(`border-${expected}-200`);
      expect(card.className).toContain(`bg-${expected}-50/40`);
    }
    expect(screen.getByText("토지 공시지가 (토지기준시가)").className).toContain("text-slate-700");
  });
});

/**
 * A4 — 계산기 런처는 **일괄 하나로 대체**하되, 일괄이 없는 경로에는 시점별을 남긴다.
 * 무조건 삭제하면 건물기준시가 산정 경로가 사라진다(`feedback_ui_gate_removes_sole_input_path`).
 */
describe("A4 — 런처 대체 규칙", () => {
  it("일괄 런처가 뜨면 시점별 계산기는 숨는다", () => {
    renderBlock();
    expect(screen.getByTestId("gb-building-std-batch-open")).toBeTruthy();
    expect(screen.queryAllByText("건물 기준시가 계산")).toHaveLength(0);
  });

  /**
   * 🔑 **P-2에서도 이 계약은 유지된다.** 취득시 박스를 「항상」 열면 `showBatchLauncher`가
   * 함께 켜져 **시점별 런처가 숨고** 이 계약이 깨진다 — CI에서 실제로 깨졌다
   * (`building-stdprice-apply-timepoint`·`building-stdprice-modal-prefill` 2건).
   * 그래서 노출 조건을 `needsGbActualAcqStdPrice`로 좁혔다.
   */
  it("실거래가 모드 — 2시점이 성립하지 않아 양도시 계산기가 유일 경로로 남는다", () => {
    const { container } = renderBlock({ useEstimatedAcquisition: false });
    expect(screen.queryByTestId("gb-building-std-batch-open")).toBeNull();
    const boxes = Array.from(
      container.querySelectorAll<HTMLElement>("[data-gb-stdprice]"),
    );
    // 토지 양도시 박스에는 런처가 없고, 건물 양도시 박스에만 있다.
    expect(within(boxes[0]).queryByText("건물 기준시가 계산")).toBeNull();
    expect(within(boxes[1]).getByText("건물 기준시가 계산")).toBeTruthy();
  });

  it("§164⑧ 배치 차단(취득연도 == 양도연도) — 사유 + 시점별 계산기 2개 유지", () => {
    const { container } = renderBlock({ acquisitionDate: "2025-02-01" });
    expect(screen.queryByTestId("gb-building-std-batch-open")).toBeNull();
    expect(screen.getByText(/제164조 제8항/)).toBeTruthy();
    const boxes = Array.from(
      container.querySelectorAll<HTMLElement>("[data-gb-stdprice]"),
    );
    // 건물 그룹(2·3)에 취득·양도 각 1개.
    expect(within(boxes[2]).getByText("건물 기준시가 계산")).toBeTruthy();
    expect(within(boxes[3]).getByText("건물 기준시가 계산")).toBeTruthy();
  });
});
