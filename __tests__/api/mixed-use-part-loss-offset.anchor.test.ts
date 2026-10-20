/**
 * 확인 필요 ① — 겸용주택 단건 엔진의 파트 차손 0 절사 해제 + 파트 통산
 * (계획서 `transfer-split-part-loss-offset-p3.plan.md` §1 A안 · 사용자 결정 2026-10-20 「권장안대로」).
 *
 * 기준: 같은 겸용주택을 함께 양도하면 파트 카드(주택 토지 · 주택 건물 · 상가 토지 · 상가 건물 · 배율 초과)로 펼쳐 일반 합산 엔진이
 * 「소득세법 시행령」 §167의2①(1호 같은 세율 → 2호 다른 세율 안분)로 통산한다. 단건 겸용도 같은 값이어야 한다
 * (국세청 서면4팀-2792 · 재일46014-1949 — 겸용 주택부분 · 건물부분 차손은 다른 부분 양도차익과 통산).
 * 고가주택은 과세분(12억 초과분)만 통산하고(조심2016부0323 · P2 Q-1), 전액 비과세 주택분 차손은 통산하지 않는다(상속증여세과-209).
 *
 * 종전 단건은 주택 토지 · 건물 차손과 상가 합계 차손을 0으로 잘라 과대과세했고(아래 「종전」 주석), 상가 한 파트가 차손이면
 * 파트 합 ≠ 상가 소득금액이 되어 §104⑤ 2호 비교를 통째로 건너뛰어 과소과세했다(s3 — 세액 증가 사례).
 * fixture는 가상(실제 신고 사례 아님) · 세율은 mock.
 */
import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { buildMixedUsePartCards } from "@/app/api/calc/transfer/mixed-use-part-cards";
import { makeMockRatesWithHouseEngine } from "../tax-engine/_helpers/mock-rates";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import type { TransferTaxItemInput } from "@/lib/tax-engine/types/transfer-aggregate.types";

const rates = makeMockRatesWithHouseEngine();
const D = (s: string) => new Date(s);
const TD = D("2024-08-20");
const P = 3_000_000_000;

/** 주택 100㎡ · 상가 100㎡ · 정착 100㎡ · 토지 200㎡(일반주거) · 토지 2005 · 건물 2010 취득. */
function asset(over: Record<string, unknown> = {}): MixedUseAssetInput {
  return {
    isMixedUseHouse: true, residentialFloorArea: 100, nonResidentialFloorArea: 100, buildingFootprintArea: 100, totalLandArea: 200,
    landAcquisitionDate: D("2005-06-10"), buildingAcquisitionDate: D("2010-03-15"),
    transferStandardPrice: { housingPrice: 1_600_000_000, commercialBuildingPrice: 100_000_000, landPricePerSqm: 12_000_000, housingBuildingPrice: 800_000_000 },
    acquisitionStandardPrice: {
      housingPrice: 400_000_000, commercialBuildingPrice: 80_000_000, landPricePerSqm: 1_200_000, landPricePerSqmAtBuildingAcq: 1_800_000, housingBuildingPrice: 320_000_000,
    },
    residencePeriodYears: 0, isMetropolitanArea: true, zoneType: "general_residential", isOneHouseExempt: false, ...over,
  } as unknown as MixedUseAssetInput;
}
/** 토지 · 건물 실지 취득가액(별개 취득 파트 모델) — 차손 파트를 만드는 축. */
const sep = (land: number, building: number) => ({
  separateAcquisition: { landMode: "actual", buildingMode: "actual", landAcquisitionPrice: land, buildingAcquisitionPrice: building },
});
const SHORT = { landAcquisitionDate: D("2023-03-01"), buildingAcquisitionDate: D("2023-04-01") };
const ONE = { isOneHouseExempt: true };
const EXCESS = { totalLandArea: 1000 };
const LOW_HOUSE = {
  transferStandardPrice: { housingPrice: 400_000_000, commercialBuildingPrice: 1_600_000_000, landPricePerSqm: 12_000_000, housingBuildingPrice: 200_000_000 },
};

function companion(price: number, oneHouse: boolean): TransferTaxItemInput {
  return {
    propertyId: "c1", propertyLabel: "자산 2", propertyType: "housing", transferPrice: price, acquisitionPrice: 0, expenses: 0, transferDate: TD,
    acquisitionDate: D("2005-06-10"), isOneHousehold: oneHouse, householdHousingCount: 1, residencePeriodMonths: 0, isRegulatedArea: false,
    wasRegulatedAtAcquisition: false, isUnregistered: false, useEstimatedAcquisition: false, isNonBusinessLand: false, reductions: [],
  } as TransferTaxItemInput;
}

