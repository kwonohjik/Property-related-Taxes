/**
 * @vitest-environment jsdom
 *
 * PR-0c ⑤ — 함께 양도(컴패니언) 자산의 이월과세 환산 방식 라디오는 「일반 기준시가 환산」만 연다.
 * ⑧(`validateCarryoverAsset`)이 컴패니언 phd/apd 를 막고 그 칸(`carryover.estimationMode`)이 화면에 있어야 막다른 길이 없다.
 * 주 자산(첫 자산)은 종전대로 세 방식. 계획서 docs/00-pm/gb-card-built-penalty-114-2.plan.md §16.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { CarryoverGiftBlock } from "@/components/calc/transfer/CarryoverGiftBlock";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

function asset(mode: "general" | "phd" | "apd" | null): AssetForm {
  return {
    ...makeDefaultAsset(2),
    assetKind: "housing",
    acquisitionCause: "carryover_gift",
    carryover: { ...CARRYOVER_DEFAULTS, giftRegistryDate: "2021-03-01", donorAcquisitionDate: "2005-06-15", useEstimatedAcquisition: true, estimationMode: mode },
  } as AssetForm;
}
function renderBlock(a: AssetForm, nonPrimary: boolean, onChange = () => {}) {
  return render(<CarryoverGiftBlock asset={a} transferDate="2024-03-01" onChange={onChange} isNonPrimaryAsset={nonPrimary} hasCompanions />);
}
const radios = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLInputElement>('input[type="radio"][name^="carryoverEstimationMode"]'));

describe("PR-0c ⑤ 컴패니언 환산 방식 옵션", () => {
  it("컴패니언: 일반 기준시가 환산 1개만 — 미선택에서도", () => {
    const { container } = renderBlock(asset(null), true);
    expect(radios(container)).toHaveLength(1);
    expect(container.querySelector('[data-field="carryover.estimationMode"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="carryover-companion-mode-notice"]')).toBeNull(); // 미선택·general 에는 안내가 없다
  });

  it("[회귀 0] 주 자산(첫 자산): 세 방식 모두 · phd 선택 시 PHD 패널", () => {
    const { container } = renderBlock(asset("phd"), false);
    expect(radios(container)).toHaveLength(3);
    expect(container.textContent).toContain("최초 고시");
    expect(container.querySelector('[data-testid="carryover-companion-mode-notice"]')).toBeNull();
  });

  it("옛 입력(컴패니언 phd·apd): 라디오 비선택 · PHD 패널 없음 · 안내 문구 · 일반 기준시가 환산을 다시 고를 수 있다", () => {
    for (const mode of ["phd", "apd"] as const) {
      const onChange = vi.fn();
      const { container, unmount } = renderBlock(asset(mode), true, onChange);
      expect(radios(container).filter((r) => r.checked)).toHaveLength(0);
      expect(container.textContent).not.toContain("최초 고시");
      expect(container.querySelector('[data-testid="carryover-companion-mode-notice"]')?.textContent).toContain("일반 기준시가 환산");
      fireEvent.click(radios(container)[0]);
      expect(onChange).toHaveBeenCalled();
      const patch = onChange.mock.calls[0][0] as { carryover?: { estimationMode?: string } };
      expect(patch.carryover?.estimationMode).toBe("general");
      unmount();
    }
  });

  it("[회귀 0] 컴패니언 general: 기준시가 칸이 있다", () => {
    const { container } = renderBlock(asset("general"), true);
    expect(container.querySelector('[data-field="carryover.donorStandardPriceAtAcquisition"]')).not.toBeNull();
  });
});
