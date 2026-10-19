/**
 * @vitest-environment jsdom
 *
 * H-6 ⑤ — 이월과세 환산 방식 라디오: 일반건물은 「일반 기준시가 환산」만 연다.
 * ⑧ `validateGbCarryover`가 막는 칸(`*.estimationMode`·`*.donorStandardPriceAtAcquisition`)이 화면에 있어야
 * 막다른 길이 없다. 계획서 `docs/00-pm/carryover-validate-parity.plan.md`.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { CarryoverGiftBlock } from "@/components/calc/transfer/CarryoverGiftBlock";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

function asset(kind: AssetForm["assetKind"], mode: "general" | "phd" | "apd" | null, over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: kind,
    acquisitionCause: "carryover_gift",
    carryover: {
      ...CARRYOVER_DEFAULTS,
      giftRegistryDate: "2021-03-01",
      donorAcquisitionDate: "2005-06-15",
      useEstimatedAcquisition: true,
      estimationMode: mode,
    },
    ...over,
  } as AssetForm;
}

function renderBlock(a: AssetForm, part: "land" | "building" = "land") {
  return render(<CarryoverGiftBlock asset={a} transferDate="2024-03-01" onChange={() => {}} part={part} />);
}

const radios = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLInputElement>('input[type="radio"][name^="carryoverEstimationMode"]'));

describe("H-6 ⑤ 환산 방식 옵션", () => {
  it("일반건물: 일반 기준시가 환산 1개만 — 미선택에서도", () => {
    const { container } = renderBlock(asset("general_building", null));
    expect(radios(container)).toHaveLength(1);
    expect(container.querySelector('[data-field="carryover.estimationMode"]')).not.toBeNull();
  });

  it("일반건물 건물 파트: 앵커가 buildingCarryover.estimationMode", () => {
    const { container } = renderBlock(asset("general_building", null), "building");
    expect(radios(container)).toHaveLength(1);
    expect(container.querySelector('[data-field="buildingCarryover.estimationMode"]')).not.toBeNull();
  });

  it("일반건물에 세션 잔재(phd·apd): 라디오는 비선택 · PHD 패널은 열리지 않는다 · 기준시가 칸도 없다(⑧이 방식을 다시 고르게 한다)", () => {
    for (const mode of ["phd", "apd"] as const) {
      const { container, unmount } = renderBlock(asset("general_building", mode));
      expect(radios(container).filter((r) => r.checked)).toHaveLength(0);
      expect(container.textContent).not.toContain("최초 고시");
      expect(container.querySelector('[data-field="carryover.donorStandardPriceAtAcquisition"]')).toBeNull();
      unmount();
    }
  });

  it("일반건물 general: 기준시가 칸이 있다 — ⑧이 요구하는 칸", () => {
    const { container } = renderBlock(asset("general_building", "general"));
    expect(radios(container).filter((r) => r.checked)).toHaveLength(1);
    expect(container.querySelector('[data-field="carryover.donorStandardPriceAtAcquisition"]')).not.toBeNull();
  });

  it("[회귀 0] 주택: 세 방식 모두 열려 있고 phd 선택 시 PHD 패널이 열린다", () => {
    const { container } = renderBlock(asset("housing", "phd"));
    expect(radios(container)).toHaveLength(3);
    expect(radios(container).filter((r) => r.checked)).toHaveLength(1);
    expect(container.textContent).toContain("최초 고시");
  });
});