/** 단건 겸용과 「파트 카드 → 합산 엔진」. 합산 `totalTax` = 산출세액 + 지방소득세(10%). */
function compare(a: MixedUseAssetInput, price = P) {
  const single = calcMixedUseTransferTax(price, TD, a, rates);
  const cards = buildMixedUsePartCards(companion(price, a.isOneHouseExempt === true), a, price, TD, rates, "c1", "자산 2");
  const agg = calculateTransferTaxAggregate({ taxYear: 2024, properties: cards, annualBasicDeductionUsed: 0 }, rates);
  return { single, cards, agg };
}
function expectSameAsCards(r: ReturnType<typeof compare>) {
  expect(r.agg.taxBase).toBe(r.single.total.taxBase);
  expect(r.agg.totalTax).toBe(Math.floor(r.single.total.transferTax * 1.1));
}

describe("확인 필요 ① — 겸용 단건 = 파트 카드 (차손 파트)", () => {
  it.each([
    // 이름, 입력, 가액, 과세표준, 산출세액, 종전(과세표준 · 산출세액)
    ["m1 다주택 · 주택 · 상가 건물 차손", asset(sep(500_000_000, 1_500_000_000)), P, 477_155_173, 164_922_069, "1,015,086,207 · 390,848,793"],
    ["h1 1주택 고가 · 건물 차손(과세분만 통산)", asset({ ...ONE, ...sep(500_000_000, 1_500_000_000) }), P, 490_030_173, 170_072_069, "637,961,207 · 232,003,706"],
    ["h3 1주택 고가 · 주택 토지 차손", asset({ ...ONE, ...sep(2_200_000_000, 100_000_000) }), P, 242_401_380, 72_172_524, "271,797,932 · 83,343,214"],
    ["x0 배율 초과 · 다주택 · 건물 차손", asset({ ...EXCESS, ...sep(500_000_000, 400_000_000) }), P, 1_381_189_841, 555_595_428, "1,627,851,414 · 681,045,007"],
    ["x3 배율 초과 · 1주택 고가 · 건물 차손", asset({ ...EXCESS, ...ONE, ...sep(500_000_000, 1_500_000_000) }), P, 1_344_843_392, 539_239_526, "1,344,843,392 · 553,691,397"],
    ["x6 배율 초과 · 1주택 고가(60억) · 토지 차손 — 915 대칭(카드는 음수 몫)", asset({ ...EXCESS, ...ONE, ...sep(5_000_000_000, 300_000_000) }), 6_000_000_000, 549_685_027, 194_927_711, "카드와 불일치"],
    ["x7 배율 초과 · 1주택 고가(60억) · 토지 차손", asset({ ...EXCESS, ...ONE, ...sep(4_000_000_000, 300_000_000) }), 6_000_000_000, 1_249_685_027, 496_418_262, "카드와 불일치"],
  ] as const)("%s", (_n, a, price, taxBase, tax, _before) => {
    const r = compare(a, price);
    expect(r.single.total.taxBase).toBe(taxBase);
    expect(r.single.total.transferTax).toBe(tax);
    expectSameAsCards(r);
  });

  it("s1 단기(1년 5개월) · 건물 차손 → §104⑤ 2호 · 단기세율 파트에서 먼저 통산", () => {
    const r = compare(asset({ ...SHORT, ...sep(500_000_000, 1_500_000_000) }));
    expect(r.single.total.taxBase).toBe(997_500_000);
    expect(r.single.total.transferTax).toBe(439_534_481); // 종전 1,535,431,034 · 625,003,965
    expect(r.single.total.rateBasis).toBe("clause2");
    expectSameAsCards(r);
  });

  it("🔴 s3 단기 · 상가 건물만 차손 — 종전에는 §104⑤ 2호 비교가 빠져 과소과세(세액 증가 사례)", () => {
    const r = compare(asset({ ...SHORT, ...sep(500_000_000, 700_000_000) }));
    expect(r.single.commercialPart.buildingIncomeAmount).toBeLessThan(0);
    expect(r.single.total.taxBase).toBe(1_797_500_000);
    expect(r.single.total.transferTax).toBe(887_534_481); // 종전 742,935,000(progressive — 2호 비교 생략)
    expect(r.single.total.rateBasis).toBe("clause2");
    expectSameAsCards(r);
  });

  it.each([
    ["m2 다주택 · 건물 큰 차손", asset(sep(500_000_000, 3_000_000_000)), P],
    ["m3 다주택 · 토지 차손", asset(sep(3_500_000_000, 400_000_000)), P],
    ["s2 단기 · 토지 차손", asset({ ...SHORT, ...sep(3_500_000_000, 400_000_000) }), P],
    ["h2 1주택 고가 · 토지 차손", asset({ ...ONE, ...sep(3_500_000_000, 400_000_000) }), P],
    ["x1 배율 초과 · 다주택 · 토지 차손", asset({ ...EXCESS, ...sep(3_500_000_000, 400_000_000) }), P],
    ["x9 배율 초과 · 1주택 고가(60억) · 토지 큰 차손", asset({ ...EXCESS, ...ONE, ...sep(6_500_000_000, 300_000_000) }), 6_000_000_000],
  ] as const)("%s → 통산 후 과세표준 0 (종전에는 차손을 버려 과세)", (_n, a, price) => {
    const r = compare(a, price);
    expect(r.single.total.taxBase).toBe(0);
    expect(r.single.total.transferTax).toBe(0);
    expectSameAsCards(r);
  });
});

