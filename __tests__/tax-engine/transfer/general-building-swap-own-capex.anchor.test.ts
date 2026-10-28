/**
 * anchor — `GeneralBuildingSwapDecision.ownCapex`: 본인 직접귀속 나목(`ownDirect`) 중 **자본적지출** 몫 — 파트 축·증축(3-way) 모양별 값.
 *
 * 계획서 `docs/00-pm/carryover-a-gb-card-filing-acq-cell-label.plan.md` §5.1·§10-5. 이월과세 A 카드는 `ownCapex`를 `capitalExpenditure`로,
 * `ownDirect − ownCapex`(양도비 몫)를 `transferExpense`로 싣는다 — 신고서·명세서는 자본적지출 몫만 「취득가액」 칸으로 옮긴다.
 * 짝 파일 `general-building-swap-own-direct.anchor.test.ts` 가 `ownDirect`(합) 를 고정하고, 이 파일은 그 합이 **자본적지출 몫 + 양도비 몫**으로
 * 모양마다 올바르게 갈리는지 고정한다(계획서 V-4 — 합산 실행과 자본적지출 전용 실행이 갈라지는 분기마다).
 *
 * 공통 계약
 *   · 몫마다 `ownCapex ≤ ownDirect`, `Σ ownCapex = 입력 자본적지출`, `Σ(ownDirect − ownCapex) = 입력 양도비`
 *   · 같은 배분 규칙(`allocateWithinGroup` 마지막 카드 잔액 흡수)이라 합산 몫과 자본적지출 몫이 1원 어긋나는 곳은 양도비 쪽이 흡수한다
 *
 * ## 손계산 (독립 — 카드 값은 짝 파일과 같다)
 * 파트 축 양도비 1,000,000 은 파트 양도가액 비례(토지 318,454,409 : 건물 11,545,591)로 토지 floor(1,000,000 × 318,454,409 / 330,000,000) = 965,013 · 건물 34,987.
 * 증축 픽스처의 양도비 1,000,000: 토지 318,454,409 : 건물 파트(289,984,290 + 44,772,704) → 토지 487,521 · 건물 파트 512,479,
 *   원건물 : 증축분 = 289,984,290 : 44,772,704 → 증축분 몫 floor 없이 잔액(마지막 카드) 68,543 · 원건물 443,936.
 */
import { describe, it, expect } from "vitest";
import { resolveGeneralBuildingSwap } from "@/lib/tax-engine/general-building-swap";
import type { GeneralBuildingSwapDecision } from "@/lib/tax-engine/general-building-swap";
import type { AssetCardForAggregate } from "@/lib/tax-engine/general-building-valuation";

const card = (id: "land" | "building", over: Partial<AssetCardForAggregate> = {}): AssetCardForAggregate =>
  (id === "land"
    ? { propertyId: "land", propertyLabel: "토지", propertyType: "land", transferPrice: 318_454_409, acquisitionPrice: 74_854_965, expenses: 2_394_000, usedEstimatedAcquisition: true, ...over }
    : { propertyId: "building", propertyLabel: "건물", propertyType: "general_building_unit", transferPrice: 11_545_591, acquisitionPrice: 15_943_911, expenses: 509_915, usedEstimatedAcquisition: true, ...over }) as AssetCardForAggregate;
const b1 = (over: Partial<AssetCardForAggregate> = {}) =>
  ({ propertyId: "building1", propertyLabel: "건물1", propertyType: "general_building_unit", transferPrice: 289_984_290, acquisitionPrice: 167_897_635, expenses: 4_500_000, usedEstimatedAcquisition: true, ...over }) as AssetCardForAggregate;
const b2 = (over: Partial<AssetCardForAggregate> = {}) =>
  ({ propertyId: "building2", propertyLabel: "건물2", propertyType: "general_building_unit", transferPrice: 44_772_704, acquisitionPrice: 33_579_528, expenses: 900_000, usedEstimatedAcquisition: true, ...over }) as AssetCardForAggregate;

