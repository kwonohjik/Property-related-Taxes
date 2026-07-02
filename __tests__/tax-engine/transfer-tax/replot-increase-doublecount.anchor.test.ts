/**
 * 증환지 증가분 면적 이중계상 — 세액영향 회귀 앵커 (PR#473 Phase B)
 *
 * 증환지(교부>권리)에서 당초분 양도면적은 **권리면적(Case B)** 이어야 한다.
 * 수정 전에는 교부면적(429)이 transferArea에 들어가 증가분(32.2)과 합산 시 이중계상(Case A)됐다.
 *   - Case A (이중계상): 당초분 standardPriceAtTransfer = perSqm × 교부(429)
 *   - Case B (올바름  ): 당초분 standardPriceAtTransfer = perSqm × 권리(396.8)  ← PR#473 이후 UI 동작
 *
 * 세액영향(docs/00-pm/transfer-replot-increase-autofill.plan.md §6):
 *   - 실지 모드: 취득가 fixed → 총차익 보존 → 동일세율군 0원, 세율군 상이 −0.18%(경미)
 *   - 환산 모드: 환산취득가 = 양도가액 × 취득기준시가 / (perSqm×transferArea) → transferArea 왜곡이
 *     환산취득가를 축소 → 차익 과대 → +3%대 과대(납세자 불리). 동일세율군에서도 발생.
 *
 * 본 앵커는 올바른 모델(Case B) 세액을 고정하고, 이중계상(Case A) 대비 차이를 박제한다.
 * Case A/B가 같아지면(실지 장기) 또는 차이가 사라지면(회귀) 실패한다.
 */
