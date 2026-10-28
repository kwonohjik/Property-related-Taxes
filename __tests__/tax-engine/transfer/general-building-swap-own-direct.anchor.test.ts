/**
 * anchor — `GeneralBuildingSwapDecision.ownDirect`: 단서(§97②2호) 발동·불발과 무관한 **양도자 본인 직접귀속 나목**의 카드별 몫.
 *
 * 계획서 `docs/00-pm/gb-estimated-carryover-scenario-a-capex.plan.md` §6.3 · Q-2(현행 swap 배분 규칙 재사용)·Q-4(합산).
 * 이월과세(§97의2) 카드가 이 값을 `capitalExpenditure`로 싣는다 — 카드 `expenses` 스칼라는 환산 파트에서 개산공제라 본인 지출을 줄 수 없다.
 *
 * 고정 계약
 *   O-1 자산총액 판정 불발이어도 `ownDirect` Σ = 자본적지출 + 양도비, `allocation`은 비어 있다(종전 그대로)
 *   O-2 자산총액 판정 발동이면 `ownDirect` = `allocation` (같은 배분 규칙)
 *   O-3 파트 축 — 실가 파트는 `addition`, 환산 파트는 파트 나목, 감정·매매사례 파트(갈래 4)도 파트 나목을 받는다
 *   O-4 본인 지출이 없으면 0(또는 키 없음) — 새 값을 만들지 않는다
 *   O-5 불변: `swapApplied`·`allocation`·`addition`은 `ownDirect` 계산과 무관하게 종전 판정 그대로
 */
import { describe, it, expect } from "vitest";
import { resolveGeneralBuildingSwap } from "@/lib/tax-engine/general-building-swap";
import type { AssetCardForAggregate } from "@/lib/tax-engine/general-building-valuation";

// 보고 사례(계획서 §2.1)의 카드 값: 토지 환산취득가 74,854,965 + 개산공제 2,394,000 · 건물 15,943,911 + 509,915
const card = (id: "land" | "building", over: Partial<AssetCardForAggregate> = {}): AssetCardForAggregate =>
  (id === "land"
    ? { propertyId: "land", propertyLabel: "토지", propertyType: "land", transferPrice: 318_454_409, acquisitionPrice: 74_854_965, expenses: 2_394_000, usedEstimatedAcquisition: true, ...over }
    : { propertyId: "building", propertyLabel: "건물", propertyType: "general_building_unit", transferPrice: 11_545_591, acquisitionPrice: 15_943_911, expenses: 509_915, usedEstimatedAcquisition: true, ...over }) as AssetCardForAggregate;
const sum = (m: Map<string, number>) => [...m.values()].reduce((s, v) => s + v, 0);

describe("ownDirect — 자산총액 판정(자산 단위 입력)", () => {
  it("O-1 단서 불발(3,000,000 + 5,000,000 < 가목): ownDirect 가 비율대로 나뉘고 allocation 은 비어 있다", () => {
    const d = resolveGeneralBuildingSwap([card("land"), card("building")], 3_000_000, 5_000_000);
    expect(d.swapApplied).toBe(false);
    expect(d.allocation.size).toBe(0);
    // 8,000,000 × 77,248,965 / (77,248,965 + 16,453,826) = 6,595,232 · 잔액 흡수 1,404,768
    expect(d.ownDirect.get("land")).toBe(6_595_232);
    expect(d.ownDirect.get("building")).toBe(1_404_768);
    expect(sum(d.ownDirect)).toBe(8_000_000);
  });

  it("O-2 단서 발동(150,000,000 + 5,000,000 > 가목): ownDirect = allocation", () => {
    const d = resolveGeneralBuildingSwap([card("land"), card("building")], 150_000_000, 5_000_000);
    expect(d.swapApplied).toBe(true);
    expect(d.ownDirect.get("land")).toBe(127_782_635);
    expect(d.ownDirect.get("building")).toBe(27_217_365);
    expect(d.ownDirect).toEqual(d.allocation);
  });

  it("O-4 본인 지출이 없으면 새 값을 만들지 않는다", () => {
    const d = resolveGeneralBuildingSwap([card("land"), card("building")], undefined, undefined);
    expect(sum(d.ownDirect)).toBe(0);
    expect(d.swapApplied).toBe(false);
    expect(d.allocation.size).toBe(0);
  });
});

