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

/**
 * 🔴 **반전**(2026-08-07 P-2) — 종전 계약은 「실가·비증축·비부담부에서는 취득시 입력이 **없다**」
 * 였다. 그 전제는 **실가 경로가 취득시 기준시가를 계산에 쓰지 않는다**는 것이었는데, 그 자체가
 * 정정 대상이었다.
 *
 * 이제 실가 경로도 일괄 취득가액·자본적지출을 **취득시** 기준시가 비율로 안분한다
 * (「소득세법」 제100조 제2항 본문 「취득 당시」 · `general-building-route-actual.ts`
 * `acqLandRatioNum`). 입력 칸을 숨기면 **칸이 없는데 차단되는 dead-end**가 된다
 * (메모리 `feedback_ui_gate_removes_sole_input_path`).
 *
 * ⇒ 취득시 박스를 **항상 노출**한다. 계획서 §14가 **양도시** 기준시가를 「항상 축 A」로
 *   단일화한 것과 같은 판단이다.
 *
 * ⚠️ **노출은 넓게, 차단은 정확히** — 필수 여부는 validate V-5b가 「취득 축 안분이 실제로
 *    필요한가」로 판정한다(`__tests__/calc/gb-actual-expenses-plumbing.test.ts`).
 */
describe("A2 — 취득시 입력은 실가에서도 노출된다 (P-2 반전)", () => {
  it("🔴 실가·비증축·비부담부에서도 취득시 박스가 있다", () => {
    const { container } = renderBlock({ useEstimatedAcquisition: false });
    const boxes = Array.from(
      container.querySelectorAll<HTMLElement>("[data-gb-stdprice]"),
    );
    expect(boxes.map((b) => b.dataset.gbStdprice)).toContain("acq");
    expect(screen.getByText("취득시 토지 공시지가")).toBeTruthy();
    expect(screen.getAllByText("취득시 건물기준시가").length).toBeGreaterThan(0);
  });

  it("증축 모드에서도 그대로 살아 있다 (종전 계약 유지)", () => {
    renderBlock({ useEstimatedAcquisition: false, gbHasExtension: true });
    expect(screen.getByText("취득시 토지 공시지가")).toBeTruthy();
    expect(screen.getAllByText("취득시 건물기준시가").length).toBeGreaterThan(0);
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
   * 🔴 **반전**(2026-08-07 P-2). 종전 근거는 「실거래가 모드는 취득시 입력이 없어 **2시점이
   * 성립하지 않는다**」였다. P-2로 취득시 입력이 생기면서 그 전제가 사라졌다 —
   * 이제 실거래가 모드에서도 2시점 일괄 계산이 성립한다.
   */
  it("실거래가 모드에서도 2시점이 성립해 일괄 런처가 뜬다 (P-2 반전)", () => {
    renderBlock({ useEstimatedAcquisition: false });
    expect(screen.getByTestId("gb-building-std-batch-open")).toBeTruthy();
    // 일괄이 뜨면 시점별 계산기는 중복이라 숨는다(A4 첫 계약과 같은 규칙).
    expect(screen.queryAllByText("건물 기준시가 계산")).toHaveLength(0);
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
