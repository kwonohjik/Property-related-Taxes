/**
 * P-3 anchor — 일반건물 **실가 경로**에 자본적지출·양도비(§97①2호·3호)가 도달하는가.
 *
 * 계획서: `docs/02-design/features/gb-actual-path-sale-split-noop.plan.md` §2 · §6.1 (Phase 1)
 *
 * ## 왜 이 anchor가 필요한가
 *
 * 종전에는 실가 경로에 비용이 들어올 필드가 **하나도 없었다**. 사용자가 자본적지출 칸에 값을
 * 넣어도 `actualExpenses`는 legacy `directExpenses`에서만 왔고, 현행 UI는 legacy 칸을
 * 「새 두 필드가 둘 다 0일 때만」 띄우므로(`AssetSectionExpense.tsx:109-111`) 정상 입력에서는
 * 늘 0이었다 — 실측 **결정세액 12,800,000원 과대**.
 *
 * 🔑 **payload에 실렸는지가 아니라 「세액이 바뀌는지」로 잰다**(A-12). 같은 계열의 결함(P-1)이
 *    「payload엔 실리는데 엔진이 안 읽는」 모양이라, body 단언으로는 잡히지 않는다.
 *
 * ⚠️ 실가 경로는 §97②2호 **단서 swap 대상이 아니다** — 환산취득가·개산공제를 쓰지 않아 요건을
 *    충족하지 않는다. 적용 조문은 같은 항 **1호**(「실지거래가액 + 2호·3호」)의 **단순 가산**이다.
 */
import { describe, it, expect } from "vitest";
import { calculateGeneralBuildingActualTransfer } from "@/app/api/calc/transfer/general-building-route-helper";
import { makeMockRates } from "../_helpers/mock-rates";

const rates = makeMockRates();

const BASE = {
  totalTransferPrice: 1_000_000_000,
  transferDate: new Date("2026-03-01"),
  acquisitionDate: new Date("2015-03-01"),
  landArea: 200,
  buildingFootprintArea: 100,
  transferLandPricePerSqm: 3_000_000, // 양도시 토지 기준시가 600,000,000
  transferBuildingStdPrice: 200_000_000,
  zoneType: "commercial",
  isMetropolitan: false,
  isUnregistered: false,
  actualAcquisitionPrice: 500_000_000,
  actualExpenses: 0, // legacy 칸 미입력 = 현행 UI의 정상 상태
  acquisitionLandPricePerSqm: 1_000_000,
  acquisitionBuildingStdPrice: 100_000_000,
};

function run(over: Record<string, unknown> = {}) {
  return calculateGeneralBuildingActualTransfer(
    { ...BASE, ...over } as never, 2026, undefined, [], rates,
  );
}

function expensesOf(r: ReturnType<typeof run>) {
  const cards = (r.aggregated.generalBuildingValuationDetail as unknown as {
    assetCards: Array<{ propertyId: string; expenses: number }>;
  }).assetCards;
  return cards.reduce((s, c) => s + c.expenses, 0);
}

describe("A-11 — 자본적지출·양도비가 실가 경로 엔진까지 도달한다", () => {
  it("자본적지출 30,000,000 + 양도비 10,000,000 → 카드 필요경비 합 40,000,000", () => {
    const r = run({ capitalExpenditure: 30_000_000, transferExpense: 10_000_000 });
    expect(expensesOf(r)).toBe(40_000_000);
  });

  it("한쪽만 입력해도 도달한다 (자본적지출만 30,000,000)", () => {
    expect(expensesOf(run({ capitalExpenditure: 30_000_000 }))).toBe(30_000_000);
  });

  it("양도비만 10,000,000", () => {
    expect(expensesOf(run({ transferExpense: 10_000_000 }))).toBe(10_000_000);
  });
});

describe("A-12 — 🔑 세액으로 잰다 (payload 단언이 아니라 mutation)", () => {
  it("비용을 넣으면 결정세액이 줄어든다 — 차감이 실제로 일어난다", () => {
    const without = run();
    const withExp = run({ capitalExpenditure: 30_000_000, transferExpense: 10_000_000 });
    // 종전에는 이 두 값이 **같았다**(비용 미도달). 그것이 P-3이다.
    expect(withExp.aggregated.calculatedTax).toBeLessThan(without.aggregated.calculatedTax);
    expect(without.aggregated.calculatedTax).toBe(133_060_000);
    expect(withExp.aggregated.calculatedTax).toBe(120_260_000);
  });
});

describe("A-13 — legacy 후퇴 (기존 이력 회귀 0)", () => {
  it("두 필드가 없으면 legacy `actualExpenses`를 쓴다", () => {
    expect(expensesOf(run({ actualExpenses: 40_000_000 }))).toBe(40_000_000);
  });

  /**
   * 🔴 **합산하지 않는다.** legacy만 입력한 기존 이력과 새 입력이 이중계상되면 과소과세가 된다.
   * 후퇴 조건을 UI 게이트(`AssetSectionExpense.tsx:109-111` — 새 두 필드가 둘 다 0일 때만
   * legacy 칸 노출)와 **같은 축**으로 맞춘 결과다.
   */
  it("둘 다 있으면 새 필드가 이기고 legacy는 무시된다 (이중계상 금지)", () => {
    const r = run({ actualExpenses: 99_000_000, capitalExpenditure: 30_000_000 });
    expect(expensesOf(r)).toBe(30_000_000);
  });
});

describe("A-13b — 파트별 직접 귀속이 여전히 이긴다 (기존 계약 보존)", () => {
  it("landDirectExpenses가 있으면 그 파트는 전액 직접 귀속", () => {
    const r = run({
      capitalExpenditure: 40_000_000,
      landDirectExpenses: 7_000_000,
      buildingDirectExpenses: 3_000_000,
    });
    const cards = (r.aggregated.generalBuildingValuationDetail as unknown as {
      assetCards: Array<{ propertyId: string; expenses: number }>;
    }).assetCards;
    const land = cards.find((c) => c.propertyId.includes("land"));
    const building = cards.find((c) => c.propertyId.includes("building"));
    expect(land?.expenses).toBe(7_000_000);
    expect(building?.expenses).toBe(3_000_000);
  });
});
