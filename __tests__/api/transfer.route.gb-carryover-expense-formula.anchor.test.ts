/**
 * anchor — 일반건물 카드 × 이월과세(§97의2): 명세서 **필요경비 칸 산식**이 칸 값을 만든다.
 *
 * 종전: 이월과세 A 카드도 개산공제 분기로 떨어져 「취득시 토지기준시가 79,800,000 × 3% = 50,000,000」처럼 **적힌 산식이 적힌 값을 못 만들었다**(실제 79,800,000 × 3% = 2,394,000 —
 * 칸 값은 증여세 상당액·본인 양도비·증여자 자본적지출이다). 실가 파트는 「0 × 339,492,000 / (339,492,000+12,308,310) = 54,825,066」. 비교과세(B) 채택 카드도 #2676 이후 개산공제가 없는데 같은 산식이다.
 * 값·세액은 불변 — 산식 문구만 값에 맞춘다(계획서 `docs/00-pm/carryover-a-gb-card-filing-acq-cell-label.plan.md` §10-6 V-2).
 *
 * 필요경비 칸(= 필요경비 − 취득가액 칸으로 옮긴 본인 자본적지출) 구성: 본인 양도비 + 증여자 자본적지출(증여자 실가) + 증여세 상당액(§97의2①3호). 증여자 환산 본문이면 개산공제(증여자 취득시 기준시가 기준) + 증여세 상당액.
 * 손계산은 `…card-capex-split.anchor.test.ts`(토지 몫 4,122,021 · 4,825,066 …)와 같다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { buildGbExpenseFormula } from "@/components/calc/results/transfer/DetailedStatementGbFormulas";
import { capExInAcquisitionColumnOfProperty } from "@/components/calc/results/transfer/exempt-gross-gain";

const BUILDING_ACQ_STD = 16_997_190;
const ct = (o: object = {}) => ({
  giftRegistryDate: "2020-03-17", donorAcquisitionDate: "1995-06-15", donorAcquisitionPrice: 50_000_000, useEstimatedAcquisition: false,
  giftTaxAmount: 50_000_000, giftDateValuation: 200_000_000, ...o,
});

/** 환산 경로(2-way) 일반건물 payload. */
const estimatedGbv = (o: object = {}) => ({
  landArea: 57, buildingArea: 100, buildingFootprintArea: 50, transferLandPricePerSqm: 5_956_000, transferBuildingStdPrice: 12_308_310,
  zoneType: "general_residential", acquisitionLandPricePerSqm: 1_400_000, acquisitionBuildingStdPrice: BUILDING_ACQ_STD,
  buildingAcquisitionCause: "purchase", buildingAcquisitionDate: "2020-03-17",
  landAcquisitionCause: "carryover_gift", landCarryoverTaxation: ct(), ...o,
});
/** 실가 경로 — ④(`buildGeneralBuildingValuation`)가 만드는 모양. */
const actualGbv = (o: object = {}) => ({
  transferLandPricePerSqm: 5_956_000, transferBuildingStdPrice: 12_308_310, landArea: 57, buildingFootprintArea: 50, actualPriceMode: true,
  landAcqMode: "actual", buildingAcqMode: "actual", buildingAcquisitionDate: "2020-03-17", landAcquisitionDate: "2020-03-17", buildingAcquisitionCause: "purchase",
  isSelfBuilt: false, acquisitionLandPricePerSqm: 1_400_000, acquisitionBuildingStdPrice: BUILDING_ACQ_STD,
  landAcquisitionCause: "carryover_gift", landCarryoverTaxation: ct(), zoneType: "general_residential", isMetropolitan: false,
  unapprovedBuilding: false, unregisteredLand: false, unregisteredBuilding: false, ...o,
});
const COMMON = {
  propertyType: "general_building", transferDate: "2024-10-11", transferPrice: 330_000_000, acquisitionDate: "2020-03-17", acquisitionPrice: 0, expenses: 0,
  useEstimatedAcquisition: true, householdHousingCount: 2, isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false,
  isNonBusinessLand: false, isOneHousehold: false, reductions: [] as unknown[], annualBasicDeductionUsed: 0, residencePeriodMonths: 0,
};
const estimatedBody = (gbv: object) => ({ ...COMMON, generalBuildingValuation: gbv });
const actualBody = (gbv: object) => ({ ...COMMON, acquisitionPrice: 100_000_000, useEstimatedAcquisition: false, totalPropertyTransferPrice: 330_000_000, generalBuildingValuation: gbv });


