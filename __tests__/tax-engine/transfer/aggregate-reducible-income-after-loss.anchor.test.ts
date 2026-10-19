/**
 * anchor: 다건 신고에서 세액감면형(「소득세법」 §90①) 감면 자산이 다른 자산의 양도차손을 통산받으면,
 * B(감면대상 양도소득금액)도 받은 차손 중 감면소득 몫만큼 줄인다 — 「소득세법 시행령」 §167의2②.
 *
 * > 법 제90조의 감면소득금액을 계산함에 있어서 … 순양도소득금액과 감면소득금액이 차지하는 비율로 안분하여 당해 양도차손을
 * > 공제한 것으로 보아 감면소득금액에서 당해 양도차손 해당분을 공제한 금액을 법 제90조의 규정에 의한 감면소득금액으로 본다.
 *
 * [결함] 엔진은 이 조항을 소득공제형(§90②)에만 적용했다. 세액감면형 B는 통산 전 금액 그대로라 `(B − C) / D > 1`이 되어
 *   감면액이 감면율을 넘었다 — §77 현금 10%가 차손 −1억에 14.3%, −3억에 산출세액 전액.
 * [수정] `transfer-tax-aggregate-reducible-loss-share.ts`가 B′를 만들고, 감면액 산식·§103② 배분·자산별 배분·⑲ 표시가 그 값을 읽는다.
 *   계획서 `docs/02-design/features/transfer-90-1-reducible-income-after-loss-offset.plan.md`.
 *
 * 공통: 모의 세율표 · 양도일 2023-03-20 · 사업인정고시일 2022-06-01 · 감면 토지 650,000,000 / 200,000,000 (2010-03-20, 장특 26%)
 *   → 양도소득금액 333,000,000. 주택은 다주택 일반세율이고 양도가로 차손 크기를 정한다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { TransferTaxItemInput } from "@/lib/tax-engine/types/transfer-aggregate.types";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

const rates = makeMockRates();
const D = (s: string) => new Date(s);
const T = "2023-03-20";
const E77 = (cash: number, bond = 0) => ({ type: "public_expropriation", cashCompensation: cash, bondCompensation: bond, businessApprovalDate: D("2022-06-01") });

const land = (reductions: unknown[]) =>
  baseTransferInput({
    propertyType: "land", transferPrice: 650_000_000, acquisitionPrice: 200_000_000, acquisitionDate: D("2010-03-20"), transferDate: D(T),
    isOneHousehold: false, householdHousingCount: 0, isNonBusinessLand: false, expenses: 0, annualBasicDeductionUsed: 0, reductions,
  } as Partial<TransferTaxInput>);
const house = (loss: number) =>
  baseTransferInput({
    propertyType: "housing", transferPrice: 2_000_000_000 - loss, acquisitionPrice: 2_000_000_000, acquisitionDate: D("2017-02-20"), transferDate: D(T),
    isOneHousehold: false, householdHousingCount: 2, expenses: 0, annualBasicDeductionUsed: 0,
  } as Partial<TransferTaxInput>);
const gainLand = (gain: number) =>
  baseTransferInput({
    propertyType: "land", transferPrice: 300_000_000 + gain, acquisitionPrice: 300_000_000, acquisitionDate: D("2015-03-20"), transferDate: D(T),
    isOneHousehold: false, householdHousingCount: 0, isNonBusinessLand: false, expenses: 0, annualBasicDeductionUsed: 0,
  } as Partial<TransferTaxInput>);
/** 비주택 split — 토지 2010(§77 요건 충족) · 건물 2021-09-20(사업인정 소급 2년 이후라 감면 제외). */
const split = (landSale: number) =>
  baseTransferInput({
    propertyType: "building", transferPrice: landSale + 350_000_000, transferDate: D(T), acquisitionPrice: 500_000_000,
    acquisitionDate: D("2021-09-20"), landAcquisitionDate: D("2010-03-20"), isOneHousehold: false, householdHousingCount: 1,
    isSeparateAcquisition: true, landAcqMode: "actual", buildingAcqMode: "actual", landTransferPrice: landSale, buildingTransferPrice: 350_000_000,
    landStandardPriceAtTransfer: landSale, buildingStandardPriceAtTransfer: 350_000_000, landAcquisitionPrice: 200_000_000,
    buildingAcquisitionPrice: 300_000_000, expenses: 0, annualBasicDeductionUsed: 0, reductions: [E77(landSale + 350_000_000)],
  } as Partial<TransferTaxInput>);

