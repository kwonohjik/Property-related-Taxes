/**
 * @vitest-environment jsdom
 *
 * anchor: 증축 시 **원건물 축 분리** — ② 건물 기준시가가 건물1 전용임을 화면이 말한다
 *
 * ## 왜 고정하는가 (2026-08-12 사용자 지적)
 *
 * 엔진은 §166⑥ 분모를 `토지 + 건물1 + 건물2`로 구성한다(`general-building-extension.ts`).
 * 그런데 ② 섹션 라벨이 「취득시/양도시 건물기준시가」라 **전체(원건물+증축)를 넣기 쉬웠고**,
 * 그러면 건물2가 이중 계상되어 안분이 틀린다 — 세액이 바뀌는 오입력이다.
 *
 * 더 나쁜 것은 **계산기**였다: `hideFloorAreaInput`으로 연면적 칸이 숨겨진 채
 * ① 기본정보의 `gbBuildingArea`(= 양도 당시 = 증축 포함)를 그대로 써서, 사용자가
 * 값을 직접 넣지 않고 계산기를 쓰는 순간 건물1이 과대 산정됐다.
 *
 * ⇒ ① = 양도 당시 전체 · ③ 취득정보의 신설 「당초 취득 시 원건물 연면적」 = 건물1 계산용.
 *
 * ## 고정 계약
 *
 *   X1. 증축 ON이면 ②의 취득시·양도시 라벨이 「원건물」로 좁아진다 (증축 OFF는 종전 그대로)
 *   X2. 증축 ON이면 「당초 취득 시 원건물 연면적」 입력칸이 뜬다 (OFF면 없다)
 *   X3. 계산기 연면적 prefill이 원건물 면적이다 — 미입력 시에만 `gbBuildingArea` fallback
 *   X4. 증축분(건물2) 2시점 기준시가 계산기가 존재한다 (종전 구현 누락)
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { GeneralBuildingBlock } from "@/components/calc/transfer/GeneralBuildingBlock";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

function gbAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    acquisitionCause: "purchase",
    acquisitionDate: "2003-03-17",
    gbLandArea: "57",
    gbBuildingArea: "167.44",   // 양도 당시 = 원건물 83.72 + 증축 83.72
    gbBuildingFootprintArea: "57",
    ...over,
  } as AssetForm;
}

const EXT = {
  gbHasExtension: true,
  gbExtensionDate: "2007-07-24",
  gbExtensionArea: "83.72",
  gbExtensionAcquisitionMode: "estimated" as const,
};

function renderBlock(over: Partial<AssetForm> = {}) {
  return render(
    <GeneralBuildingBlock asset={gbAsset(over)} onChange={() => {}} transferDate="2026-02-16" />,
  );
}

// ── X1 · 라벨이 원건물로 좁아진다 ────────────────────────────────────────
describe("X1 — ② 건물 기준시가 라벨은 증축 ON에서 「원건물」로 좁아진다", () => {
  it("증축 ON — 취득시·양도시 모두", () => {
    renderBlock({ ...EXT, useEstimatedAcquisition: true });
    expect(screen.getAllByText("취득시 원건물 기준시가").length).toBeGreaterThan(0);
    expect(screen.getAllByText("양도시 원건물 기준시가").length).toBeGreaterThan(0);
    expect(screen.getByText("건물 기준시가 — 원건물(건물1)")).toBeTruthy();
  });

  it("증축 OFF — 종전 라벨 (대조군)", () => {
    renderBlock({ useEstimatedAcquisition: true });
    expect(screen.getAllByText("취득시 건물기준시가").length).toBeGreaterThan(0);
    expect(screen.queryByText("취득시 원건물 기준시가")).toBeNull();
    expect(screen.queryByText("건물 기준시가 — 원건물(건물1)")).toBeNull();
  });
});

// ── X2 · 원건물 연면적 입력칸 ───────────────────────────────────────────
describe("X2 — 「당초 취득 시 원건물 연면적」은 증축 ON에서만 뜬다", () => {
  it("증축 ON", () => {
    renderBlock({ ...EXT, useEstimatedAcquisition: true });
    expect(screen.getAllByText("당초 취득 시 원건물 연면적").length).toBeGreaterThan(0);
  });

  it("증축 OFF (대조군 — 당초 = 전체라 물을 이유가 없다)", () => {
    renderBlock({ useEstimatedAcquisition: true });
    expect(screen.queryByText("당초 취득 시 원건물 연면적")).toBeNull();
  });
});

// ── X3 · 계산기 연면적 prefill → `gb-building-std-floor-area.anchor.test.ts` ──
/**
 * 🔑 세액에 닿는 유일한 경로이지만 **여기서는 관측할 수 없다** — 모달이 `hideFloorAreaInput`이라
 * prefill 값이 DOM 텍스트에 나타나지 않는다(2026-08-12 probe 실측: 열린 모달에 "83.72"도
 * "167.44"도 없다). 렌더 단언으로 쓰면 두 케이스가 같은 결과라 **구별력이 0**이다.
 * ⇒ 파생을 순수 함수(`gbBuildingStdPriceFloorArea`)로 뽑아 값으로 고정했다.
 */

// ── X4 · 증축분 계산기 존재 ─────────────────────────────────────────────
describe("X4 — 증축분(건물2) 기준시가 계산기가 있다", () => {
  it("환산 모드 — 2시점(증축시·양도시) 일괄 런처", () => {
    renderBlock({ ...EXT, useEstimatedAcquisition: true });
    expect(screen.getByTestId("gb-ext-building-std-batch-open")).toBeTruthy();
  });

  it("증축 OFF면 없다 (대조군)", () => {
    renderBlock({ useEstimatedAcquisition: true });
    expect(screen.queryByTestId("gb-ext-building-std-batch-open")).toBeNull();
  });
});