const GIFT = "증여세 상당액 50,000,000 — 이월과세 §97의2①3호·시행령 §163의2②";
async function formulaOf(body: object, id = "land") {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  const json = await res.json();
  expect(res.status, JSON.stringify(json.error)).toBe(200);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = json.data.aggregated.properties.find((x: any) => x.propertyId === id);
  const shift = capExInAcquisitionColumnOfProperty(p);
  return { p, cellExp: p.necessaryExpense - shift, text: buildGbExpenseFormula(p, json.data.aggregated.generalBuildingValuationDetail, undefined) ?? "" };
}
beforeEach(() => { vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates()); });

describe("EXPF-A 시나리오 A 카드 — 필요경비 칸 = 본인 양도비 + 증여자 자본적지출 + 증여세 상당액", () => {
  it("본인 지출 없음 — 증여세 상당액만: 50,000,000", async () => {
    const r = await formulaOf(estimatedBody(estimatedGbv()));
    expect(r.p.carryoverTaxationDetail.adoptedScenario).toBe("A");
    expect(r.text).toBe(GIFT);
  });

  it("환산 경로 · 단서 발동(150,000,000 / 5,000,000): 양도비 몫 4,122,021 + 증여세 50,000,000 = 54,122,021 (자본적지출 123,660,614 는 취득가액 칸)", async () => {
    const r = await formulaOf(estimatedBody(estimatedGbv({ capitalExpenditure: 150_000_000, transferExpense: 5_000_000 })));
    expect(r.cellExp).toBe(54_122_021);
    expect(r.text).toBe(`양도비 등 4,122,021 (중개수수료·법무사 비용 등) — §97① 나목 + ${GIFT} = 54,122,021`);
  });

  it("환산 경로 · 단서 불발(3,000,000 / 5,000,000): 양도비 몫 4,122,020 + 증여세 = 54,122,020", async () => {
    const r = await formulaOf(estimatedBody(estimatedGbv({ capitalExpenditure: 3_000_000, transferExpense: 5_000_000 })));
    expect(r.text).toBe(`양도비 등 4,122,020 (중개수수료·법무사 비용 등) — §97① 나목 + ${GIFT} = 54,122,020`);
  });

  it("증여자 자본적지출 20,000,000(본인 지출 없음): 증여자 자본적지출 20,000,000 + 증여세 = 70,000,000 — 「양도비 등」으로 적지 않는다", async () => {
    const r = await formulaOf(estimatedBody(estimatedGbv({ landCarryoverTaxation: ct({ donorCapitalExpenditure: 20_000_000 }) })));
    expect(r.cellExp).toBe(70_000_000);
    expect(r.text).toBe(`증여자 자본적지출 20,000,000 — 이월과세 §97의2①2호 + ${GIFT} = 70,000,000`);
  });

  it("실가 경로(20,000,000 / 5,000,000): 양도비 몫 4,825,066 + 증여세 = 54,825,066 — 「0 × … = …」 거짓 등식이 아니다", async () => {
    const r = await formulaOf(actualBody(actualGbv({ capitalExpenditure: 20_000_000, transferExpense: 5_000_000 })));
    expect(r.cellExp).toBe(54_825_066);
    expect(r.text).toBe(`양도비 등 4,825,066 (중개수수료·법무사 비용 등) — §97① 나목 + ${GIFT} = 54,825,066`);
  });

  it("증여자 환산 · 본문(증여세 0): 개산공제 1,200,000 = 증여자 취득시 기준시가 40,000,000 × 3% — 카드 자체 기준시가(79,800,000)가 아니다", async () => {
    const donorEst = { landCarryoverTaxation: ct({ useEstimatedAcquisition: true, donorAcquisitionPrice: 0, donorStandardPriceAtAcquisition: 40_000_000, giftTaxAmount: 0 }) };
    const r = await formulaOf(estimatedBody(estimatedGbv(donorEst)));
    expect(r.cellExp).toBe(1_200_000);
    expect(r.text).toBe("개산공제 1,200,000 = 취득시 기준시가 40,000,000 × 3% — 시행령 §163⑥");
  });
});