/** [ownDirect 합, ownCapex 자본적지출 몫] */
const pair = (d: GeneralBuildingSwapDecision, id: string): [number, number] => [d.ownDirect.get(id) ?? 0, d.ownCapex.get(id) ?? 0];
const total = (d: GeneralBuildingSwapDecision, ids: string[], pick: 0 | 1) => ids.reduce((s, id) => s + pair(d, id)[pick], 0);
/** 공통 계약 — 입력한 자본적지출·양도비가 한 푼도 새지 않고 두 몫으로 갈린다. */
function expectConserved(d: GeneralBuildingSwapDecision, ids: string[], capex: number, transfer: number) {
  for (const id of ids) {
    const [direct, cap] = pair(d, id);
    expect(cap, `${id} ownCapex ≤ ownDirect`).toBeLessThanOrEqual(direct);
    expect(cap, `${id} ownCapex ≥ 0`).toBeGreaterThanOrEqual(0);
  }
  expect(total(d, ids, 1)).toBe(capex);
  expect(total(d, ids, 0) - total(d, ids, 1)).toBe(transfer);
}

describe("ownCapex — 파트 축(파트 직접귀속 + 양도비 가액 비례 · 양도비 1,000,000)", () => {
  const T = { transferExpense: 1_000_000 };

  it("CX-1 두 파트 환산: 토지 [1,965,013 / 1,000,000] · 건물 [234,987 / 200,000]", () => {
    const d = resolveGeneralBuildingSwap([card("land"), card("building")], undefined, 0, {
      land: { direct: 1_000_000, mode: "estimated" }, building: { direct: 200_000, mode: "estimated" }, ...T,
    });
    expect(pair(d, "land")).toEqual([1_000_000 + 965_013, 1_000_000]);
    expect(pair(d, "building")).toEqual([200_000 + 34_987, 200_000]);
    expectConserved(d, ["land", "building"], 1_200_000, 1_000_000);
  });

  it("CX-2 실가 토지 + 환산 건물: 실가 파트도 같은 갈래 — 토지 [4,965,013 / 4,000,000] · 건물 [134,987 / 100,000]", () => {
    const d = resolveGeneralBuildingSwap(
      [card("land", { usedEstimatedAcquisition: false, acquisitionPrice: 100_000_000, expenses: 0 }), card("building")], undefined, 0,
      { land: { direct: 4_000_000, mode: "actual" }, building: { direct: 100_000, mode: "estimated" }, ...T },
    );
    expect(pair(d, "land")).toEqual([4_000_000 + 965_013, 4_000_000]);
    expect(pair(d, "building")).toEqual([100_000 + 34_987, 100_000]);
    expectConserved(d, ["land", "building"], 4_100_000, 1_000_000);
  });

  it("CX-3 감정가액 건물(갈래 4): allocation 은 비어도 본인 지출의 귀속처다 — 건물 [734,987 / 700,000]", () => {
    const d = resolveGeneralBuildingSwap(
      [card("land"), card("building", { usedEstimatedAcquisition: false })], undefined, 0,
      { land: { direct: 1_000_000, mode: "estimated" }, building: { direct: 700_000, mode: "appraisal" }, ...T },
    );
    expect(d.allocation.has("building")).toBe(false);
    expect(pair(d, "building")).toEqual([700_000 + 34_987, 700_000]);
    expect(pair(d, "land")).toEqual([1_000_000 + 965_013, 1_000_000]);
    expectConserved(d, ["land", "building"], 1_700_000, 1_000_000);
  });

  it("CX-3b 매매사례가액 건물도 감정가액과 같다(갈래 4) — 건물 [734,987 / 700,000]", () => {
    const d = resolveGeneralBuildingSwap(
      [card("land"), card("building", { usedEstimatedAcquisition: false })], undefined, 0,
      { land: { direct: 1_000_000, mode: "estimated" }, building: { direct: 700_000, mode: "salesCase" }, ...T },
    );
    expect(pair(d, "building")).toEqual([700_000 + 34_987, 700_000]);
  });

  it("CX-4 환산 건물 나목 > 가목(단서 발동 — 50,000,000): 건물 [50,034,987 / 50,000,000]", () => {
    const d = resolveGeneralBuildingSwap([card("land"), card("building")], undefined, 0, {
      land: { direct: 1_000_000, mode: "estimated" }, building: { direct: 50_000_000, mode: "estimated" }, ...T,
    });
    expect(d.swapApplied).toBe(true);
    expect(pair(d, "building")).toEqual([50_000_000 + 34_987, 50_000_000]);
    expectConserved(d, ["land", "building"], 51_000_000, 1_000_000);
  });

  it("CX-5 양도비만(파트 직접귀속 0): 자본적지출 몫은 모두 0 — 취득가액 칸으로 옮길 것이 없다", () => {
    const d = resolveGeneralBuildingSwap([card("land"), card("building")], undefined, 0, {
      land: { direct: 0, mode: "estimated" }, building: { direct: 0, mode: "estimated" }, ...T,
    });
    expect(pair(d, "land")).toEqual([965_013, 0]);
    expect(pair(d, "building")).toEqual([34_987, 0]);
    expectConserved(d, ["land", "building"], 0, 1_000_000);
  });
});

