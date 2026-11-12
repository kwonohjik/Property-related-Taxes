/**
 * anchor — 다건(`calculateTransferTaxAggregate`) 경로의 §133① 가목/나목: §77 저율분 지배 양도 (계획서 §9, Q-7 b)
 *
 * 결함(#3255가 만든 회귀): 2015 이전 공유 그룹을 연 2억으로 올리면서 §77 저율분이 지배하는 다건 양도가 2억으로 나왔다.
 * 법문(§133①1호 가목 1억 vs 나목 2억 중 큰 금액 제외)은 1억이다. 실측(구현 전): 2014·2015 §77 1건·2건 = 200,000,000.
 * 본 파일은 `limit-group-77-low-rate-subcap.anchor.test.ts`(단위)를 다건 경로에서 다시 고정한다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const rates = makeMockRates();
const D = (s: string) => new Date(s);
const E = (n: number) => n * 100_000_000;

const card = (id: string, date: string, reductions: unknown[]) => ({
  ...baseTransferInput({
    propertyType: "land",
    isOneHousehold: false,
    householdHousingCount: 0,
    transferPrice: 5_000_000_000,
    acquisitionPrice: 100_000_000,
    acquisitionDate: D("1995-01-01"),
    transferDate: D(date),
    residencePeriodMonths: 0,
    reductions,
  } as never),
  propertyId: id,
  propertyLabel: id,
});
const e77 = (date: string, over: Record<string, unknown> = {}) => ({
  type: "public_expropriation",
  cashCompensation: 5_000_000_000,
  bondCompensation: 0,
  businessApprovalDate: D(date.slice(0, 4) + "-01-02"),
  ...over,
});
const sf = { type: "self_farming", farmingYears: 12 };

const run = (
  year: number,
  date: string,
  kinds: ("e" | "s")[],
  extra: { prior?: { year: number; type: string; amount: number }[]; e77Over?: Record<string, unknown> } = {},
) => {
  const props = kinds.map((k, i) => card("P" + i, date, [k === "e" ? e77(date, extra.e77Over) : sf]));
  return calculateTransferTaxAggregate(
    { taxYear: year, annualBasicDeductionUsed: 0, properties: props, priorReductionUsage: extra.prior } as never,
    rates,
  ) as unknown as { reductionAmount: number };
};

describe("AS-1 연 — 2014·2015 (가목 §77 15·20%)", () => {
  for (const [y, d] of [[2014, "2014-06-01"], [2015, "2015-06-01"]] as const) {
    it(`AS-1 ${y} §77 1건 → 1억 (구현 전 2억)`, () => expect(run(y, d, ["e"]).reductionAmount).toBe(E(1)));
    it(`AS-1b ${y} §77 2건 → 1억`, () => expect(run(y, d, ["e", "e"]).reductionAmount).toBe(E(1)));
    it(`AS-1c ${y} §77 1건 + 자경 1건 → 2억 (나목이 큰 금액 — 구현 전후 동일)`, () => expect(run(y, d, ["e", "s"]).reductionAmount).toBe(E(2)));
    it(`AS-1d ${y} 자경 2건 → 2억`, () => expect(run(y, d, ["s", "s"]).reductionAmount).toBe(E(2)));
  }
  it("AS-1e 2012 (가목 §77 20·25%) §77 2건 → 1억", () => expect(run(2012, "2012-06-01", ["e", "e"]).reductionAmount).toBe(E(1)));
});

describe("AS-2 연 — 하위 한도 없는 해는 그대로", () => {
  for (const [y, d] of [[2016, "2016-06-01"], [2018, "2018-06-01"]] as const) {
    it(`AS-2 ${y} §77 2건 → 1억`, () => expect(run(y, d, ["e", "e"]).reductionAmount).toBe(E(1)));
    it(`AS-2b ${y} §77+자경 → 1억`, () => expect(run(y, d, ["e", "s"]).reductionAmount).toBe(E(1)));
  }
});

describe("AS-3 고율분(채권 5년 보유 특약 40%)은 가목이 아니다 → 하위 한도 없이 나목 2억", () => {
  it("AS-3 2014 §77 채권 5년 보유 → 2억", () => {
    const r = run(2014, "2014-06-01", ["e"], { e77Over: { cashCompensation: 0, bondCompensation: 5_000_000_000, bondHoldingYears: 5 } });
    expect(r.reductionAmount).toBe(E(2));
  });
});

describe("AS-4 5개 과세기간 — 나목(§77 저율분 2억)", () => {
  it("AS-4 2014 과거 §77 1.5억 + 당해 §77 (연 1억) → 0.5억", () => {
    const r = run(2014, "2014-06-01", ["e"], { prior: [{ year: 2012, type: "public_expropriation", amount: E(1.5) }] });
    expect(r.reductionAmount).toBe(E(0.5));
  });
  it("AS-4b 2014 과거 자경 2.5억 + 당해 §77 → 0.5억 (다목 3억)", () => {
    const r = run(2014, "2014-06-01", ["e"], { prior: [{ year: 2012, type: "self_farming", amount: E(2.5) }] });
    expect(r.reductionAmount).toBe(E(0.5));
  });
});

describe("AS-5 2009-03-16~2010 — 연 가목 §77 (V-15 해소, 시행본 직접 대조)", () => {
  for (const [y, d] of [[2009, "2009-06-01"], [2010, "2010-06-01"]] as const) {
    it(`AS-5 ${y} §77 1건·2건 → 1억 (종전 2억)`, () => {
      expect(run(y, d, ["e"]).reductionAmount).toBe(E(1));
      expect(run(y, d, ["e", "e"]).reductionAmount).toBe(E(1));
    });
    it(`AS-5b ${y} §77 + 자경 → 2억 / 자경 2건 → 2억`, () => {
      expect(run(y, d, ["e", "s"]).reductionAmount).toBe(E(2));
      expect(run(y, d, ["s", "s"]).reductionAmount).toBe(E(2));
    });
  }
  it("AS-5c 2010 고율분(채권 5년 보유)은 가목이 아니다 → 2억 / 2009는 감면율 한정이 없어 1억", () => {
    const over = { cashCompensation: 0, bondCompensation: 5_000_000_000, bondHoldingYears: 5 };
    expect(run(2010, "2010-06-01", ["e"], { e77Over: over }).reductionAmount).toBe(E(2));
    expect(run(2009, "2009-06-01", ["e"], { e77Over: over }).reductionAmount).toBe(E(1));
  });
});
