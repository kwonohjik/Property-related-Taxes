/**
 * anchor — 부담부증여 일반건물 × 이월과세: 계산에 닿지 않는 칸 숨김 (V-3 · Q-1 a · Q-2 a)
 *
 * 계획서 `docs/00-pm/gb-bg-on-building-block-fields.plan.md` §1.2 · §4.1 · §4.2.
 * Q-1: 토지도 이월과세면 증여 사건(등기접수일·산출세액·과세가액·관계·사망·적용배제)은 토지 블록 한 벌이다 — 건물 블록의 같은 칸은 ④ 본문에서 사라졌다.
 * Q-2: 부담부증여 일반건물의 당초 증여자 취득가액은 「당초 증여자」 블록이 정본이다 — 두 블록의 취득원인·취득가액·환산 칸은 ④·엔진이 쓰지 않았다.
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
const draw = (a: AssetForm) => render(<GeneralBuildingAcquisitionCards asset={a} onChange={vi.fn()} transferDate="2026-03-01" />);
const fields = (suffix: string) => [...document.querySelectorAll(`[data-field$='${suffix}']`)].map((e) => e.getAttribute("data-field"));
const count = (text: string | RegExp) => screen.queryAllByText(text).length;

describe("Q-1 a 건물 블록의 증여 사건 칸 — 토지도 이월과세인 부담부증여면 숨긴다", () => {
  it("분리 ON 둘 다 → 등기접수일·산출세액·과세가액·적용배제는 토지 블록에만 · 건물분 취득일·평가액은 건물 블록에 남는다", () => {
    draw(asset());
    expect(fields(".giftRegistryDate")).toHaveLength(1);
    expect(fields(".giftTaxCalculated")).toEqual(["carryover.giftTaxCalculated"]);
    expect(fields(".giftTaxBase")).toEqual(["carryover.giftTaxBase"]);
    expect(count("이월과세 적용배제 선언 (해당 시 선택)")).toBe(1);
    expect(fields(".donorAcquisitionDate")).toEqual(["carryover.donorAcquisitionDate", "buildingCarryover.donorAcquisitionDate"]);
    expect(fields(".giftDateValuation")).toEqual(["carryover.giftDateValuation", "buildingCarryover.giftDateValuation"]);
  });

  it("건물만 이월과세 → 건물 블록이 유일한 입력처라 사건 칸이 그대로 보인다", () => {
    draw(asset({ acquisitionCause: "purchase" }));
    expect(fields(".giftRegistryDate")).toHaveLength(1);
    expect(fields(".giftTaxCalculated")).toEqual(["buildingCarryover.giftTaxCalculated"]);
    expect(count("이월과세 적용배제 선언 (해당 시 선택)")).toBe(1);
  });

  it("일반 양도 둘 다 → 종전대로 두 블록 모두(V-1 범위 밖)", () => {
    draw(asset({ transferType: "general" }));
    expect(fields(".giftTaxCalculated")).toEqual(["carryover.giftTaxCalculated", "buildingCarryover.giftTaxCalculated"]);
    expect(count("이월과세 적용배제 선언 (해당 시 선택)")).toBe(2);
  });
});

describe("Q-2 a 증여자 취득원인·취득가액·환산 칸 — 부담부증여 일반건물이면 두 블록 모두 숨긴다", () => {
  it("분리 ON 둘 다 → 취득원인·취득가액·환산 토글 없음 · 「당초 증여자」 블록 안내가 블록마다", () => {
    draw(asset());
    expect(count("증여자 취득원인")).toBe(0);
    expect(fields(".donorAcquisitionPrice")).toEqual([]);
    expect(count("환산취득가 사용")).toBe(0);
    expect(screen.getAllByTestId("gb-bg-donor-basis-elsewhere")).toHaveLength(2);
  });

  it("환산 토글이 켜진 채 남았으면 그 블록에만 토글이 보인다(끌 수 있게) · 환산 방식 칸은 없다", () => {
    draw(asset({ carryover: { ...CO, useEstimatedAcquisition: true, estimationMode: "general" } }));
    expect(count("환산취득가 사용")).toBe(1);
    expect(fields(".estimationMode")).toEqual([]);
    expect(fields(".donorStandardPriceAtAcquisition")).toEqual([]);
  });

  it("일반 양도 → 종전대로 취득원인·취득가액 칸이 두 블록 모두", () => {
    draw(asset({ transferType: "general" }));
    expect(count("증여자 취득원인")).toBe(2);
    expect(fields(".donorAcquisitionPrice")).toEqual(["carryover.donorAcquisitionPrice", "buildingCarryover.donorAcquisitionPrice"]);
    expect(screen.queryAllByTestId("gb-bg-donor-basis-elsewhere")).toHaveLength(0);
  });
});