describe("ownCapex — 증축(building2) 파트 축 (resolveExtensionBuildingPart · 양도비 1,000,000)", () => {
  const T = { transferExpense: 1_000_000 };
  const IDS = ["land", "building1", "building2"];
  const landEst = { land: { direct: 0, mode: "estimated" as const } };

  it("CX-6 원건물 환산 + 증축분 환산: 증축 전 지출 100,000 은 원건물에만 — 원건물 [943,732 / 516,666] · 증축분 [168,747 / 83,334]", () => {
    const d = resolveGeneralBuildingSwap([card("land"), b1(), b2()], undefined, 0, {
      ...landEst, building: { direct: 600_000, mode: "estimated", directBeforeExtension: 100_000 }, ...T,
    });
    // 증축 후 500,000 + 양도비(건물 파트) 512,479 = 1,012,479 를 (환산취득가+개산공제) 172,397,635 : 34,479,528 로 → 원건물 843,732(+증축 전 100,000) · 증축분 168,747.
    // 자본적지출만: 500,000 → 416,666 · 83,334. 양도비 몫 = 합 − 자본적지출 = 원건물 427,066 · 증축분 85,413.
    expect(pair(d, "building1")).toEqual([943_732, 516_666]);
    expect(pair(d, "building2")).toEqual([168_747, 83_334]);
    expect(pair(d, "land")).toEqual([487_521, 0]);
    expectConserved(d, IDS, 600_000, 1_000_000);
  });

  it("CX-7 원건물 감정가액(갈래 4) + 증축분 실가: 증축분 [188,916 / 120,373] · 원건물 [1,223,563 / 779,627]", () => {
    const d = resolveGeneralBuildingSwap(
      [card("land"), b1({ usedEstimatedAcquisition: false }), b2({ usedEstimatedAcquisition: false })], undefined, 0,
      { ...landEst, building: { direct: 900_000, mode: "appraisal", directBeforeExtension: 0 }, ...T },
    );
    // 증축분 몫: 자본적지출 120,373(양도가액 비례) + 양도비 68,543 = 188,916 (가산 — §97②1호)
    expect(pair(d, "building2")).toEqual([188_916, 120_373]);
    expect(pair(d, "building1")).toEqual([1_223_563, 779_627]);
    expectConserved(d, IDS, 900_000, 1_000_000);
  });

  it("CX-8 원건물 실가 + 증축분 실가: 전부 가산 — 원건물 [1,223,564 / 779,627] · 증축분 [188,915 / 120,373] (합산 몫과 자본적지출 몫이 1원 어긋나는 모양 — 양도비가 흡수)", () => {
    const d = resolveGeneralBuildingSwap(
      [card("land"), b1({ usedEstimatedAcquisition: false }), b2({ usedEstimatedAcquisition: false })], undefined, 0,
      { ...landEst, building: { direct: 900_000, mode: "actual", directBeforeExtension: 0 }, ...T },
    );
    expect(pair(d, "building1")).toEqual([1_223_564, 779_627]);
    expect(pair(d, "building2")).toEqual([188_915, 120_373]);
    expectConserved(d, IDS, 900_000, 1_000_000);
  });

  it("CX-9 원건물 실가 + 증축분 환산: 양도비는 전액 원건물 실가 카드 몫 — 증축분 [120,373 / 120,373] · 원건물 [1,292,106 / 779,627]", () => {
    const d = resolveGeneralBuildingSwap(
      [card("land"), b1({ usedEstimatedAcquisition: false }), b2()], undefined, 0,
      { ...landEst, building: { direct: 900_000, mode: "actual", directBeforeExtension: 0 }, ...T },
    );
    // 증축분(환산)은 증축 후 자본적지출 몫만 단서 비교로 받는다(양도비는 실가 카드 — E-1 Q-8) → 증축분의 양도비 몫 0.
    expect(pair(d, "building2")).toEqual([120_373, 120_373]);
    expect(pair(d, "building1")).toEqual([900_000 + 512_479 - 120_373, 779_627]);
    expectConserved(d, IDS, 900_000, 1_000_000);
  });

  it("CX-10 원건물 감정가액(갈래 4) + 증축분 환산: 증축분 [188,916 / 120,373] · 원건물 [1,223,563 / 779,627]", () => {
    const d = resolveGeneralBuildingSwap(
      [card("land"), b1({ usedEstimatedAcquisition: false }), b2()], undefined, 0,
      { ...landEst, building: { direct: 900_000, mode: "appraisal", directBeforeExtension: 0 }, ...T },
    );
    expect(pair(d, "building2")).toEqual([188_916, 120_373]);
    expect(pair(d, "building1")).toEqual([1_223_563, 779_627]);
    expectConserved(d, IDS, 900_000, 1_000_000);
  });
});

