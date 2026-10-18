/** @vitest-environment jsdom */
/**
 * ⑤ Step1 — 다자산 구성에 대한 사용자의 선택(`assetSplitMode`)을 폼에 기록하고, 복원할 때 그 값을 따른다 (2026-10-18)
 * 계획서: docs/02-design/features/transfer-companion-all-fractional-distinct-assets.plan.md
 *
 * 종전에는 선택이 `Step1`의 `useState`에만 있어, 전 자산이 지분인 함께 양도 묶음을 ④⑧·서버가 지분율로 추론해 축 B로 읽었다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { Step1 } from "@/app/calc/transfer-tax/steps/Step1";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));

afterEach(cleanup);

const COMPANION = "같은 날 다른 부동산도 함께 파셨나요?";

/** 제목 문구에서 위로 올라가 그 카드의 스위치를 찾는다. */
function switchOf(title: string): HTMLElement {
  let el: HTMLElement | null = screen.getByText(title);
  while (el && !el.querySelector('[role="switch"]')) el = el.parentElement;
  return el!.querySelector('[role="switch"]') as HTMLElement;
}

const half = (n: number): AssetForm =>
  ({ ...makeDefaultAsset(n), ownershipNumerator: "50", ownershipDenominator: "100" }) as AssetForm;

function form(over: Partial<TransferFormData>): TransferFormData {
  return { ...createDefaultTransferFormData(), transferDate: "2026-02-16", ...over } as TransferFormData;
}

describe("토글이 선택을 기록한다", () => {
  it("함께 양도 ON(단건 → 2건) — 같은 패치에 assetSplitMode: companion", () => {
    const onChange = vi.fn();
    render(<Step1 form={form({ assets: [makeDefaultAsset(1)] })} onChange={onChange} />);
    fireEvent.click(switchOf(COMPANION));
    const patch = onChange.mock.calls.at(-1)![0] as Partial<TransferFormData>;
    expect(patch.assetSplitMode).toBe("companion");
    expect(patch.assets).toHaveLength(2);
  });

  it("함께 양도 OFF(단건) — 선택을 지운다", () => {
    const onChange = vi.fn();
    render(<Step1 form={form({ assets: [makeDefaultAsset(1)], assetSplitMode: "companion" })} onChange={onChange} />);
    // 단건이라 초기 모드는 none — 켰다가 끈다
    fireEvent.click(switchOf(COMPANION));
    fireEvent.click(switchOf(COMPANION));
    const patch = onChange.mock.calls.at(-1)![0] as Partial<TransferFormData>;
    expect("assetSplitMode" in patch && patch.assetSplitMode === undefined).toBe(true);
  });
});

describe("복원 — 저장된 선택이 지분율 추론보다 앞선다", () => {
  it("전 자산 지분 + 선택 companion → 함께 양도 토글이 켜져 있고 막혀 있지 않다", () => {
    render(<Step1 form={form({ assets: [half(1), half(2)], assetSplitMode: "companion" })} onChange={() => {}} />);
    const sw = switchOf(COMPANION);
    expect(sw.getAttribute("aria-checked")).toBe("true");
    expect(screen.queryByText(/‘지분별 취득’ 모드와 동시에 사용할 수 없습니다/)).toBeNull();
  });

  it("대조군 — 선택이 없으면(종전 세션) 지분율로 추론해 지분별 취득(함께 양도 토글은 막힘)", () => {
    render(<Step1 form={form({ assets: [half(1), half(2)] })} onChange={() => {}} />);
    expect(switchOf(COMPANION).getAttribute("aria-checked")).toBe("false");
    expect(screen.queryByText(/‘지분별 취득’ 모드와 동시에 사용할 수 없습니다/)).not.toBeNull();
  });
});

describe("종전 세션(선택 미저장) — 자산을 고치는 핸들러가 화면의 모드를 기록한다", () => {
  it("함께 양도로 복원된 묶음(자산2 단독)에서 지분율을 고치면 같은 패치에 assetSplitMode: companion", () => {
    const onChange = vi.fn();
    const whole = { ...makeDefaultAsset(2) } as AssetForm;
    render(<Step1 form={form({ assets: [half(1), whole] })} onChange={onChange} />);
    expect(switchOf(COMPANION).getAttribute("aria-checked")).toBe("true");
    const inputs = screen.getAllByPlaceholderText("지분율");
    fireEvent.change(inputs[inputs.length - 1], { target: { value: "50" } });
    const patch = onChange.mock.calls.at(-1)![0] as Partial<TransferFormData>;
    expect(patch.assetSplitMode).toBe("companion");
  });
});
