/**
 * anchor (A3 · OH-17) — 주택 연면적 > 주택 외 연면적인 겸용주택은 §154③ **본문**에 따라 건물 전부를
 * 주택으로 보고, 전체 실지거래가액이 12억 이하면(§156②) 1세대1주택 비과세가 **건물·토지 전부**에 미친다.
 *
 * 법령(소득세법 시행령 MST 262425·286211 실독):
 *   · §154③ 「법 제89조제1항제3호를 적용할 때 하나의 건물이 주택과 주택외의 부분으로 복합되어 있는 경우
 *     … 그 전부를 주택으로 본다. 다만, 주택의 연면적이 주택 외의 부분의 연면적보다 적거나 같을 때에는
 *     주택외의 부분은 주택으로 보지 아니한다.」
 *   · §154④ — 부수토지 면적 비례 안분은 「제3항 **단서**의 경우」만. 본문이면 토지 전부가 주택 부수토지
 *     (배율 한도는 §154⑦ — 건물 정착면적 × 배율).
 *   · §156② — 고가주택 실지거래가액은 「제154조제3항 본문에 따라 주택으로 보는 부분(부수 토지 포함)」을 포함.
 *   · §160① 괄호(「주택 외의 부분은 주택으로 보지 않는다」, 2022-01-01 시행)는 **고가주택**에만 붙는다 —
 *     12억 이하에는 적용되지 않는다. (12억 초과 + 주택 > 상가의 판정 분모는 이 anchor의 범위 밖 — 확인 필요)
 *
 * 결함: 겸용 엔진이 면적 우열·전체 가액을 보지 않고 항상 상가분을 과세했다(리뷰 실측 12,262,104원).
 */
import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import { makeMockRates } from "../_helpers/mock-rates";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import { buildMixedUsePartCards } from "@/app/api/calc/transfer/mixed-use-part-cards";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { TransferTaxItemInput } from "@/lib/tax-engine/types/transfer-aggregate.types";

const rates = makeMockRates();
const TD = new Date("2024-06-01");

/** 리뷰 시나리오 — 주택 150㎡ · 상가 100㎡ · 정착 100㎡ · 토지 200㎡ · 2021-06-01 취득 · 거주 3년 */
function asset(over: Partial<MixedUseAssetInput> = {}): MixedUseAssetInput {
  return {
    isMixedUseHouse: true,
    residentialFloorArea: 150,
    nonResidentialFloorArea: 100,
    buildingFootprintArea: 100,
    totalLandArea: 200,
    landAcquisitionDate: new Date("2021-06-01"),
    buildingAcquisitionDate: new Date("2021-06-01"),
    transferStandardPrice: { housingPrice: 500_000_000, commercialBuildingPrice: 100_000_000, landPricePerSqm: 2_000_000 },
    acquisitionStandardPrice: { housingPrice: 350_000_000, commercialBuildingPrice: 80_000_000, landPricePerSqm: 1_500_000 },
    residencePeriodYears: 3,
    isMetropolitanArea: true,
    zoneType: "residential",
    isOneHouseExempt: true,
    ...over,
  };
}

