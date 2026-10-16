/**
 * anchor: §104⑤2호 호 버킷은 **세율군(rateGroup)과 무관하게 신고 전체**에서 합산한다 (D1 해소).
 *
 * 계획서: docs/02-design/features/transfer-104-5-clause-bucket-return-wide.plan.md (A-3 · A-5 · A-8)
 *
 * [법령] 소득세법 §104⑤2호 「자산별 양도소득 산출세액 합계액」의 「자산」은 §104 **각 호별로 합산한 자산**이다
 *   (「기획재정부 재산세제과-536」 2018.6.19.). 본문 후단은 한 필지가 비사업용 토지와 그 외 토지로 나뉘면
 *   **각각을 별개의 자산**으로 본다. ⇒ 합산 경계는 호이고, 자산 단독 계산의 승자로 정하는 세율군은 경계가 아니다.
 *
 * [결함] 종전에는 세율군을 먼저 나누고 **그 안에서만** 호 버킷을 합산했다. 한 필지 중 일부만 비사업용인 토지는
 *   non_business_land 세율군에 들어가므로, 그 1호 파트가 progressive 세율군의 사업용 토지(1호)와 합산되지 않았다.
 *
 * 기대값은 엔진을 베끼지 않고 독립 산식(`prog`)으로 도출했다. 파트 과세표준은 엔진 echo를 입력으로 삼았다(주석에 값 명시).
 * 모의 세율표는 누진 8구간(소득세법 §55①, 2023년 이후 누진공제).
 */
