/**
 * ⑤ UI anchor — standalone 감면의 자산 종류 게이트(§69)와 매수 경로 라디오(§77의3).
 *
 * ⑧ validate 쪽은 `__tests__/api/transfer.route.standalone-reduction-gate-route.anchor.test.ts`가
 * 덮는다. 여기는 **화면에 실제로 그려지는가**만 본다 — 판정이 맞아도 위젯이 없으면 사용자는
 * 그 사실을 입력할 수 없고, 게이트가 잠기면 stale 선택을 **해제할 수단이 없어진다**.
 */
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { UnifiedReductionPanel } from "@/components/calc/transfer/UnifiedReductionPanel";
import { getStandaloneDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import type { AssetForm, AssetReductionForm } from "@/lib/stores/calc-wizard-store";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function panel(assetKind: AssetForm["assetKind"], reductions: AssetReductionForm[] = []) {
  const asset = {
    ...makeDefaultAsset(1),
    assetKind,
    acquisitionDate: "2000-01-01",
    reductions,
  } as AssetForm;
  render(<UnifiedReductionPanel asset={asset} transferDate="2026-03-01" onChange={vi.fn()} />);
}

/** ToggleCard는 BaseUI Switch를 쓴다 — `aria-label`이 title이라 role=switch로 잡힌다. */
function selfFarmingToggle(): HTMLElement {
  return screen.getByRole("switch", { name: /자경농지 감면/ });
}
const isDisabled = (el: HTMLElement) =>
  el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true" ||
  el.getAttribute("data-disabled") !== null;
const isChecked = (el: HTMLElement) =>
  el.getAttribute("aria-checked") === "true" || el.getAttribute("data-checked") !== null;

describe("§69 자산 종류 게이트 — ⑤ UI", () => {
  it("UG-01: 토지에서는 자경농지 감면을 고를 수 있다", () => {
    panel("land");
    expect(isDisabled(selfFarmingToggle())).toBe(false);
  });

  it("UG-02: 🔴 주택에서는 **신규 선택이 잠긴다** (§69① 「직접 경작한 토지」)", () => {
    panel("housing");
    expect(isDisabled(selfFarmingToggle())).toBe(true);
    expect(screen.getByText(/토지 양도에만 적용되는 감면/)).toBeTruthy();
  });

  it("UG-03: 🔑 **이미 선택된 것은 잠그지 않는다** — 잠그면 해제 수단이 없어 dead-end가 된다", () => {
    // 토지에서 §69를 고른 뒤 자산 종류를 주택으로 바꾼 상태(stale 선택).
    panel("housing", [
      { ...getStandaloneDefault("self_farming"), farmingYears: "10" } as AssetReductionForm,
    ]);
    const toggle: HTMLElement = selfFarmingToggle();
    expect(isChecked(toggle)).toBe(true);
    expect(isDisabled(toggle)).toBe(false); // ⑧이 "해제하세요"라고 안내하므로 해제가 가능해야 한다
    expect(screen.getByText(/토지 양도에만 적용되는 감면/)).toBeTruthy();
  });
});

describe("§77의3 매수 경로 — ⑤ UI (Step5 서브패널)", () => {
  it("UG-04: 🔴 서브패널이 **처음부터 있었다** — 이 배치의 전제였던 「위젯 부재」는 오판이었다", async () => {
    const { Step5 } = await import("@/app/calc/transfer-tax/steps/Step5");
    const asset = {
      ...makeDefaultAsset(1),
      assetKind: "land" as const,
      acquisitionDate: "2000-01-01",
      reductions: [getStandaloneDefault("gb_designated_land")],
    } as AssetForm;
    render(
      <Step5
        form={{ assets: [asset], transferDate: "2026-03-01" } as never}
        onChange={vi.fn()}
      />,
    );

    // 종전부터 있던 6필드
    expect(screen.getByText("개발제한구역 지정일")).toBeTruthy();
    expect(screen.getByText("매수청구·협의매수일")).toBeTruthy();
    // 신설된 경로 축
    expect(screen.getByText("매수 경로")).toBeTruthy();
    expect(screen.getByText(/토지매수 청구/)).toBeTruthy();
    expect(screen.getByText("협의매수 (§20)")).toBeTruthy();
  });
});