describe("EXPF-B 비교과세(B) 채택 카드 — 개산공제가 아니라 본인 자본적지출·양도비 (#2676 B-2)", () => {
  it("적용배제(기간초과 2010) · 3,000,000 / 5,000,000: 자본적지출 2,473,212 + 양도비 4,122,020 = 6,595,232", async () => {
    const excluded = { landCarryoverTaxation: ct({ giftRegistryDate: "2010-03-17" }), capitalExpenditure: 3_000_000, transferExpense: 5_000_000 };
    const r = await formulaOf(estimatedBody(estimatedGbv(excluded)));
    expect(r.p.carryoverTaxationDetail.adoptedScenario).toBe("B");
    expect(r.p.necessaryExpense).toBe(6_595_232);
    expect(r.text).toBe("자본적지출 2,473,212 + 양도비 4,122,020 = 6,595,232 (§97① 2호·3호)");
  });
});

describe("EXPF-C 증여자 환산 + 단서 / 채무 매입분 증여분 조각", () => {
  it("증여자 환산 · 단서 발동(150,000,000 / 5,000,000): 칸이 「취득가액 = 환산취득가 37,521,285 · 필요경비 = 역산 140,261,350」이라 구성 항목 대신 산술이 맞는 합계만 적는다", async () => {
    // 손계산: 환산취득가 37,521,285 + 필요경비 140,261,350 = 177,782,635 = 본인 몫 127,782,635 + 증여세 상당액 50,000,000 (A 양도차익 318,454,409 − 177,782,635 = 140,671,774).
    const donorEst = { landCarryoverTaxation: ct({ useEstimatedAcquisition: true, donorAcquisitionPrice: 0, donorStandardPriceAtAcquisition: 40_000_000 }) };
    const r = await formulaOf(estimatedBody(estimatedGbv({ ...donorEst, capitalExpenditure: 150_000_000, transferExpense: 5_000_000 })));
    expect(r.p.carryoverTaxationDetail.scenarioA.necessaryExpenseIsLumpDeduction).toBe(false);
    expect(r.p.acquisitionPrice + r.p.necessaryExpense).toBe(177_782_635);
    expect(r.cellExp).toBe(16_600_736);
    expect(r.text).toBe("필요경비 140,261,350 − 자본적지출 123,660,614(취득가액 칸에 표시) = 16,600,736 (이월과세 §97의2① · §97② 2호 단서 적용)");
  });

  it("채무 매입분 증여분 조각 카드(본인 3,000,003 / 5,000,000): 양도비 1,500,000 + 증여세 상당액 7,200,000 = 8,700,000", async () => {
    // 조각 규칙: 토지 몫 양도비 2,500,000 × 증여분 240,000,000 / 400,000,000 = 1,500,000 · 증여세 30,000,000 × (400,000,000 − 160,000,000) / 1,000,000,000 = 7,200,000.
    const gbv = {
      landArea: 100, buildingArea: 200, buildingFootprintArea: 50, transferLandPricePerSqm: 2_000_000, transferBuildingStdPrice: 200_000_000,
      zoneType: "general_residential", acquisitionLandPricePerSqm: 100_000, acquisitionBuildingStdPrice: 10_000_000,
      buildingAcquisitionCause: "purchase", buildingAcquisitionDate: "2021-03-01", landAcquisitionDate: "2021-03-01", landAcquisitionCause: "carryover_gift",
      carryoverGiftEvent: { giftRegistryDate: "2021-03-01", giftTaxCalculated: 30_000_000, giftTaxBase: 1_000_000_000, donorRelation: "lineal", exclusionDeclared: {} },
      landCarryoverPart: { donorAcquisitionDate: "2005-06-15", donorAcquisitionPrice: 150_000_000, giftDateAssetValue: 400_000_000, giftAssumedDebt: 160_000_000, useEstimatedAcquisition: false },
      capitalExpenditure: 3_000_003, transferExpense: 5_000_000,
    };
    const r = await formulaOf({ ...COMMON, transferDate: "2026-03-01", transferPrice: 1_000_000_000, totalPropertyTransferPrice: 1_000_000_000, acquisitionDate: "2021-03-01", generalBuildingValuation: gbv });
    expect(r.cellExp).toBe(8_700_000);
    expect(r.text).toBe("양도비 등 1,500,000 (중개수수료·법무사 비용 등) — §97① 나목 + 증여세 상당액 7,200,000 — 이월과세 §97의2①3호·시행령 §163의2② = 8,700,000");
  });
});
