/**
 * anchor: 다건 신고의 토지·건물 분리취득(split) 자산 — 기본공제 배분 단위를 파트로(F-B) · 전체 누진 경로의 C를 파트 귀속으로(F-A).
 * 계획서: docs/02-design/features/transfer-split-basic-deduction-units-and-order-rounding.plan.md §1~§4
 *
 * 기대값은 **분리 신고**(토지 자산 + 건물 자산 2건)의 값이다. 세 사례 모두 수정 전 split이 분리 신고보다 높았다.
 *   U-1 ①-a 파트 사이에 다른 자산을 끼울 수 없었다     6,118,416 → 5,993,222
 *   U-2 ①-b 전체 누진 경로 C가 자산 단위 식이었다       323,176,261 → 323,091,083 (감면 42,305,265 → 42,399,907)
 *   U-3 ①-c M-4가 split 자산의 감면 외 소득을 0으로 봤다  72,268,469 → 71,906,896
 * U-2·U-3은 감면 파트가 차손을 받는다 — 영 §167의2②로 B가 그만큼 줄어 값이 다시 바뀌었다(분리 신고도 같이):
 *   U-2 323,091,083 → 333,312,489 (감면 42,399,907 → 31,042,789) · U-3 71,906,896 → 75,081,645
 *   (계획서 `transfer-90-1-reducible-income-after-loss-offset.plan.md`)
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTaxAggregate, type TransferTaxItemInput } from "@/lib/tax-engine/transfer-tax-aggregate";
import { calculateTransferTax, parseRatesFromMap, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { computeSplitPartTax, type SplitPartRateContext } from "@/lib/tax-engine/transfer-tax-split-rate";
import { splitPartBasicUnits } from "@/lib/tax-engine/transfer-tax-split-part-seeds";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

const rates = makeMockRates();
const D = (s: string) => new Date(s);
const T = "2023-03-20";
const E77 = (cash: number) => ({ type: "public_expropriation", cashCompensation: cash, bondCompensation: 0, businessApprovalDate: D("2013-01-01") });

const item = (id: string, o: Record<string, unknown>): TransferTaxItemInput =>
  ({
    ...(baseTransferInput() as unknown as TransferTaxItemInput),
    propertyId: id,
    propertyLabel: id,
    transferDate: D(T),
    isOneHousehold: false,
    expenses: 0,
    annualBasicDeductionUsed: 0,
    ...o,
  }) as TransferTaxItemInput;

/** 비주택 split — 토지·건물 취득일이 다르다. `reduced`면 §77 현금보상(전체 양도가). */
function split(o: { landAcqDate: string; landSale: number; bldSale: number; reduced?: boolean }) {
  const landAcq = 200_000_000;
  const bldAcq = 300_000_000;
  const common = { expenses: 0, annualBasicDeductionUsed: 0 };
  const P = item("P", {
    propertyType: "building",
    transferPrice: o.landSale + o.bldSale,
    acquisitionPrice: landAcq + bldAcq,
    acquisitionDate: D("2008-03-20"),
    landAcquisitionDate: D(o.landAcqDate),
    householdHousingCount: 1,
    isSeparateAcquisition: true,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landTransferPrice: o.landSale,
    buildingTransferPrice: o.bldSale,
    landStandardPriceAtTransfer: o.landSale,
    buildingStandardPriceAtTransfer: o.bldSale,
    landAcquisitionPrice: landAcq,
    buildingAcquisitionPrice: bldAcq,
    ...(o.reduced ? { reductions: [E77(o.landSale + o.bldSale)] } : {}),
    ...common,
  });
  const L = item("L", {
    propertyType: "land",
    transferPrice: o.landSale,
    acquisitionPrice: landAcq,
    acquisitionDate: D(o.landAcqDate),
    householdHousingCount: 0,
    isNonBusinessLand: false,
    ...(o.reduced ? { reductions: [E77(o.landSale)] } : {}),
  });
  const B = item("B", {
    propertyType: "building",
    transferPrice: o.bldSale,
    acquisitionPrice: bldAcq,
    acquisitionDate: D("2008-03-20"),
    householdHousingCount: 1,
    ...(o.reduced ? { reductions: [E77(o.bldSale)] } : {}),
  });
  return { P, L, B };
}

const lossLand1500 = item("Q", {
  propertyType: "land",
  transferPrice: 500_000_000,
  acquisitionPrice: 2_000_000_000,
  acquisitionDate: D("2021-09-20"),
  householdHousingCount: 0,
  isNonBusinessLand: false,
});
const lossHouse300 = item("Q", {
  propertyType: "housing",
  transferPrice: 1_700_000_000,
  acquisitionPrice: 2_000_000_000,
  acquisitionDate: D("2017-02-20"),
  householdHousingCount: 2,
});
const land = (id: string, price: number, nbl: boolean) =>
  item(id, {
    propertyType: "land",
    transferPrice: price,
    acquisitionPrice: 300_000_000,
    acquisitionDate: D("2017-02-20"),
    householdHousingCount: 0,
    isNonBusinessLand: nbl,
  });

const run = (properties: TransferTaxItemInput[]) =>
  calculateTransferTaxAggregate({ taxYear: 2023, annualBasicDeductionUsed: 0, properties } as never, rates);
const basicOf = (r: ReturnType<typeof run>) =>
  Object.fromEntries(r.properties.map((p) => [p.propertyId, p.allocatedBasicDeduction]));