describe("ownCapex — 증축 자산총액 판정(자산 단위 입력 + ExtensionCapexInput)", () => {
  it("CX-11 증축분 실가 · 자본적지출 1,000,000 · 양도비 400,000: 증축분 몫을 먼저 떼고 나머지를 환산 카드에 비례 — 토지 [416,445 / 301,155] · 원건물 [929,387 / 672,095] · 증축분 [54,168 / 26,750]", () => {
    const d = resolveGeneralBuildingSwap(
      [card("land"), b1(), b2({ usedEstimatedAcquisition: false })], 1_000_000, 400_000, undefined,
      { capexBeforeExtension: 100_000, capexAfterExtensionBuilding: 200_000 },
    );
    // 증축분 몫: 자본적지출 200,000 을 건물 카드(원건물 : 증축분 = 양도가액 비례)에 → 26,750 · 양도비 400,000 을 전 카드(토지 : 원건물 : 증축분)에 → 27,418 (마지막 카드 잔액).
    // 나머지 자본적지출 973,250 을 (환산취득가+개산공제) 토지 77,248,965 : 원건물 172,397,635 → 토지 301,155 · 원건물 672,095.
    // 합산 실행: 나머지 1,400,000 − 54,168 = 1,345,832 → 토지 416,445 · 원건물 929,387 (자본적지출만의 몫 이상 — 차이가 양도비 몫).
    expect(pair(d, "building2")).toEqual([54_168, 26_750]);
    expect(pair(d, "land")).toEqual([416_445, 301_155]);
    expect(pair(d, "building1")).toEqual([929_387, 672_095]);
    expectConserved(d, ["land", "building1", "building2"], 1_000_000, 400_000);
  });

  it("CX-12 본인 지출이 없으면 새 값을 만들지 않는다", () => {
    const d = resolveGeneralBuildingSwap([card("land"), b1(), b2()], undefined, undefined, undefined, { capexBeforeExtension: 0, capexAfterExtensionBuilding: 0 });
    expect([...d.ownCapex.values()].reduce((s, v) => s + v, 0)).toBe(0);
    expect([...d.ownDirect.values()].reduce((s, v) => s + v, 0)).toBe(0);
  });
});