const asItem = (i: TransferTaxInput, id: string) => ({ ...i, propertyId: id, propertyLabel: id }) as unknown as TransferTaxItemInput;
const agg = (items: TransferTaxInput[], used = 0) =>
  calculateTransferTaxAggregate({ taxYear: 2023, properties: items.map((x, i) => asItem(x, `A${i}`)), annualBasicDeductionUsed: used }, rates);
const eligibleB = (r: ReturnType<typeof agg>) => r.reductionBreakdown[0]?.eligibleIncomeBeforeRate;

describe("R-1 비분리 자산 — 받은 차손 × B / 통산 전 양도소득금액을 B에서 뺀다", () => {
  it("차손이 없으면 그대로 — 감면 10,626,000 = 산출세액 106,260,000의 10% · ⑲ echo 없음", () => {
    const r = agg([land([E77(650_000_000)])]);
    expect(r.reductionAmount).toBe(10_626_000);
    expect(eligibleB(r)).toBe(333_000_000);
    expect(r.properties[0].eligibleIncomeAfterLoss).toBeUndefined();
  });

  it("주택 차손 −100,000,000: B 233,000,000 · 감면 6,765,000 = 산출세액 67,650,000의 10% (종전 9,699,924 — 14.3%)", () => {
    // 감면 = 67,650,000 × (233,000,000 − 2,500,000) / 230,500,000 × 10%
    for (const order of [[land([E77(650_000_000)]), house(100_000_000)], [house(100_000_000), land([E77(650_000_000)])]]) {
      const r = agg(order);
      expect(r.calculatedTax).toBe(67_650_000);
      expect(r.reductionAmount).toBe(6_765_000);
      expect(eligibleB(r)).toBe(233_000_000);
      expect(r.properties.find((p) => p.reductionType)?.eligibleIncomeAfterLoss).toBe(233_000_000);
    }
  });

  it("주택 차손 −300,000,000: 감면 331,500 = 산출세액 3,315,000의 10% (종전 산출세액 전액 3,315,000)", () => {
    const r = agg([land([E77(650_000_000)]), house(300_000_000)]);
    expect(r.calculatedTax).toBe(3_315_000);
    expect(r.reductionAmount).toBe(331_500);
    expect(eligibleB(r)).toBe(33_000_000);
  });

  it("현금·채권 반반(10%·15%) — 감면분 차손은 조각 소득 비율로(Q-2): 감면 8,474,593 (종전 12,143,248 — 17.9%)", () => {
    const r = agg([land([E77(325_000_000, 325_000_000)]), house(100_000_000)]);
    expect(r.reductionAmount).toBe(8_474_593);
    expect(eligibleB(r)).toBe(233_000_000);
    expect(r.reductionAmount / r.calculatedTax).toBeLessThanOrEqual(0.15);
  });

  it("현금 300,000,000 · 채권 350,000,000 — 조각 절사 잔액 1원도 나눠 B′ 합이 정확히 233,000,000 (감면 8,606,100)", () => {
    const r = agg([land([E77(300_000_000, 350_000_000)]), house(100_000_000)]);
    expect(eligibleB(r)).toBe(233_000_000);
    expect(r.properties[0].eligibleIncomeAfterLoss).toBe(233_000_000);
    expect(r.reductionAmount).toBe(8_606_100);
  });

  it("§77의2 현금 2억 + 대토 4억 — 감면 외 소득(현금분)이 남는 자산은 C가 0: 감면 14,475,300 (B′ 130,666,668)", () => {
    // B 197,333,334(대토분) · 감면 외 98,666,666 — 받은 차손 100,000,000 중 감면분 66,666,666을 B에서 뺀다.
    // 기본공제는 남은 감면 외 소득이 먼저 흡수한다(§103②) — B를 통산 전 값으로 보면 감면 외 소득이 0이 되어 C = 2,500,000이 된다.
    const R = baseTransferInput({
      ...land([{ type: "replacement_land_comp", cashCompensation: 200_000_000, replacementLandComp: 400_000_000, businessApprovalDate: D("2022-06-01") }]),
      transferPrice: 600_000_000,
    } as Partial<TransferTaxInput>);
    const r = agg([R, house(100_000_000)]);
    expect(r.properties[0].eligibleIncomeAfterLoss).toBe(130_666_668);
    expect(r.reductionBreakdown[0].basicDeductionApplied).toBe(0);
    expect(r.reductionAmount).toBe(14_475_300);
  });

  it("§103② 1단계 — 차손 반영 후 남은 감면 외 소득이 먼저 양도한 자산이면 기본공제를 받는다 (단기 토지가 아니라)", () => {
    const R = baseTransferInput({
      ...land([{ type: "replacement_land_comp", cashCompensation: 200_000_000, replacementLandComp: 400_000_000, businessApprovalDate: D("2022-06-01") }]),
      transferPrice: 600_000_000, transferDate: D("2023-03-10"),
    } as Partial<TransferTaxInput>);
    const S = baseTransferInput({ ...gainLand(20_000_000), acquisitionDate: D("2021-09-20"), transferDate: D("2023-03-25") } as Partial<TransferTaxInput>);
    const r = agg([R, house(100_000_000), S]);
    expect(r.properties.map((p) => p.allocatedBasicDeduction)).toEqual([2_500_000, 0, 0]);
    expect(r.totalTax).toBe(57_333_174);
  });

  it("감면 외 이익 자산이 섞여도 받은 차손만 비율로 나눈다 — 감면율을 넘지 않는다", () => {
    const r = agg([land([E77(650_000_000)]), house(300_000_000), gainLand(200_000_000)]);
    expect(r.reductionAmount / r.calculatedTax).toBeLessThanOrEqual(0.1);
  });
});