import { describe, it, expect } from "vitest";
import { apportionBundledSale } from "@/lib/tax-engine/bundled-sale-apportionment";
import {
  calculateTransferTaxAggregate,
  type AggregateTransferInput,
  type TransferTaxItemInput,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const mockRates = makeMockRates();
const PER_SQM_T = 1_000_000; // 양도시 ㎡당 공시지가
const PER_SQM_ACQ = 300_000; // 취득시 ㎡당 공시지가 (환산 분자)
const TOTAL_SALE = 1_000_000_000;
const RIGHT_AREA = 396.8; // 권리면적 (당초분 취득·양도 면적)
const ALLOC_AREA = 429; // 교부면적 (전체)
const INCREASE = 32.2; // 429 − 396.8
const STD_ACQ_ORIG = Math.round(PER_SQM_ACQ * RIGHT_AREA); // 119,040,000 (취득면적=권리, 양쪽 동일)
const ACQ_ORIG_ACTUAL = 300_000_000; // 당초분 실지 취득가
const ACQ_INCR = 40_000_000; // 증가분 청산금

const DATE_LONG = new Date("2023-05-01"); // 증가분도 장기 (둘 다 일반누진)
const DATE_SHORT = new Date("2008-06-01"); // 증가분 단기 (세율군 상이)

function makeItem(
  id: string,
  overrides: Partial<TransferTaxItemInput>,
): TransferTaxItemInput {
  return {
    ...(baseTransferInput() as unknown as TransferTaxItemInput),
    propertyId: id,
    propertyLabel: id,
    propertyType: "land",
    isOneHousehold: false,
    householdHousingCount: 0,
    ...overrides,
  };
}

/** 안분: 당초분 standardPriceAtTransfer(origStd) 비율로 총양도가 배분 → 자산별 양도가액. */
function alloc(caseA: boolean) {
  const origStd = PER_SQM_T * (caseA ? ALLOC_AREA : RIGHT_AREA);
  const r = apportionBundledSale({
    totalSalePrice: TOTAL_SALE,
    assets: [
      { assetId: "orig", assetLabel: "당초분", assetKind: "land", standardPriceAtTransfer: origStd },
      { assetId: "incr", assetLabel: "증가분", assetKind: "land", standardPriceAtTransfer: Math.round(PER_SQM_T * INCREASE) },
    ],
  });
  return { orig: r.apportioned[0].allocatedSalePrice, incr: r.apportioned[1].allocatedSalePrice };
}

/** 실지 모드 총 산출세액 (당초분·증가분 모두 실지 취득가). */
function taxActual(transferDate: Date, caseA: boolean): number {
  const a = alloc(caseA);
  const input: AggregateTransferInput = {
    taxYear: transferDate.getFullYear(),
    annualBasicDeductionUsed: 0,
    properties: [
      makeItem("orig", { transferPrice: a.orig, acquisitionPrice: ACQ_ORIG_ACTUAL, acquisitionDate: new Date("2000-01-01"), transferDate }),
      makeItem("incr", { transferPrice: a.incr, acquisitionPrice: ACQ_INCR, acquisitionDate: new Date("2007-04-27"), transferDate }),
    ],
  };
  return calculateTransferTaxAggregate(input, mockRates).calculatedTax;
}

/** 환산 모드 총 산출세액 (당초분 환산, 증가분 청산금 실지). */
function taxEstimated(transferDate: Date, caseA: boolean): number {
  const a = alloc(caseA);
  const origTransferArea = caseA ? ALLOC_AREA : RIGHT_AREA;
  const input: AggregateTransferInput = {
    taxYear: transferDate.getFullYear(),
    annualBasicDeductionUsed: 0,
    properties: [
      makeItem("orig", {
        useEstimatedAcquisition: true, // 환산 진입조건 (transfer-tax-helpers.ts:301) — acquisitionMethod 아님
        transferPrice: a.orig,
        standardPriceAtAcquisition: STD_ACQ_ORIG,
        standardPriceAtTransfer: Math.round(PER_SQM_T * origTransferArea),
        acquisitionArea: RIGHT_AREA,
        transferArea: origTransferArea,
        acquisitionDate: new Date("2000-01-01"),
        transferDate,
      }),
      makeItem("incr", { transferPrice: a.incr, acquisitionPrice: ACQ_INCR, acquisitionDate: new Date("2007-04-27"), transferDate }),
    ],
  };
  return calculateTransferTaxAggregate(input, mockRates).calculatedTax;
}

describe("증환지 이중계상 세액영향 회귀 (PR#473)", () => {
  it("안분 양도가액: 당초분 429(A) vs 396.8(B) 배분비 왜곡", () => {
    expect(alloc(true)).toEqual({ orig: 930_182_134, incr: 69_817_866 });
    expect(alloc(false)).toEqual({ orig: 924_941_725, incr: 75_058_275 });
  });

  it("실지 모드·증가분 장기: 총차익 보존 → 이중계상 무영향 (A=B)", () => {
    const a = taxActual(DATE_LONG, true);
    const b = taxActual(DATE_LONG, false);
    expect(a).toBe(157_860_000);
    expect(b).toBe(157_860_000);
    expect(a - b).toBe(0);
  });

  it("실지 모드·증가분 단기: 세율군 상이 → 경미(−0.18%, 이중계상이 오히려 과소)", () => {
    const a = taxActual(DATE_SHORT, true);
    const b = taxActual(DATE_SHORT, false);
    expect(a).toBe(197_861_760);
    expect(b).toBe(198_213_916);
    expect(a - b).toBe(-352_156);
  });

  it("환산 모드·증가분 장기: 이중계상 시 +3.33% 과대 (A>B, B가 올바름)", () => {
    const a = taxEstimated(DATE_LONG, true);
    const b = taxEstimated(DATE_LONG, false);
    expect(a).toBe(168_589_466); // 수정 전(이중계상) — 과대
    expect(b).toBe(163_164_959); // PR#473 이후(올바름) — 정답
    expect(a - b).toBe(5_424_507);
  });

  it("환산 모드·증가분 단기: 이중계상 시 +3.16% 과대 (A>B)", () => {
    const a = taxEstimated(DATE_SHORT, true);
    const b = taxEstimated(DATE_SHORT, false);
    expect(a).toBe(211_380_887); // 수정 전(이중계상) — 과대
    expect(b).toBe(204_898_164); // PR#473 이후(올바름) — 정답
    expect(a - b).toBe(6_482_723);
  });
});
