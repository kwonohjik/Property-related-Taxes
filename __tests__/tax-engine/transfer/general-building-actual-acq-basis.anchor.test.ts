/**
 * P-2 anchor — 일반건물 **실가 경로**의 취득 축 안분 기준 (Phase 2)
 *
 * 계획서: `docs/02-design/features/gb-actual-path-sale-split-noop.plan.md` §3 · §5 · §6.2
 *
 * ## 확정 규칙 (2026-08-07)
 *
 * | 대상 | 안분 기준 |
 * |---|---|
 * | 양도가액 | **양도시** 기준시가 |
 * | 일괄 취득가액 | **취득시** 기준시가 |
 * | 자본적지출(§97①2호) | **취득시** 기준시가 |
 * | 양도비(§97①3호) | **양도시** 기준시가 |
 *
 * ## 조문
 *
 * 「소득세법」 제100조 제2항 **본문**: 「토지와 건물 등을 함께 **취득하거나** 양도한 경우에는 …
 * 가액 구분이 불분명할 때에는 **취득 또는 양도 당시의** 기준시가 등을 고려하여 … 안분계산한다」
 * ⇒ **두 시점을 나란히** 든다. 함께 취득한 것의 구분이 불분명하면 **취득 당시**다.
 *
 * 부가령 §64①1호의 「공급계약일 현재」로 전부 양도시를 삼으면 안 된다 — §166⑥의 준용은
 * **안분계산의 방법**에 관한 것이고 **시점은 §100② 본문**이 정한다.
 * (같은 취지의 하급심 서울행정법원 2025구단52809이 있으나 **1심·본문 미확보**라 보조 참고일 뿐이다.)
 *
 * 🔑 증축 경로는 **2026-05-11에 같은 정정을 마쳤다**(`general-building-extension.ts:194-206` —
 *    「양도시 비율 사용 시 정답표 T-05와 수학적으로 동시 만족 불가」). 실가 경로만 미반영이었다.
 */
import { describe, it, expect } from "vitest";
import { calculateGeneralBuildingActualTransfer } from "@/app/api/calc/transfer/general-building-route-helper";
import { makeMockRates } from "../_helpers/mock-rates";

const rates = makeMockRates();

/**
 * 두 시점의 비율이 **크게 다르도록** 잡는다 — 토지는 오르고 건물은 감가하기 때문이다.
 *   양도시: 토지 600,000,000 / 건물 200,000,000 → 토지비율 0.75
 *   취득시: 토지 200,000,000 / 건물 200,000,000 → 토지비율 0.50
 */
const BASE = {
  totalTransferPrice: 1_000_000_000,
  transferDate: new Date("2026-03-01"),
  acquisitionDate: new Date("2015-03-01"),
  landArea: 200,
  buildingFootprintArea: 100,
  transferLandPricePerSqm: 3_000_000, // × 200 = 600,000,000
  transferBuildingStdPrice: 200_000_000,
  acquisitionLandPricePerSqm: 1_000_000, // × 200 = 200,000,000
  acquisitionBuildingStdPrice: 200_000_000,
  zoneType: "commercial",
  isMetropolitan: false,
  isUnregistered: false,
  actualAcquisitionPrice: 400_000_000,
  actualExpenses: 0,
};

function run(over: Record<string, unknown> = {}) {
  return calculateGeneralBuildingActualTransfer(
    { ...BASE, ...over } as never, 2026, undefined, [], rates,
  );
}

function cardsOf(r: ReturnType<typeof run>) {
  return (r.aggregated.generalBuildingValuationDetail as unknown as {
    assetCards: Array<{ propertyId: string; acquisitionPrice: number; expenses: number; transferPrice: number }>;
  }).assetCards;
}
const land = (r: ReturnType<typeof run>) => cardsOf(r).find((c) => c.propertyId.includes("land"))!;
const building = (r: ReturnType<typeof run>) => cardsOf(r).find((c) => c.propertyId.includes("building"))!;

describe("A-8 — 일괄 취득가액은 **취득시** 기준시가 비율로 안분한다", () => {
  it("취득가액 400,000,000 → 취득시 0.50 비율로 200,000,000 / 200,000,000", () => {
    const r = run();
    expect(land(r).acquisitionPrice).toBe(200_000_000);
    expect(building(r).acquisitionPrice).toBe(200_000_000);
  });

  it("🔴 양도시 비율(0.75)이 아니다 — 그것이 P-2 정정 대상이었다", () => {
    expect(land(run()).acquisitionPrice).not.toBe(300_000_000);
  });

  it("양도가액은 그대로 **양도시** 비율이다 (축이 섞이지 않는다)", () => {
    const r = run();
    expect(land(r).transferPrice).toBe(750_000_000);
    expect(building(r).transferPrice).toBe(250_000_000);
  });

  it("잔액 흡수 — 합이 총액과 같다", () => {
    const r = run();
    expect(land(r).acquisitionPrice + building(r).acquisitionPrice).toBe(400_000_000);
  });
});