describe("R-2 split 감면 파트 — 그 파트 행이 받은 차손을 그 파트 소득에 대해 나눈다", () => {
  it("파트가 차손을 다 받아 B′ = 0이면 감면 0 — 단건 감면액(3,636,000)으로 돌아가지 않는다 (C-1)", () => {
    // 토지 파트 (400,000,000 − 200,000,000) × 74% = 148,000,000 ← 주택 차손 −200,000,000이 같은 세율 키로 먼저 전부 흡수
    for (const used of [0, 2_500_000]) {
      const r = agg([split(400_000_000), house(200_000_000), gainLand(50_000_000)], used);
      expect(r.reductionAmount).toBe(0);
      expect(r.properties[0].reductionAggregated).toBe(0);
      expect(r.properties[0].eligibleIncomeAfterLoss).toBe(0);
      expect(r.steps.some((s) => s.formula.includes("건별 단순합"))).toBe(false);
    }
  });
});

describe("단건은 바뀌지 않는다 — 파트 차손은 단건 엔진이 이미 파트 안에서 통산한 B를 싣는다", () => {
  // 2026-10-19 — 건물(2021-09-20, 1년 6개월) 차손을 토지에서 공제한 뒤(영 §167의2①) 토지 파트는 기본세율로 판정한다.
  //   종전에는 자산 전체에 건물 단기세율 40%(산출세액 112,200,000 · 감면 11,220,000)를 적용했다.
  it("토지 파트 333,000,000 + 건물 파트 −50,000,000: B 283,000,000 · 산출세액 86,650,000 · 감면 8,665,000 = 다건(자산 1건)", () => {
    const P = baseTransferInput({
      ...split(650_000_000), acquisitionPrice: 600_000_000, buildingAcquisitionPrice: 400_000_000,
    } as Partial<TransferTaxInput>);
    const s = calculateTransferTax(P, rates);
    expect(s.publicExpropriationDetail?.partWise?.eligibleIncome).toBe(283_000_000);
    expect(s.calculatedTax).toBe(86_650_000);
    expect(s.reductionAmount).toBe(8_665_000);
    const r = agg([P]);
    expect(r.reductionAmount).toBe(8_665_000);
    expect(r.properties[0].eligibleIncomeAfterLoss).toBeUndefined();
  });
});