describe("ownDirect — 파트 축(파트별 직접귀속 + 양도비 가액 비례)", () => {
  it("O-3a 두 파트 환산: 파트 직접귀속 + 양도비 안분 = 파트 몫 (단서 불발이어도)", () => {
    const d = resolveGeneralBuildingSwap([card("land"), card("building")], undefined, 0, {
      land: { direct: 1_000_000, mode: "estimated" },
      building: { direct: 200_000, mode: "estimated" },
    });
    expect(d.ownDirect.get("land")).toBe(1_000_000);
    expect(d.ownDirect.get("building")).toBe(200_000);
    expect(d.swapApplied).toBe(false);
    expect(d.allocation.size).toBe(0);
  });

  it("O-3b 실가 토지 + 환산 건물: 실가 파트는 addition(= ownDirect), 환산 파트는 파트 나목", () => {
    const d = resolveGeneralBuildingSwap(
      [card("land", { usedEstimatedAcquisition: false, acquisitionPrice: 100_000_000, expenses: 0 }), card("building")],
      undefined, 0,
      { land: { direct: 4_000_000, mode: "actual" }, building: { direct: 100_000, mode: "estimated" } },
    );
    expect(d.addition.get("land")).toBe(4_000_000);
    expect(d.ownDirect.get("land")).toBe(4_000_000);
    expect(d.ownDirect.get("building")).toBe(100_000);
  });

  it("O-3c 감정가액 건물(갈래 4): 단서 대상이 아니라 allocation/addition 은 비지만 본인 지출의 귀속처이다", () => {
    const d = resolveGeneralBuildingSwap(
      [card("land"), card("building", { usedEstimatedAcquisition: false })],
      undefined, 0,
      { land: { direct: 1_000_000, mode: "estimated" }, building: { direct: 700_000, mode: "appraisal" } },
    );
    expect(d.allocation.has("building")).toBe(false);
    expect(d.addition.has("building")).toBe(false);
    expect(d.ownDirect.get("building")).toBe(700_000);
    expect(d.ownDirect.get("land")).toBe(1_000_000);
  });

  it("O-5 파트 축에서도 종전 판정 불변 — 환산 건물 나목 > 가목이면 allocation 만 발동", () => {
    const d = resolveGeneralBuildingSwap([card("land"), card("building")], undefined, 0, {
      land: { direct: 1_000_000, mode: "estimated" },
      building: { direct: 50_000_000, mode: "estimated" },
    });
    expect(d.swapApplied).toBe(true);
    expect([...d.allocation.keys()]).toEqual(["building"]);
    expect(d.allocation.get("building")).toBe(50_000_000);
    expect(d.ownDirect.get("building")).toBe(50_000_000);
    expect(d.ownDirect.get("land")).toBe(1_000_000);
  });
});