describe("split 기본공제 배분 단위 — 분리 신고와 같다", () => {
  it("U-1 (①-a): 토지 파트 → 다른 자산(R) 순서를 고른다 — 토지 8개월 + 건물 15년 · 차손 짝 · 비사업용 토지 R", () => {
    const { P, L, B } = split({ landAcqDate: "2022-07-20", landSale: 250_000_000, bldSale: 1_300_000_000 });
    const R = land("R", 1_200_000_000, true);
    const sep = run([L, B, lossLand1500, R]);
    expect(sep.totalTax).toBe(5_993_222);
    for (const order of [[P, lossLand1500, R], [R, lossLand1500, P]]) {
      const r = run(order);
      expect(r.totalTax).toBe(sep.totalTax);
      // 종전: P가 2,500,000을 통째로 받아 건물 파트까지 채웠다(6,118,416)
      expect(basicOf(r)).toMatchObject({ P: 1_361_868, R: 1_138_132 });
    }
  });

  it("U-2 (①-b): 전체 누진이 이겨도 C는 감면 파트(건물)가 받은 기본공제 — 토지(감면 제외)에 붙은 공제는 C가 아니다", () => {
    const { P, L, B } = split({ landAcqDate: "2021-09-20", landSale: 250_000_000, bldSale: 1_900_000_000, reduced: true });
    const sep = run([L, B, lossHouse300]);
    expect(sep.totalTax).toBe(333_312_489);
    expect(sep.reductionAmount).toBe(31_042_789);
    for (const order of [[P, lossHouse300], [lossHouse300, P]]) {
      const r = run(order);
      expect(r.comparedTaxApplied).toBe("general");
      expect(r.reductionAmount).toBe(31_042_789);
      expect(r.reductionBreakdown[0].basicDeductionApplied).toBe(0);
      expect(r.totalTax).toBe(sep.totalTax);
    }
  });

  it("U-3 (①-c): 감면 split의 감면 외 소득(토지 파트)이 같은 날 1단계 후보가 된다 — 공제가 R이 아니라 토지 파트로", () => {
    const { P, L, B } = split({ landAcqDate: "2022-07-20", landSale: 250_000_000, bldSale: 600_000_000, reduced: true });
    const R = land("R", 600_000_000, false);
    const sep = run([L, B, lossHouse300, R]);
    expect(sep.totalTax).toBe(75_081_645);
    for (const order of [[P, lossHouse300, R], [R, lossHouse300, P]]) {
      const r = run(order);
      expect(r.totalTax).toBe(sep.totalTax);
      expect(r.reductionAmount).toBe(sep.reductionAmount);
      // 종전: R 2,500,000 · P 0 (72,268,469)
      expect(basicOf(r)).toMatchObject({ P: 2_500_000, R: 0 });
    }
  });
});

describe("split 배분 단위 — §103② 1단계(감면 외 먼저)는 파트에도 지킨다", () => {
  it("U-4: 감면 파트(건물)는 감면 외 소득(토지 파트 · 다른 자산 R)이 다 흡수된 뒤에야 공제받는다 — 감면이 §133 한도에 걸려 세액이 같아도", () => {
    const { P, L, B } = split({ landAcqDate: "2022-07-20", landSale: 200_500_000, bldSale: 4_300_000_000, reduced: true });
    const R = item("R", {
      propertyType: "land",
      transferPrice: 310_000_000,
      acquisitionPrice: 300_000_000,
      acquisitionDate: D("2021-09-20"),
      householdHousingCount: 0,
      isNonBusinessLand: false,
    });
    const sep = run([L, B, R]);
    expect(basicOf(sep)).toMatchObject({ L: 500_000, B: 0, R: 2_000_000 });
    for (const order of [[P, R], [R, P]]) {
      const r = run(order);
      expect(r.reductionAmount).toBe(100_000_000); // 조특법 §133 연간 한도
      expect(r.totalTax).toBe(sep.totalTax);
      // 감면 파트를 1단계에 넣으면 세액은 같아도 P 2,500,000 · R 0이 된다(§103② 위반)
      expect(basicOf(r)).toMatchObject({ P: 500_000, R: 2_000_000 });
    }
  });
});

describe("split 파트 배분 주입(`partBasicDeduction`) — 세액 계산이 다건 배분을 그대로 쓴다", () => {
  const { P } = split({ landAcqDate: "2022-07-20", landSale: 250_000_000, bldSale: 1_300_000_000 });
  const single = calculateTransferTax(P as unknown as TransferTaxInput, rates);
  const income = single.taxBase + single.basicDeduction;
  const ctxOf = (basic: number, partBasicDeduction?: number[]): SplitPartRateContext => ({
    taxBase: income - basic,
    transferIncome: income,
    basicDeduction: basic,
    splitDetail: single.splitDetail,
    parsedRates: parseRatesFromMap(rates),
    taxRateInput: P as unknown as TransferTaxInput,
    aggregateFiling: true,
    ...(partBasicDeduction ? { partBasicDeduction } : {}),
  });

  it("I-1: 배분 단위의 파트 소득 합 = 자산 양도소득금액 · 파트 순서는 토지 → 건물", () => {
    const units = splitPartBasicUnits(ctxOf(0))!;
    expect(units.map((u) => u.kind)).toEqual(["land", "building"]);
    expect(units.reduce((s, u) => s + u.income, 0)).toBe(income);
  });

  it("I-2: 주입이 없으면 세율 높은 파트(토지 50%)부터, 주입하면 그 값 그대로(건물 먼저도 가능)", () => {
    const own = computeSplitPartTax(ctxOf(2_500_000))!;
    expect(own.parts.map((p) => p.allocatedBasicDeduction)).toEqual([2_500_000, 0]);
    const injected = computeSplitPartTax(ctxOf(2_500_000, [0, 2_500_000]))!;
    expect(injected.parts.map((p) => p.allocatedBasicDeduction)).toEqual([0, 2_500_000]);
  });
});