import { describe, it, expect } from "vitest";
import {
  calculateTransferTaxAggregate,
  type AggregateTransferInput,
  type TransferTaxItemInput,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const rates = makeMockRates();
const D = (s: string) => new Date(s);

/** 소득세법 §55① 누진세율 (과세표준 → 산출세액). */
function prog(base: number): number {
  const t: [number, number, number][] = [
    [14_000_000, 0.06, 0], [50_000_000, 0.15, 1_260_000], [88_000_000, 0.24, 5_760_000], [150_000_000, 0.35, 15_440_000],
    [300_000_000, 0.38, 19_940_000], [500_000_000, 0.4, 25_940_000], [1_000_000_000, 0.42, 35_940_000], [Infinity, 0.45, 65_940_000],
  ];
  const [, r, d] = t.find(([ub]) => base <= ub)!;
  return Math.floor(base * r) - d;
}
/** §104①8호 비사업용 토지 — 기본세율 + 10%p. */
const nblTax = (base: number) => prog(base) + Math.floor(base * 0.1);

function item(id: string, T: string, o: Partial<TransferTaxItemInput>): TransferTaxItemInput {
  return {
    ...(baseTransferInput() as unknown as TransferTaxItemInput),
    propertyId: id,
    propertyLabel: id,
    transferDate: D(T),
    isOneHousehold: false,
    householdHousingCount: 0,
    isRegulatedArea: false,
    expenses: 0,
    ...o,
  };
}

function agg(taxYear: number, properties: TransferTaxItemInput[]) {
  const input: AggregateTransferInput = {
    taxYear,
    annualBasicDeductionUsed: 2_500_000, // 기본공제 소진 → 과세표준 = 양도소득금액
    properties,
  };
  return calculateTransferTaxAggregate(input, rates);
}

const card = (r: ReturnType<typeof agg>, g: string) => r.groupTaxes.find((x) => x.group === g)?.groupCalculatedTax;
const cardSum = (r: ReturnType<typeof agg>) => r.groupTaxes.reduce((s, g) => s + g.groupCalculatedTax, 0);

describe("A-3 — 한 필지 중 일부만 비사업용인 토지의 1호 파트 + 다른 세율군의 사업용 토지(1호)", () => {
  const T = "2023-03-20";
  // P: 13억 / 3억(취득 2020-09-20) · 면적 50% 비사업용 → non_business_land 세율군. 파트: 8호 500,000,000 · 1호 500,000,000.
  // Q: 사업용 토지 5억 / 3억(취득 2021-01-20, 2년 2월 — 장기보유특별공제 없음) → progressive 세율군 · 1호 200,000,000.
  const p = () => item("P", T, { propertyType: "land", transferPrice: 1_300_000_000, acquisitionPrice: 300_000_000, acquisitionDate: D("2020-09-20"), isNonBusinessLand: true, nonBusinessLandAreaRatio: 0.5 } as Partial<TransferTaxItemInput>);
  const q = () => item("Q", T, { propertyType: "land", transferPrice: 500_000_000, acquisitionPrice: 300_000_000, acquisitionDate: D("2021-01-20"), isNonBusinessLand: false });
  //   1호(전체 합산) = prog(1,200,000,000) = 474,060,000
  //   2호 = 1호 버킷 prog(500,000,000 + 200,000,000) 258,060,000 + 8호 버킷 nblTax(500,000,000) 224,060,000 = 482,120,000
  //   종전(세율군 안에서만 합산): prog(500M) + nblTax(500M) + prog(200M) = 454,180,000 < 1호 → 474,060,000 (과소 8,060,000)
  const clause1 = prog(1_200_000_000);
  const bucket1 = prog(700_000_000);
  const bucket8 = nblTax(500_000_000);

  it("독립 산식: 1호 474,060,000 < 2호 482,120,000", () => {
    expect(clause1).toBe(474_060_000);
    expect(bucket1).toBe(258_060_000);
    expect(bucket8).toBe(224_060_000);
  });

  it("[P,Q] = [Q,P]: 산출 482,120,000 — 1호 파트가 세율군 너머 사업용 토지와 합산된다", () => {
    for (const r of [agg(2023, [p(), q()]), agg(2023, [q(), p()])]) {
      expect(r.properties.find((x) => x.propertyId === "P")?.rateGroup).toBe("non_business_land");
      expect(r.properties.find((x) => x.propertyId === "Q")?.rateGroup).toBe("progressive");
      expect(r.calculatedTaxByGeneral).toBe(clause1);
      expect(r.calculatedTax).toBe(bucket1 + bucket8);
      expect([r.clause1BucketTaxBase, r.clause1BucketTax]).toEqual([700_000_000, bucket1]);
      expect([r.clause8TaxBase, r.clause8Tax]).toEqual([500_000_000, bucket8]);
    }
  });

  it("세율군 카드: 1호 버킷 세액을 과세표준 비율로 나눈다 — progressive 73,731,428 · non_business_land 408,388,572 (양 순서 동일)", () => {
    // progressive 몫 = floor(258,060,000 × 200,000,000 / 700,000,000) — 나머지는 버킷 안 과세표준이 큰 P(non_business_land)가 받는다.
    const share = Number((BigInt(bucket1) * 200_000_000n) / 700_000_000n); // 곱이 2^53을 넘어 BigInt로 정확히 나눈다
    expect(share).toBe(73_731_428);
    for (const r of [agg(2023, [p(), q()]), agg(2023, [q(), p()])]) {
      expect(card(r, "progressive")).toBe(share);
      expect(card(r, "non_business_land")).toBe(bucket1 - share + bucket8);
      expect(cardSum(r)).toBe(r.calculatedTaxByGroups);
    }
  });
});

describe("A-5 — 같은 호는 합산하고 다른 호는 따로 계산한다(조정대상지역 3주택 중과 2건 + 사업용 토지 1건)", () => {
  // 2022년 양도(중과 한시 배제 2022.5.10. 전). 세율군도 호도 다르므로 이번 변경 전후 값이 같아야 한다.
  //   A 사업용 토지 2억(2년 9월 보유 — 장기보유특별공제 없음) → §104①1호 · 38%
  //   B·C 3주택 중과(§104⑦3호) 3억 + 5억 → 과세표준 합산 8억에 42% + 30%p
  // 모의 세율표(2023년 이후 누진공제)로: prog(200,000,000) 56,060,000 + [prog(800,000,000) 300,060,000 + 240,000,000] = 596,120,000.
  //   (2022년 시행 누진공제 1,940만·3,540만을 쓰면 56,600,000 + 540,600,000 = 597,200,000)
  const T = "2022-03-15";
  const a = () => item("A", T, { propertyType: "land", transferPrice: 200_000_000, acquisitionPrice: 0, acquisitionDate: D("2019-06-01"), isNonBusinessLand: false });
  const h = (id: string, gain: number) =>
    item(id, T, { propertyType: "housing", transferPrice: gain, acquisitionPrice: 0, acquisitionDate: D("2015-01-01"), householdHousingCount: 3, isRegulatedArea: true });

  it("산출 596,120,000 — 중과 버킷 8억 1개 · 토지 버킷 따로, 세 순서 동일", () => {
    const surcharge = prog(800_000_000) + Math.floor(800_000_000 * 0.3);
    expect(prog(200_000_000)).toBe(56_060_000);
    expect(surcharge).toBe(540_060_000);
    for (const props of [[a(), h("B", 300_000_000), h("C", 500_000_000)], [h("C", 500_000_000), a(), h("B", 300_000_000)], [h("B", 300_000_000), h("C", 500_000_000), a()]]) {
      const r = agg(2022, props);
      expect(r.calculatedTax).toBe(56_060_000 + surcharge);
      expect(card(r, "progressive")).toBe(56_060_000);
      expect(card(r, "multi_house_surcharge")).toBe(surcharge);
      expect(r.groupTaxes.find((x) => x.group === "multi_house_surcharge")?.groupTaxBase).toBe(800_000_000);
      expect(cardSum(r)).toBe(r.calculatedTaxByGroups);
    }
  });
});

describe("A-9 — 감면 자산의 호 버킷이 세율군을 넘을 때 §90① 호별 산정(F-9)", () => {
  // 2026-06-01 양도. 기본공제는 비감면 P가 먼저 흡수한다(§103②).
  //   B: 사업용 토지 5억 / 1.5억(2015) · §77 공익수용 현금보상(감면율 15%) → progressive · 1호 273,000,000(장특 22%)
  //   P: 13억 / 3억(2015) · 면적 50% 비사업용 → non_business_land · 파트 1호 388,750,000 · 8호 388,750,000(기본공제 2,500,000 차감 후)
  //   1호 = prog(1,050,500,000) = 406,785,000
  //   2호 = 1호 버킷 prog(273,000,000 + 388,750,000) 241,995,000 + 8호 버킷 nblTax(388,750,000) 168,435,000 = 410,430,000
  //   감면(호별) = 1호 버킷 세액 × 감면소득분 / 1호 버킷 과세표준 = 241,995,000 × (273,000,000 × 15%) / 661,750,000
  //   감면(합산 — 1호 채택 시) = 406,785,000 × 40,950,000 / 1,050,500,000
  //   §104⑤ 괄호: 감면 차감 후 2호 쪽이 크다 → 2호·호별 감면을 채택한다.
  //   종전(세율군 안에서만 합산)은 2호 381,795,000 < 1호라 1호·합산 감면(15,857,064)이었다.
  const T = "2026-06-01";
  const E77 = { type: "public_expropriation", cashCompensation: 600_000_000, bondCompensation: 0, businessApprovalDate: D("2018-01-01") };
  const b = () => item("B", T, { propertyType: "land", transferPrice: 500_000_000, acquisitionPrice: 150_000_000, acquisitionDate: D("2015-01-01"), isNonBusinessLand: false, reductions: [E77] } as Partial<TransferTaxItemInput>);
  const p = () => item("P", T, { propertyType: "land", transferPrice: 1_300_000_000, acquisitionPrice: 300_000_000, acquisitionDate: D("2015-01-01"), isNonBusinessLand: true, nonBusinessLandAreaRatio: 0.5 } as Partial<TransferTaxItemInput>);
  const run = (props: TransferTaxItemInput[]) =>
    calculateTransferTaxAggregate({ taxYear: 2026, annualBasicDeductionUsed: 0, properties: props }, rates);
  const div = (a: number, n: number, d: number) => Number((BigInt(a) * BigInt(n)) / BigInt(d));

  it("독립 산식: 2호 410,430,000 · 호별 감면 14,974,983 — 감면 차감 후에도 2호(395,455,017) > 1호(390,927,936)", () => {
    const bucket1 = prog(661_750_000);
    const clause2 = bucket1 + nblTax(388_750_000);
    expect(bucket1).toBe(241_995_000);
    expect(clause2).toBe(410_430_000);
    expect(div(bucket1, 40_950_000, 661_750_000)).toBe(14_974_983);
    const clause1 = prog(1_050_500_000);
    expect(clause1).toBe(406_785_000);
    expect(div(clause1, 40_950_000, 1_050_500_000)).toBe(15_857_064);
    expect(clause2 - 14_974_983).toBeGreaterThan(clause1 - 15_857_064);
  });

  it("[B,P] = [P,B]: 산출 410,430,000 · 감면 14,974,983(호별 — 1호 버킷 241,995,000 / 661,750,000)", () => {
    for (const r of [run([b(), p()]), run([p(), b()])]) {
      expect(r.comparedTaxApplied).toBe("groups");
      expect(r.calculatedTax).toBe(410_430_000);
      expect(r.reductionAmount).toBe(14_974_983);
      const row = r.reductionBreakdown[0] as { clauseBasis?: string; aggregateCalculatedTax: number; aggregateTaxBase: number };
      expect(row.clauseBasis).toBe("per_clause");
      expect([row.aggregateCalculatedTax, row.aggregateTaxBase]).toEqual([241_995_000, 661_750_000]);
    }
  });
});
