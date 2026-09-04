/**
 * §164⑧ 연도 교차 opt-in — **폼에서 엔진까지 도달하는가**.
 *
 * 리뷰 실측(2026-08-25): 엔진 게이트를 `transferYear <= acquisitionYear + 1`로 넓혔지만
 * 폼(`buildInput`)이 **같은 연도일 때만** `holdingMonths`를 채워 새 조건절이 **어떤 실제
 * 입력으로도 진입할 수 없었다**. 집행기준 계산사례 2건(2005 취득 → 2006 양도)이 여전히
 * 미해결이었던 것 — 「게이트를 넓혔다」와 「입력이 그 게이트에 닿는다」는 다르다.
 */
import { describe, it, expect } from "vitest";
import { toEngineInput, initialBuildingStdPriceForm } from "@/lib/calc/building-std-price-form";
import { validateBuildingStdPriceForm } from "@/lib/calc/building-std-price-validate";
import type { BuildingStdPriceFormState } from "@/lib/calc/building-std-price-form";

/** 2005 취득 → 2006 양도 (집행기준 사례1 연도축) */
function crossYearForm(over: Partial<BuildingStdPriceFormState> = {}): BuildingStdPriceFormState {
  return {
    ...initialBuildingStdPriceForm,
    taxType: "transfer",
    floorArea: "200",
    builtYear: "2000",
    acquisitionYear: "2005",
    transferYear: "2006",
    acqStructureKey: "rc",
    acqUsageNo: "1",
    acqLandPrice: "1,000,000",
    holdingMonths: "8",
    adjustMonths: "12",
    sameYearFormula: "prev",
    prevLandPrice: "900,000",
    ...over,
  } as BuildingStdPriceFormState;
}

describe("§164⑧ 연도 교차 opt-in", () => {
  it("OFF면 종전과 같다 — 환산 입력이 엔진에 실리지 않는다", () => {
    const input = toEngineInput(crossYearForm({ crossYearSameAdjust: false }));
    expect(input.holdingMonths).toBeUndefined();
    expect(input.prevLandPricePerM2).toBeUndefined();
  });

  it("★ ON이면 엔진 게이트에 도달한다 — holdingMonths가 실린다", () => {
    const input = toEngineInput(crossYearForm({ crossYearSameAdjust: true }));
    expect(input.holdingMonths).toBe(8);
    expect(input.adjustMonths).toBe(12);
    expect(input.sameYearFormula).toBe("prev");
    expect(input.prevLandPricePerM2).toBe(900_000);
  });

  it("ON이면 검증도 같은 필수 입력을 요구한다 (④↔⑧ 동일 축)", () => {
    const missing = crossYearForm({ crossYearSameAdjust: true, holdingMonths: "" });
    expect(validateBuildingStdPriceForm(missing)).toContain("보유월수");
  });

  it("창(취득연도+1년)을 넘으면 ON이어도 실리지 않는다", () => {
    const input = toEngineInput(crossYearForm({ crossYearSameAdjust: true, transferYear: "2008" }));
    expect(input.holdingMonths).toBeUndefined();
  });
});
