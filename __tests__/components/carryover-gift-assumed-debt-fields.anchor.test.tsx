/**
 * anchor ⑤ — 「당초 증여 때 채무를 인수했다」 토글과 파트별 인수채무 칸 (V-7 · Q-2 a · Q-3 a)
 *
 * 계획서 `docs/00-pm/carryover-gift-tax-numerator-net.plan.md` §4.1.
 * 토글은 증여 사건 블록에만 있고, 켜면 이월과세 파트마다 인수채무 칸이 생긴다(자동 안분 금지). 상당액을 직접 넣는 자산은 안내만 바뀐다(Q-4 a).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { GeneralBuildingAcquisitionCards } from "../../components/calc/transfer/GeneralBuildingAcquisitionCards";
import { CarryoverGiftBlock } from "../../components/calc/transfer/CarryoverGiftBlock";
import { SplitCarryoverGiftTaxCard } from "../../components/calc/transfer/SplitCarryoverParts";
import { makeDefaultAsset } from "../../lib/stores/calc-wizard-store";
import { CARRYOVER_DEFAULTS } from "../../lib/stores/calc-wizard-asset-carryover";
import type { AssetForm } from "../../lib/stores/calc-wizard-asset";

afterEach(cleanup);

const CO = { ...CARRYOVER_DEFAULTS, giftRegistryDate: "2024-05-01", donorAcquisitionDate: "2015-01-01" };
function gb(over: Record<string, unknown> = {}, debtOn = false): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    transferType: "burdened_gift",
    hasSeperateLandAcquisitionDate: true,
    landAcquisitionDate: "2024-05-01",
    acquisitionCause: "carryover_gift",
    gbBuildingAcquisitionCause: "carryover_gift",
    carryover: { ...CO, giftDebtAssumed: debtOn },
    buildingCarryover: CO,
    ...over,
  } as unknown as AssetForm;
}
const draw = (a: AssetForm) => render(<GeneralBuildingAcquisitionCards asset={a} onChange={vi.fn()} transferDate="2026-03-01" />);
const debtFields = () => [...document.querySelectorAll("[data-field$='.giftAssumedDebt']")].map((e) => e.getAttribute("data-field"));

describe("일반건물 — 토글은 사건 블록(토지 블록)에만", () => {
  it.each([["부담부증여", "burdened_gift"], ["일반 양도", "general"]] as const)("%s · 분리 ON 둘 다 → 토글 1개 · OFF면 채무 칸 없음", (_n, transferType) => {
    draw(gb({ transferType }));
    expect(screen.getAllByTestId("carryover-gift-debt-assumed")).toHaveLength(1);
    expect(debtFields()).toEqual([]);
  });

  it.each([["부담부증여", "burdened_gift"], ["일반 양도", "general"]] as const)("%s · 분리 ON 둘 다 · ON → 토지분·건물분 칸(건물 블록은 사건 값을 따른다)", (_n, transferType) => {
    draw(gb({ transferType }, true));
    expect(debtFields()).toEqual(["carryover.giftAssumedDebt", "buildingCarryover.giftAssumedDebt"]);
    expect(screen.getByText("토지분 당초 증여 때 인수한 채무")).toBeTruthy();
    expect(screen.getByText("건물분 당초 증여 때 인수한 채무")).toBeTruthy();
  });

  it("부담부증여 · 분리 OFF 둘 다 · ON → 같은 블록에 토지분·건물분 칸", () => {
    draw(gb({ hasSeperateLandAcquisitionDate: false }, true));
    expect(debtFields()).toEqual(["carryover.giftAssumedDebt", "buildingCarryover.giftAssumedDebt"]);
  });

  it("건물만 이월과세 → 건물 블록이 사건 블록 · 토글과 칸이 건물 블록에", () => {
    draw(gb({ acquisitionCause: "purchase", buildingCarryover: { ...CO, giftDebtAssumed: true } }));
    expect(screen.getAllByTestId("carryover-gift-debt-assumed")).toHaveLength(1);
    expect(debtFields()).toEqual(["buildingCarryover.giftAssumedDebt"]);
  });
});

describe("주택 분리 계산 — 증여세 카드의 토글 바로 아래에 파트 칸", () => {
  const parts = [
    { name: "토지" as const, value: "", onChange: vi.fn() },
    { name: "건물" as const, value: "", onChange: vi.fn() },
  ];
  it.each([[false, []], [true, ["landCarryover.giftAssumedDebt", "carryover.giftAssumedDebt"]]] as const)("토글 %s", (on, expected) => {
    render(<SplitCarryoverGiftTaxCard sectionNum={4} value={{ ...CO, giftDebtAssumed: on }} onPatch={vi.fn()} anchorPrefix="carryover" partsLabel="토지·건물" giftTaxShareHint="" debtParts={parts} />);
    expect(screen.getByTestId("split-carryover-gift-debt-assumed")).toBeTruthy();
    expect(debtFields()).toEqual([...expected]);
  });
});

describe("그 밖의 자산(상당액 직접 입력) — 토글 없이 안내만(Q-4 a)", () => {
  it("주택 이월과세 → 토글 없음 · 상당액 안내에 「인수한 채무를 뺀」", () => {
    const a = { ...makeDefaultAsset(1), assetKind: "housing", acquisitionCause: "carryover_gift", carryover: { ...CO, giftDebtAssumed: true } } as unknown as AssetForm;
    render(<CarryoverGiftBlock asset={a} transferDate="2026-03-01" onChange={vi.fn()} />);
    expect(screen.queryByTestId("carryover-gift-debt-assumed")).toBeNull();
    expect(debtFields()).toEqual([]);
    expect(document.querySelector("[data-field='carryover.giftTaxAmount']")?.textContent).toContain("당초 증여 때 인수한 채무를 뺀 금액");
  });
});