describe("A-9 — 필요경비는 **성질별로** 다른 시점을 쓴다", () => {
  it("자본적지출 100,000,000 → 취득시 0.50 → 토지 50,000,000", () => {
    const r = run({ capitalExpenditure: 100_000_000 });
    expect(land(r).expenses).toBe(50_000_000);
    expect(building(r).expenses).toBe(50_000_000);
  });

  it("양도비 100,000,000 → 양도시 0.75 → 토지 75,000,000", () => {
    const r = run({ transferExpense: 100_000_000 });
    expect(land(r).expenses).toBe(75_000_000);
    expect(building(r).expenses).toBe(25_000_000);
  });

  it("🔑 둘 다 있으면 각자의 시점으로 나뉜다 — 50,000,000 + 75,000,000 = 125,000,000", () => {
    const r = run({ capitalExpenditure: 100_000_000, transferExpense: 100_000_000 });
    expect(land(r).expenses).toBe(125_000_000);
    expect(building(r).expenses).toBe(75_000_000);
    expect(land(r).expenses + building(r).expenses).toBe(200_000_000); // 잔액 흡수
  });

  it("legacy `actualExpenses`는 **양도시** 비율 유지 — 두 성질이 섞인 한 덩어리라 나눌 근거가 없다", () => {
    const r = run({ actualExpenses: 100_000_000 });
    expect(land(r).expenses).toBe(75_000_000);
  });
});

describe("A-10 — 취득시 기준시가가 없으면 **차단한다** (양도시로 조용히 후퇴 금지)", () => {
  const noAcqStd = { acquisitionLandPricePerSqm: undefined, acquisitionBuildingStdPrice: undefined };

  it("일괄 취득가액을 나눠야 하는데 기준시가가 없으면 throw", () => {
    expect(() => run(noAcqStd)).toThrow(/취득시 토지 공시지가·건물 기준시가가 필요/);
  });

  it("자본적지출을 나눠야 하는데 기준시가가 없으면 throw", () => {
    expect(() =>
      run({ ...noAcqStd, actualAcquisitionPrice: 0, capitalExpenditure: 100_000_000 }),
    ).toThrow(/취득시 토지 공시지가·건물 기준시가가 필요/);
  });

  /**
   * ⚠️ **거짓 차단 금지** — 취득 축 안분이 실제로 없으면 요구하지 않는다.
   * validate(`transfer-tax-validate-gb.ts` V-5b)도 같은 조건이어야 한다
   * (메모리 `feedback_validation_sync_8th_point`).
   */
  it("취득가액 0 + 양도비만 → 취득 축 안분이 없으므로 통과한다", () => {
    const r = run({ ...noAcqStd, actualAcquisitionPrice: 0, transferExpense: 100_000_000 });
    expect(land(r).expenses).toBe(75_000_000);
  });

  it("파트별 실지취득가액이 둘 다 있으면 안분이 없으므로 통과한다", () => {
    const r = run({
      ...noAcqStd,
      landAcquisitionPrice: 250_000_000,
      buildingAcquisitionPrice: 150_000_000,
    });
    expect(land(r).acquisitionPrice).toBe(250_000_000);
    expect(building(r).acquisitionPrice).toBe(150_000_000);
  });

  it("파트별 자본적지출이 둘 다 있으면 안분이 없으므로 통과한다", () => {
    const r = run({
      ...noAcqStd,
      actualAcquisitionPrice: 0,
      capitalExpenditure: 100_000_000,
      landDirectExpenses: 60_000_000,
      buildingDirectExpenses: 40_000_000,
    });
    expect(land(r).expenses).toBe(60_000_000);
    expect(building(r).expenses).toBe(40_000_000);
  });

  /**
   * 🔑 **한쪽만 직접 귀속 + 자산 단위 자본적지출** — validate V-5b와 엔진 조건이 갈릴 수 있는 지점.
   *
   * `acquisition-cost-review`(2026-08-07)가 「두 조건이 일치하는지 anchor로 명시 확인되지
   * 않았다」고 지적한 케이스다. 반대쪽 파트는 안분분을 쓰므로 **취득 축 안분이 살아 있다**
   * ⇒ 양쪽 모두 취득시 기준시가를 **요구**해야 한다.
   *
   * validate: `needsAcqAxis = … || (capitalExpenditure > 0 && !hasBothPartCapex)` — 요구함
   * 엔진: `apportionExpenses()`를 부르므로 `requireAcqStd("자본적지출")` 발동 — 요구함
   */
  it("🔑 한쪽만 직접 귀속이면 반대쪽은 안분이 남는다 ⇒ 여전히 차단한다", () => {
    expect(() =>
      run({
        ...noAcqStd,
        actualAcquisitionPrice: 0,
        capitalExpenditure: 100_000_000,
        landDirectExpenses: 60_000_000, // 건물은 안분분을 쓴다
      }),
    ).toThrow(/취득시 토지 공시지가·건물 기준시가가 필요/);
  });

  it("같은 조합에 취득시 기준시가가 있으면 정상 계산된다 (거짓 차단 아님)", () => {
    const r = run({ capitalExpenditure: 100_000_000, landDirectExpenses: 60_000_000 });
    expect(land(r).expenses).toBe(60_000_000);
    // 건물은 취득시 비율(0.50) 안분분 = 100,000,000 − floor(100,000,000 × 0.50) = 50,000,000
    expect(building(r).expenses).toBe(50_000_000);
  });
});
