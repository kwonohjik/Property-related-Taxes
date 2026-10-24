/**
 * anchor: 집계 **외부 비교 단위** — route가 A/B 카드를 미리 만든 §97의2②3호 단위 (PR-0 · 사용처 0)
 *
 * 계획서: `docs/00-pm/gb-bg-carryover-share-bundled.plan.md` §4.2
 *
 * 일반건물 부담부증여는 A/B가 §159 안분 단계(카드 조립 전)에서 갈려 카드에 `carryoverTaxation`이 없다.
 * 그래서 집계가 그 단위의 카드 구간을 갈아 끼워 비교한다. 이 anchor는 그 방식이 **단건 엔진 단위와
 * 같은 순차 고정점**이라는 것을 못으로 박는다 — 같은 사실을 A/B 카드로 손수 만든 외부 단위와 단건
 * 엔진 단위(`carryoverTaxation`)는 신고 결정세액·채택·비교 두 값이 같아야 한다.
 */
import { describe, it, expect } from "vitest";
import {
  calculateTransferTaxAggregate,
  calculateTransferTaxAggregateWithUnits,
  type AggregateTransferInput,
  type ExternalCarryoverUnit,
  type TransferTaxItemInput,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const mockRates = makeMockRates();
const D = (s: string) => new Date(s);

/** 증여자 취득일 — 양도일까지 16년(장기) */
const DONOR_ACQ = D("2010-01-01");
/** 증여 등기접수일 — 양도일까지 9개월(단기) */
const GIFT_REG = D("2025-09-01");
const TRANSFER_DATE = D("2026-06-01");

function land(id: string, o: Partial<TransferTaxItemInput> = {}): TransferTaxItemInput {
  return {
    ...(baseTransferInput() as unknown as TransferTaxItemInput),
    propertyId: id,
    propertyLabel: id,
    propertyType: "land",
    transferDate: TRANSFER_DATE,
    acquisitionDate: GIFT_REG,
    acquisitionPrice: 0,
    transferPrice: 1_000_000_000,
    expenses: 0,
    isOneHousehold: false,
    householdHousingCount: 0,
    isRegulatedArea: false,
    isNonBusinessLand: false,
    ...o,
  };
}

/** 단건 엔진 단위 — 카드에 `carryoverTaxation`을 싣고 단건 엔진이 A/B를 만든다. */
const internal = (id: string, donorAcquisitionPrice: number, giftDateValuation: number) =>
  land(id, {
    acquisitionCause: "carryover_gift",
    carryoverTaxation: {
      giftRegistryDate: GIFT_REG,
      donorAcquisitionDate: DONOR_ACQ,
      donorAcquisitionPrice,
      useEstimatedAcquisition: false,
      giftTaxAmount: 0,
      giftDateValuation,
    },
  });
/** 같은 사실의 A(증여자 취득일·취득가액) 카드와 B(증여일·증여일 평가액) 카드. */
const cardA = (id: string, donorAcquisitionPrice: number) => land(id, { acquisitionDate: DONOR_ACQ, acquisitionPrice: donorAcquisitionPrice });
const cardB = (id: string, giftDateValuation: number) => land(id, { acquisitionDate: GIFT_REG, acquisitionPrice: giftDateValuation });

const LONG_GAIN = land("c1", { acquisitionDate: D("2012-03-01"), acquisitionPrice: 500_000_000 });

const inputOf = (properties: TransferTaxItemInput[]): AggregateTransferInput =>
  ({ taxYear: 2026, annualBasicDeductionUsed: 0, properties }) as AggregateTransferInput;
const withUnits = (properties: TransferTaxItemInput[], units: ExternalCarryoverUnit[]) =>
  calculateTransferTaxAggregateWithUnits(inputOf(properties), mockRates, undefined, units);
const internalRun = (properties: TransferTaxItemInput[]) => calculateTransferTaxAggregate(inputOf(properties), mockRates);
const detailOf = (r: ReturnType<typeof internalRun>, id: string) => r.properties.find((p) => p.propertyId === id)!.carryoverTaxationDetail!;

describe("외부 단위 = 단건 엔진 단위 (같은 사실 · 같은 순차 고정점)", () => {
  it("X-1 자산 1건 — 단건 A < B ⇒ B · 248,750,000(N1-05와 같다)", () => {
    const ref = internalRun([internal("u", 100_000_000, 500_000_000)]);
    const { result, units } = withUnits([cardB("u", 500_000_000)], [{ key: "u", start: 0, cardsA: [cardA("u", 100_000_000)] }]);
    expect(detailOf(ref, "u").adoptedScenario).toBe("B");
    expect(ref.determinedTax).toBe(248_750_000);
    expect(units.u.adoptedScenario).toBe("B");
    expect(result.determinedTax).toBe(ref.determinedTax);
    expect(units.u.filingUnitComparison).toEqual(detailOf(ref, "u").filingUnitComparison);
  });

  it("X-2 장기이익 컴패니언 — 신고 전체로 A가 크다 ⇒ A · 378,810,000 / 미적용 366,810,000(N1-01·N1-04와 같다)", () => {
    const { result, units } = withUnits(
      [cardB("u", 500_000_000), LONG_GAIN],
      [{ key: "u", start: 0, cardsA: [cardA("u", 100_000_000)] }],
    );
    expect(units.u.adoptedScenario).toBe("A");
    expect(result.determinedTax).toBe(378_810_000);
    expect(units.u.filingUnitComparison).toEqual({ determinedTaxWithCarryover: 378_810_000, determinedTaxWithout: 366_810_000 });
    // 반사실 = 최종 배정에서 이 단위만 B
    expect(units.u.counterfactual.determinedTax).toBe(366_810_000);
    expect(result.properties[0].acquisitionPrice).toBe(100_000_000);
    expect(units.u.counterfactual.properties[0].acquisitionPrice).toBe(500_000_000);
  });

  it("X-3 두 단위 섞기 — 어느 쪽을 외부 단위로 바꿔도 채택·결정세액이 같다(단위 순서 = 카드 순서)", () => {
    const all = internalRun([internal("u1", 100_000_000, 500_000_000), internal("u2", 700_000_000, 900_000_000), LONG_GAIN]);
    const ext1 = withUnits(
      [cardB("u1", 500_000_000), internal("u2", 700_000_000, 900_000_000), LONG_GAIN],
      [{ key: "u1", start: 0, cardsA: [cardA("u1", 100_000_000)] }],
    );
    const ext2 = withUnits(
      [internal("u1", 100_000_000, 500_000_000), cardB("u2", 900_000_000), LONG_GAIN],
      [{ key: "u2", start: 1, cardsA: [cardA("u2", 700_000_000)] }],
    );
    const both = withUnits(
      [cardB("u1", 500_000_000), cardB("u2", 900_000_000), LONG_GAIN],
      [
        { key: "u2", start: 1, cardsA: [cardA("u2", 700_000_000)] },
        { key: "u1", start: 0, cardsA: [cardA("u1", 100_000_000)] },
      ],
    );
    const a1 = detailOf(all, "u1").adoptedScenario;
    const a2 = detailOf(all, "u2").adoptedScenario;
    for (const r of [ext1.result, ext2.result, both.result]) expect(r.determinedTax).toBe(all.determinedTax);
    expect(ext1.units.u1.adoptedScenario).toBe(a1);
    expect(detailOf(ext1.result, "u2").adoptedScenario).toBe(a2);
    expect(detailOf(ext2.result, "u1").adoptedScenario).toBe(a1);
    expect(ext2.units.u2.adoptedScenario).toBe(a2);
    expect([both.units.u1.adoptedScenario, both.units.u2.adoptedScenario]).toEqual([a1, a2]);
    expect(both.units.u1.filingUnitComparison).toEqual(detailOf(all, "u1").filingUnitComparison);
    expect(both.units.u2.filingUnitComparison).toEqual(detailOf(all, "u2").filingUnitComparison);
  });
});

describe("카드 여러 장 단위 · 단위 밖 카드 불변", () => {
  it("X-4 둘째 위치의 2장 단위 — 최종 결과 = A 카드를 직접 넣은 집계, 반사실 = B 카드 집계", () => {
    const halfB = [cardB("u-L", 250_000_000), cardB("u-B", 250_000_000)].map((c) => ({ ...c, transferPrice: 500_000_000 }));
    const halfA = [cardA("u-L", 50_000_000), cardA("u-B", 50_000_000)].map((c) => ({ ...c, transferPrice: 500_000_000 }));
    const { result, units } = withUnits([LONG_GAIN, ...halfB], [{ key: "u", start: 1, cardsA: halfA }]);
    const plainA = internalRun([LONG_GAIN, ...halfA]);
    const plainB = internalRun([LONG_GAIN, ...halfB]);
    const adoptedRun = units.u.adoptedScenario === "A" ? plainA : plainB;
    const otherRun = units.u.adoptedScenario === "A" ? plainB : plainA;
    expect(result.determinedTax).toBe(adoptedRun.determinedTax);
    expect(units.u.counterfactual.determinedTax).toBe(otherRun.determinedTax);
    expect(units.u.filingUnitComparison).toEqual({
      determinedTaxWithCarryover: plainA.determinedTax,
      determinedTaxWithout: plainB.determinedTax,
    });
    // ②3호 「적은 경우」만 B — 동률은 A
    expect(units.u.adoptedScenario).toBe(plainA.determinedTax < plainB.determinedTax ? "B" : "A");
    expect(result.properties.map((p) => p.propertyId)).toEqual(["c1", "u-L", "u-B"]);
    expect(result.properties[0].transferGain).toBe(plainB.properties[0].transferGain);
  });

  it("X-5 외부 단위가 없으면 종전 진입점과 같다", () => {
    const props = [internal("u", 100_000_000, 500_000_000), LONG_GAIN];
    const { result, units } = withUnits(props, []);
    expect(units).toEqual({});
    expect(result).toEqual(internalRun(props));
  });

  it.each<[string, ExternalCarryoverUnit[]]>([
    ["빈 A 카드", [{ key: "u", start: 0, cardsA: [] }]],
    ["범위 밖", [{ key: "u", start: 1, cardsA: [cardA("u", 1), cardA("v", 1)] }]],
    ["겹침", [{ key: "u", start: 0, cardsA: [cardA("u", 1), cardA("v", 1)] }, { key: "v", start: 1, cardsA: [cardA("v", 1)] }]],
  ])("X-6 카드 구간이 잘못되면 계산하지 않는다 — %s", (_n, units) => {
    expect(() => withUnits([cardB("u", 1), LONG_GAIN], units)).toThrow(/카드 구간/);
  });
});