describe("확인 필요 ① — §154③ 본문(건물 전부 주택 · 전체 12억 이하) 경로", () => {
  /** 주택 연면적 150 > 상가 50 · 1세대1주택 · 전체 11억 · 토지 1000㎡(배율 초과). */
  const MAIN = { residentialFloorArea: 150, nonResidentialFloorArea: 50, ...EXCESS, ...ONE };
  const W = 1_100_000_000;

  it("b1 토지 차손 — 상가 토지분의 배율 초과 몫도 차손으로 비사업용 파트에 옮긴다(나머지 토지분 차손은 비과세라 버림)", () => {
    const r = compare(asset({ ...MAIN, ...sep(1_500_000_000, 100_000_000) }), W);
    expect(r.single.commercialPart.deemedHouseBy154_3Main).toBe(true);
    expect(r.single.nonBusinessLandPart?.incomeAmount).toBe(-317_781_157);
    expect(r.single.total.taxBase).toBe(0);
    expectSameAsCards(r);
  });

  it("b2 나중 취득 토지(G-3) · 토지 차손 — 비과세 대상이 아닌 토지분 차손을 그대로 둔다", () => {
    const r = compare(asset({ ...MAIN, landAcquisitionDate: D("2023-06-01"), ...sep(1_500_000_000, 100_000_000) }), W);
    expect(r.single.housingPart.incomeAmount).toBe(-234_330_221);
    expect(r.single.total.taxBase).toBe(0);
    expectSameAsCards(r);
  });

  it.each([
    // 이름, 나중 취득(G-3), 비사업용 파트 소득(주택 + 상가 토지분 배율 초과 몫), 상가 토지 소득
    ["b4 상가 토지까지 차손", false, -1_367_781_157, 0],
    ["b6 상가 토지까지 차손 · G-3 — 상가 토지 차손도 비과세 대상이 아니라 그대로", true, -1_367_781_157, -14_361_702],
  ] as const)("%s — 상가 토지분 배율 초과 몫도 차손(단건 · 카드 같은 값)", (_n, g3, nbIncome, cLandIncome) => {
    const r = compare(asset({ ...MAIN, ...(g3 ? { landAcquisitionDate: D("2023-06-01") } : {}), ...sep(3_000_000_000, 100_000_000) }), W);
    expect(r.single.commercialPart.landTransferGain).toBeLessThan(0);
    expect(r.single.nonBusinessLandPart?.incomeAmount).toBe(nbIncome);
    expect(r.single.commercialPart.landIncomeAmount).toBe(cLandIncome);
    expect(r.agg.properties.find((p) => p.propertyId === "mu-nbl#c1")?.transferGain).toBe(r.single.nonBusinessLandPart?.transferGain);
    expectSameAsCards(r);
  });

  it.each([
    ["b0 토지 이익", {}, 363_053_191, 155_586_595],
    ["b3 G-3 · 토지 이익", { landAcquisitionDate: D("2023-06-01") }, 743_526_920, 330_770_984],
  ] as const)("%s (차손 없음 — 회귀선)", (_n, over, taxBase, tax) => {
    const r = compare(asset({ ...MAIN, ...over, ...sep(300_000_000, 100_000_000) }), W);
    expect(r.single.total.taxBase).toBe(taxBase);
    expect(r.single.total.transferTax).toBe(tax);
    expectSameAsCards(r);
  });
});

