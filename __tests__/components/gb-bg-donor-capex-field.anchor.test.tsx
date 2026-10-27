/**
 * anchor — 부담부증여 일반건물 × 이월과세: 「증여자 자본적지출」 칸 (V-3 · Q-3 a ⑤)
 *
 * 계획서 `docs/00-pm/gb-bg-on-building-block-fields.plan.md` §4.3.
 * 토지도 이월과세면 증여 사건은 토지 블록이 정본이다(`gbCarryoverEventSource`) — 건물 블록 칸은 ④가 읽지 않아 숨기고, 토지 블록 칸이 토지·건물 합계를 받는다.
 * 건물만 이월과세면 건물 블록이 유일한 입력처라 그대로 보인다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { GeneralBuildingAcquisitionCards } from "../../components/calc/transfer/GeneralBuildingAcquisitionCards";
import { makeDefaultAsset } from "../../lib/stores/calc-wizard-store";
import { CARRYOVER_DEFAULTS } from "../../lib/stores/calc-wizard-asset-carryover";
import type { AssetForm } from "../../lib/stores/calc-wizard-asset";

afterEach(cleanup);

const CO = { ...CARRYOVER_DEFAULTS, giftRegistryDate: "2024-05-01", donorAcquisitionDate: "2015-01-01" };
function asset(over: Record<string, unknown> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    transferType: "burdened_gift",
    hasSeperateLandAcquisitionDate: true,
    landAcquisitionDate: "2024-05-01",
    acquisitionCause: "carryover_gift",
    gbBuildingAcquisitionCause: "carryover_gift",
    carryover: CO,
    buildingCarryover: CO,
    ...over,
  } as unknown as AssetForm;
}
const capexCards = () => [...document.querySelectorAll("[data-field$='.donorCapitalExpenditure']")].map((e) => e.getAttribute("data-field"));
const draw = (a: AssetForm) => render(<GeneralBuildingAcquisitionCards asset={a} onChange={vi.fn()} transferDate="2026-03-01" />);

describe("증여자 자본적지출 칸", () => {
  it("분리 ON · 둘 다 이월과세 → 토지 블록 한 칸(「토지·건물 합계」) · 건물 블록 칸 없음", () => {
    draw(asset());
    expect(capexCards()).toEqual(["carryover.donorCapitalExpenditure"]);
    expect(screen.getByText("증여자 자본적지출(토지·건물 합계)")).toBeTruthy();
  });

  it("건물만 이월과세 → 건물 블록 칸이 유일한 입력처로 보인다(건물 키)", () => {
    draw(asset({ acquisitionCause: "purchase" }));
    expect(capexCards()).toEqual(["buildingCarryover.donorCapitalExpenditure"]);
    expect(screen.queryByText("증여자 자본적지출(토지·건물 합계)")).toBeNull();
  });

  it("일반 양도(부담부증여 아님) · 둘 다 이월과세 → 종전대로 두 블록 모두 보인다", () => {
    draw(asset({ transferType: "general" }));
    expect(capexCards()).toEqual(["carryover.donorCapitalExpenditure", "buildingCarryover.donorCapitalExpenditure"]);
  });
});