describe("OH-17 — §154③ 본문: 주택 연면적 > 상가 · 전체 12억 이하 · 1세대1주택 → 전부 비과세", () => {
  it("🔴 리뷰 시나리오(10억) — 상가분까지 비과세, 총 납부 0", () => {
    const r = calcMixedUseTransferTax(1_000_000_000, TD, asset(), rates);
    expect(r.commercialPart.incomeAmount).toBe(0);
    expect(r.total.totalPayable).toBe(0);
    expect(r.calculationRoute.highValueRule).toBe("below_threshold_exempt");
  });

  it("경계 짝 — 연면적 같음(150=150)은 단서 → 상가분 과세", () => {
    const r = calcMixedUseTransferTax(1_000_000_000, TD, asset({ nonResidentialFloorArea: 150 }), rates);
    expect(r.commercialPart.incomeAmount).toBeGreaterThan(0);
    expect(r.total.totalPayable).toBeGreaterThan(0);
  });

  it("대조군 — 주택 100 < 상가 150(단서) → 상가분 과세 (리뷰 B)", () => {
    const r = calcMixedUseTransferTax(
      1_000_000_000,
      TD,
      asset({ residentialFloorArea: 100, nonResidentialFloorArea: 150 }),
      rates,
    );
    expect(r.total.totalPayable).toBeGreaterThan(0);
  });

  it("부정 짝 — 1세대1주택 비과세 요건 미충족(isOneHouseExempt=false)이면 본문이어도 과세", () => {
    const r = calcMixedUseTransferTax(1_000_000_000, TD, asset({ isOneHouseExempt: false }), rates);
    expect(r.commercialPart.incomeAmount).toBeGreaterThan(0);
  });

  it("경계 짝 — 전체 12억 초과(13억)는 고가주택 → §160① 괄호로 상가분 과세(종전 경로 유지)", () => {
    const r = calcMixedUseTransferTax(1_300_000_000, TD, asset(), rates);
    expect(r.commercialPart.incomeAmount).toBeGreaterThan(0);
  });

  it("경계 짝 — 정확히 12억은 고가 아님 → 전부 비과세", () => {
    const r = calcMixedUseTransferTax(1_200_000_000, TD, asset(), rates);
    expect(r.total.totalPayable).toBe(0);
  });

  it("🔴 배율 초과 토지는 본문이어도 비사업용 토지로 과세 — 한도는 **건물 전체** 정착면적 × 3배", () => {
    // 토지 400㎡ · 정착 100㎡ × 3배 = 300㎡ → 초과 100㎡(25%)
    const r = calcMixedUseTransferTax(1_000_000_000, TD, asset({ totalLandArea: 400 }), rates);
    expect(r.commercialPart.incomeAmount).toBe(0);
    expect(r.nonBusinessLandPart?.excessArea).toBe(100);
    // 비사업용 양도차익 = (주택 토지차익 + 상가 토지차익) × 25%
    const landGainTotal = r.housingPart.landTransferGain + r.commercialPart.landTransferGain;
    const expected =
      Math.floor(r.housingPart.landTransferGain * 0.25) + Math.floor(r.commercialPart.landTransferGain * 0.25);
    expect(landGainTotal).toBeGreaterThan(0);
    expect(r.nonBusinessLandPart?.transferGain).toBe(expected);
    expect(r.total.totalPayable).toBeGreaterThan(0);
  });
});

// ─── 컴패니언 파트 카드 — 단건 겸용과 같은 결론 (mixed-use-part-cards.ts) ───

function companion(price: number): TransferTaxItemInput {
  return {
    propertyId: "c1",
    propertyLabel: "자산 2",
    propertyType: "housing",
    transferPrice: price,
    acquisitionPrice: 0,
    expenses: 0,
    transferDate: TD,
    acquisitionDate: new Date("2021-06-01"),
    isOneHousehold: true,
    householdHousingCount: 1,
    residencePeriodMonths: 36,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    useEstimatedAcquisition: false,
    isNonBusinessLand: false,
    reductions: [],
  } as TransferTaxItemInput;
}

function aggregate(a: MixedUseAssetInput, price: number) {
  const cards = buildMixedUsePartCards(companion(price), a, price, TD, rates, "c1", "자산 2");
  return {
    cards,
    agg: calculateTransferTaxAggregate({ taxYear: 2024, properties: cards, annualBasicDeductionUsed: 0 }, rates),
  };
}

describe("OH-17 — 컴패니언 파트 카드도 같은 결론", () => {
  it("🔴 본문 · 12억 이하 → 상가 카드가 주택 카드가 되어 총세액 0", () => {
    const { cards, agg } = aggregate(asset(), 1_000_000_000);
    expect(cards.find((c) => c.propertyId.startsWith("mu-comm-bld"))?.propertyType).toBe("housing");
    expect(agg.totalTax).toBe(0);
  });

  it("🔴 배율 초과 — 비사토 카드 과세표준이 단건 겸용과 같다", () => {
    const a = asset({ totalLandArea: 400 });
    const single = calcMixedUseTransferTax(1_000_000_000, TD, a, rates);
    const { agg } = aggregate(a, 1_000_000_000);
    expect(single.total.taxBase).toBeGreaterThan(0);
    expect(agg.taxBase).toBe(single.total.taxBase);
  });

  it("대조군 — 단서(주택 100 < 상가 150)는 상가 카드가 land/building 그대로", () => {
    const { cards } = aggregate(asset({ residentialFloorArea: 100, nonResidentialFloorArea: 150 }), 1_000_000_000);
    expect(cards.find((c) => c.propertyId.startsWith("mu-comm-bld"))?.propertyType).toBe("building");
  });
});