describe("확인 필요 ① — 불변 회귀선", () => {
  it.each([
    ["m0 다주택 · 차손 없음", asset(sep(500_000_000, 400_000_000)), 1_474_810_346, 597_724_655],
    ["h0 1주택 고가 · 차손 없음", asset({ ...ONE, ...sep(500_000_000, 400_000_000) }), 919_125_345, 350_092_644],
    ["e1 1주택 12억 이하 · 주택 건물 차손 — 전액 비과세분 차손은 통산하지 않는다(209)", asset({ ...ONE, ...LOW_HOUSE, ...sep(500_000_000, 1_500_000_000) }), 1_474_000_000, 597_360_000],
    ["e2 1주택 12억 이하 · 토지 차손", asset({ ...ONE, ...LOW_HOUSE, ...sep(2_000_000_000, 100_000_000) }), 1_150_600_000, 451_830_000],
  ] as const)("%s", (_n, a, taxBase, tax) => {
    const r = compare(a);
    expect(r.single.total.taxBase).toBe(taxBase);
    expect(r.single.total.transferTax).toBe(tax);
    expect(r.single.total.partLossOffset).toBeUndefined();
    expectSameAsCards(r);
  });
});

describe("확인 필요 ① — 파트 값 · 통산 표 · 산출근거", () => {
  it("파트 소득금액은 통산 전 음수 그대로, 합산 양도소득금액은 통산 후 합", () => {
    const { single } = compare(asset(sep(500_000_000, 1_500_000_000)));
    expect(single.housingPart.incomeAmount).toBe(-17_758_621);
    expect(single.commercialPart.buildingIncomeAmount).toBe(-196_551_724);
    // 장특 echo(신고서 열이 읽는 값)도 차손 그대로 — 0으로 자르면 신고서가 차손을 「비과세 양도차익」 칸에 음수로 넣는다.
    expect(single.housingPart.partLthd?.building.taxableGain).toBe(single.housingPart.buildingTransferGain);
    expect(single.commercialPart.incomeAmount).toBe(single.commercialPart.landIncomeAmount! + single.commercialPart.buildingIncomeAmount!);
    expect(single.total.aggregateIncome).toBe(
      single.housingPart.incomeAmount + single.commercialPart.incomeAmount + (single.nonBusinessLandPart?.incomeAmount ?? 0),
    );
    // 모두 누진 2년 이상이라 1호(같은 세율) — 주택분 · 상가 건물 차손을 상가 토지에서 공제
    expect(single.total.partLossOffset).toEqual([
      { from: "housing", to: "commercial_land", amount: 17_758_621, scope: "same_group" },
      { from: "commercial_building", to: "commercial_land", amount: 196_551_724, scope: "same_group" },
    ]);
  });

  it("고가주택 차손은 과세분만 — 일반 엔진과 같은 안분 함수(카드 값과 원 단위 동일)", () => {
    const { single, agg } = compare(asset({ ...ONE, ...sep(500_000_000, 1_500_000_000) }));
    const bldCard = agg.properties.find((p) => p.propertyId === "mu-house-bld#c1")!;
    expect(single.housingPart.isExempt).toBe(false);
    expect(single.housingPart.buildingTransferGain).toBeLessThan(0);
    // 주택분 건물 차손의 과세분 = 카드의 안분 후 차손(장특 0)
    expect(single.housingPart.incomeAmount).toBe(-4_883_621);
    expect(bldCard.income).toBeLessThan(0);
  });

  it("산출근거 합산 단계에 통산 행을 싣는다", () => {
    const { single } = compare(asset(sep(500_000_000, 1_500_000_000)));
    const total = single.steps.find((s) => s.id === "step-9-total")!;
    const rows = total.values.filter((v) => v.label.startsWith("양도차손 통산"));
    expect(rows.map((v) => v.label)).toEqual([
      "양도차손 통산 — 주택분 차손을 상가 부수토지에서 공제 (영 §167의2① 1호 같은 세율)",
      "양도차손 통산 — 상가 건물 차손을 상가 부수토지에서 공제 (영 §167의2① 1호 같은 세율)",
    ]);
    expect(rows.map((v) => v.value)).toEqual([17_758_621, 196_551_724]);
  });

  it("배율 초과 + 고가 + 토지 차손이면 915 회신 방식 고지도 띄운다(단일 주택 경로와 같은 조건)", () => {
    const { single } = compare(asset({ ...EXCESS, ...ONE, ...sep(5_000_000_000, 300_000_000) }), 6_000_000_000);
    expect(single.housingPart.nonBusinessTransferredGain).toBeLessThan(0);
    expect(single.warnings.some((w) => w.includes("재산세제과-915"))).toBe(true);
  });
});
