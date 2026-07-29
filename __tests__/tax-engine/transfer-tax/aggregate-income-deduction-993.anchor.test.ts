/**
 * anchor: 다건(집계) 모드 income-deduction 감면(§99의3 등) 반영.
 * 계획서: docs/02-design/features/aggregate-income-deduction-993.plan.md
 *
 * 버그: 집계 `income = taxableGain - lthd`(:153)가 §99의3 소득금액차감을 무시 →
 *   과다과세(단건 37,934,000 vs 집계 77,150,000) + 농특세 미산정 + 소득금액 감면대상 0.
 * 수정: incomeAfterOffset(pre)는 보존, 세액용 taxableAfterReduction 분리 + 농특세 2-pass.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

const R993 = {
  type: "new_99_3" as const,
  contractDate993: "2002-01-01",
  standardPriceAtAcquisition993: 100_000_000,
  standardPriceAt5Years: 160_000_000,
  standardPriceAtTransfer993: 250_000_000,
  region993: "outside_speculation" as const,
  acquisitionType993: "from_builder" as const,
};

/** §99의3 5년후 자산 (단건 anchor: taxBase 152,300,000·reducible 103,200,000). */
const house993 = (id = "p993") =>
  ({
    ...baseTransferInput({
      transferPrice: 800_000_000,
      acquisitionPrice: 500_000_000,
      acquisitionDate: new Date("2015-07-01"),
      transferDate: new Date("2022-08-01"),
      householdHousingCount: 2,
      reductions: [R993],
    }),
    propertyId: id,
    propertyLabel: id,
  });

const plain = (id: string, over: Record<string, unknown>) =>
  ({ ...baseTransferInput({ householdHousingCount: 2, ...over }), propertyId: id, propertyLabel: id });

describe("다건 §99의3 소득금액차감 — 계산·표시·농특세", () => {
  it("1자산 parity: 단건 == 다건(1자산) — determinedTax·taxBase·localIncomeTax·ruralSurtax 완전 일치", () => {
    const rates = makeMockRates();
    const single = calculateTransferTax(house993() as never, rates);
    const agg = calculateTransferTaxAggregate(
      { taxYear: 2022, annualBasicDeductionUsed: 0, properties: [house993() as never] },
      rates,
    );
    expect(agg.determinedTax).toBe(single.determinedTax); // 37,934,000 (기존 버그: 77,150,000)
    expect(agg.taxBase).toBe(single.taxBase); // 152,300,000
    expect(agg.localIncomeTax).toBe(single.localIncomeTax);
    expect(agg.ruralSurtax).toBe(single.new993Detail?.ruralSurtax); // 7,843,200
    expect(agg.ruralSurtax).toBeGreaterThan(0);
    // PerPropertyBreakdown: 양도소득금액(pre) 보존 + 감면대상 echo + taxBaseShare(감면후)
    const p = agg.properties[0];
    expect(p.incomeAfterOffset).toBe(258_000_000); // 양도소득금액 표시 기준(pre)
    expect(p.incomeDeductionReducible).toBe(single.new993Detail?.reducibleTransferIncome); // 103,200,000
    expect(p.taxBaseShare).toBe(single.taxBase); // 152,300,000 (감면후 − 기본공제)
  });

  it("다자산: §99의3 자산 감면 반영, 일반 자산 무영향", () => {
    const rates = makeMockRates();
    const normal = plain("pn", {
      transferPrice: 600_000_000,
      acquisitionPrice: 400_000_000,
      acquisitionDate: new Date("2016-01-01"),
      transferDate: new Date("2022-06-01"),
    });
    const agg = calculateTransferTaxAggregate(
      { taxYear: 2022, annualBasicDeductionUsed: 0, properties: [house993() as never, normal as never] },
      rates,
    );
    const p993 = agg.properties[0];
    const pNormal = agg.properties[1];
    // §99의3 자산: 감면대상 = reducible, taxBaseShare가 그만큼 축소(감면후)
    expect(p993.incomeDeductionReducible).toBeGreaterThan(0);
    expect(p993.taxBaseShare).toBe(
      Math.max(0, p993.incomeAfterOffset - (p993.incomeDeductionReducible ?? 0) - p993.allocatedBasicDeduction),
    );
    // 일반 자산: 감면대상 0
    expect(pNormal.incomeDeductionReducible ?? 0).toBe(0);
    expect(agg.ruralSurtax).toBeGreaterThan(0);
  });

  it("회귀: income-deduction 없는 다건 → ruralSurtax 0·감면대상 0", () => {
    const rates = makeMockRates();
    const a = plain("pa", {
      transferPrice: 600_000_000, acquisitionPrice: 400_000_000,
      acquisitionDate: new Date("2016-01-01"), transferDate: new Date("2022-06-01"),
    });
    const b = plain("pb", {
      transferPrice: 500_000_000, acquisitionPrice: 300_000_000,
      acquisitionDate: new Date("2017-03-01"), transferDate: new Date("2022-09-01"),
    });
    const agg = calculateTransferTaxAggregate(
      { taxYear: 2022, annualBasicDeductionUsed: 0, properties: [a as never, b as never] },
      rates,
    );
    expect(agg.ruralSurtax).toBe(0);
    expect(agg.properties.every((p) => (p.incomeDeductionReducible ?? 0) === 0)).toBe(true);
  });
});