describe("ownDirect — 증축(building2) 파트 축 (resolveExtensionBuildingPart)", () => {
  const b1 = (over: Partial<AssetCardForAggregate> = {}) =>
    ({ propertyId: "building1", propertyLabel: "건물1", propertyType: "general_building_unit", transferPrice: 289_984_290, acquisitionPrice: 167_897_635, expenses: 4_500_000, usedEstimatedAcquisition: true, ...over }) as AssetCardForAggregate;
  const b2 = (over: Partial<AssetCardForAggregate> = {}) =>
    ({ propertyId: "building2", propertyLabel: "건물2", propertyType: "general_building_unit", transferPrice: 44_772_704, acquisitionPrice: 33_579_528, expenses: 900_000, usedEstimatedAcquisition: true, ...over }) as AssetCardForAggregate;

  it("O-6 원건물 환산 + 증축분 환산: 증축 전 지출 100,000 은 원건물에만, 나머지 500,000 은 (환산취득가+개산공제) 비례 — 단서 불발이어도", () => {
    const d = resolveGeneralBuildingSwap([card("land"), b1(), b2()], undefined, 0, {
      land: { direct: 1_000_000, mode: "estimated" },
      building: { direct: 600_000, mode: "estimated", directBeforeExtension: 100_000 },
    });
    expect(d.swapApplied).toBe(false);
    expect(d.allocation.size).toBe(0);
    // 500,000 × 172,397,635 / 206,877,163 = 416,666 (잔액 흡수 83,334)
    expect(d.ownDirect.get("building1")).toBe(100_000 + 416_666);
    expect(d.ownDirect.get("building2")).toBe(83_334);
    expect((d.ownDirect.get("building1") ?? 0) + (d.ownDirect.get("building2") ?? 0)).toBe(600_000);
  });

  it("O-7 원건물 감정가액(갈래 4) + 증축분 실가: 증축분은 가액 비례 몫을 가산받고 원건물이 나머지를 받는다", () => {
    const d = resolveGeneralBuildingSwap(
      [card("land"), b1({ usedEstimatedAcquisition: false }), b2({ usedEstimatedAcquisition: false })],
      undefined, 0,
      { land: { direct: 0, mode: "estimated" }, building: { direct: 900_000, mode: "appraisal", directBeforeExtension: 0 } },
    );
    // 증축분 몫 = 900,000 중 양도가액 비례 120,373 (원건물 779,627)
    expect(d.addition.get("building2")).toBe(120_373);
    expect(d.ownDirect.get("building2")).toBe(120_373);
    expect(d.ownDirect.get("building1")).toBe(779_627);
    expect(d.allocation.has("building1")).toBe(false);
  });

  it("O-8 원건물 실가 + 증축분 실가: ownDirect = addition (전부 가산)", () => {
    const d = resolveGeneralBuildingSwap(
      [card("land"), b1({ usedEstimatedAcquisition: false }), b2({ usedEstimatedAcquisition: false })],
      undefined, 0,
      { land: { direct: 0, mode: "estimated" }, building: { direct: 900_000, mode: "actual", directBeforeExtension: 0 } },
    );
    expect(d.ownDirect.get("building1")).toBe(779_627);
    expect(d.ownDirect.get("building2")).toBe(120_373);
    expect(d.ownDirect).toEqual(d.addition);
  });

  it("O-9 원건물 실가 + 증축분 환산: 증축분 몫은 단서 불발이어도 ownDirect 에 들어가고 원건물은 나머지를 가산받는다", () => {
    const d = resolveGeneralBuildingSwap(
      [card("land"), b1({ usedEstimatedAcquisition: false }), b2()],
      undefined, 0,
      { land: { direct: 0, mode: "estimated" }, building: { direct: 900_000, mode: "actual", directBeforeExtension: 0 } },
    );
    expect(d.swapApplied).toBe(false);
    expect(d.allocation.has("building2")).toBe(false); // 120,373 < 증축분 가목 → 본문
    expect(d.addition.get("building1")).toBe(779_627);
    expect(d.ownDirect.get("building1")).toBe(779_627);
    expect(d.ownDirect.get("building2")).toBe(120_373);
  });

  it("O-10 원건물 감정가액(갈래 4) + 증축분 환산: 증축분 몫 120,373 · 원건물 나머지 779,627", () => {
    const d = resolveGeneralBuildingSwap(
      [card("land"), b1({ usedEstimatedAcquisition: false }), b2()],
      undefined, 0,
      { land: { direct: 0, mode: "estimated" }, building: { direct: 900_000, mode: "appraisal", directBeforeExtension: 0 } },
    );
    expect(d.swapApplied).toBe(false);
    expect(d.allocation.size).toBe(0);
    expect(d.ownDirect.get("building2")).toBe(120_373);
    expect(d.ownDirect.get("building1")).toBe(779_627);
  });
});