/** 차손 자산: 양도가 400M, 취득가 400M+loss → 양도차손 = loss (progressive 군, §99의3와 같은 세율군). */
const lossAsset = (id: string, loss: number) =>
  ({
    ...baseTransferInput({
      transferPrice: 400_000_000,
      acquisitionPrice: 400_000_000 + loss,
      acquisitionDate: new Date("2016-01-01"),
      transferDate: new Date("2022-06-01"),
      householdHousingCount: 2,
    }),
    propertyId: id,
    propertyLabel: id,
  });

describe("시행령 §167의2② — §99의3 자산이 양도차손 통산받을 때 감면소득금액 안분", () => {
  it("차손 50M(같은군) → 감면소득금액 축소 103.2M→83.2M, 과세표준 122,300,000 (안분 前 102.3M 과소과세 정정)", () => {
    const rates = makeMockRates();
    const agg = calculateTransferTaxAggregate(
      { taxYear: 2022, annualBasicDeductionUsed: 0, properties: [house993("a") as never, lossAsset("b", 50_000_000) as never] },
      rates,
    );
    const p = agg.properties[0];
    // §167의2②: 차손 50M × (감면 103.2M / 양도소득금액 258M) = 20M을 감면분이 흡수 → 조정 감면 83.2M
    expect(p.incomeDeductionReducible).toBe(83_200_000);
    expect(p.incomeAfterOffset).toBe(208_000_000); // 258 − 50 (양도소득금액 표시 기준, 감면前)
    expect(agg.taxBase).toBe(122_300_000); // (208 − 83.2) − 2.5(기본공제)
    expect(agg.ruralSurtax).toBeGreaterThan(0);
  });

  it("차손 200M(같은군) → 조정 감면 23.2M, 과세표준 32,300,000 (안분 前 0 과소과세 정정)", () => {
    const rates = makeMockRates();
    const agg = calculateTransferTaxAggregate(
      { taxYear: 2022, annualBasicDeductionUsed: 0, properties: [house993("a") as never, lossAsset("b", 200_000_000) as never] },
      rates,
    );
    const p = agg.properties[0];
    // 차손 200M × (103.2/258) = 80M 감면분 흡수 → 조정 감면 103.2 − 80 = 23.2M
    expect(p.incomeDeductionReducible).toBe(23_200_000);
    expect(agg.taxBase).toBe(32_300_000); // (58 − 23.2) − 2.5
  });
});
