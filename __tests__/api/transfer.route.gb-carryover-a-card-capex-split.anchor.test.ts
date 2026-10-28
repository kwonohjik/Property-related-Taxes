/**
 * anchor — 이월과세(§97의2) 시나리오 A 일반건물 카드: 신고서·명세서 「취득가액」 칸으로 옮겨 얹는 몫은 본인 **자본적지출**만이다 (양도비 몫 제외).
 *
 * 계획서 `docs/00-pm/carryover-a-gb-card-filing-acq-cell-label.plan.md` §2·§5.1 (결정 Q-1 O1 · Q-2).
 *
 * ## 결함 (수정 前 실측)
 * 카드가 본인 직접귀속 나목(자본적지출 + 양도비)을 `capitalExpenditure` 한 칸에 합산해 싣는다 → 표시 leaf(`capExInAcquisitionColumn`)가 그 합을 취득가액 칸으로 옮긴다.
 * 양도비만 5,000,000 을 입력해도 토지 취득가액 칸이 50,000,000 → 54,122,020 이 되고, 명세서 취득가액 산식은 「50,000,000」만 적어 값과 어긋난다.
 *
 * ## 손계산 (독립 — 환산 카드 (환산취득가 + 개산공제) 비례: 토지 77,248,965 : 건물 16,453,826, 합 93,702,791)
 * 자본적지출 3,000,000 → 토지 floor(3,000,000 × 77,248,965 / 93,702,791) = 2,473,212.
 * 양도비 5,000,000 → 토지 floor(5,000,000 × 77,248,965 / 93,702,791) = 4,122,020.
 * 합산 8,000,000 → 토지 6,595,232 (= 2,473,212 + 4,122,020).
 * 자본적지출 150,000,000 → 123,660,614 · 양도비 5,000,000 → 4,122,020 합 127,782,634 ≠ 합산 몫 127,782,635 — 1원은 **양도비 몫이 흡수한다**(필요경비 합계 불변).
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
import { buildGbAcquisitionFormula } from "@/components/calc/results/transfer/DetailedStatementGbFormulas";
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


async function cardOf(body: object, id = "land") {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }));
  const json = await res.json();
  expect(res.status, JSON.stringify(json.error)).toBe(200);
  const a = json.data.aggregated;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = a.properties.find((x: any) => x.propertyId === id);
  const shift = capExInAcquisitionColumnOfProperty(p);
  return { tax: a.determinedTax as number, p, shift, cellAcq: p.acquisitionPrice + shift, cellExp: Math.max(0, p.necessaryExpense - shift) };
}
const landOf = (body: object) => cardOf(body, "land");
const exp = (capex: number, tr: number) => ({ ...(capex ? { capitalExpenditure: capex } : {}), ...(tr ? { transferExpense: tr } : {}) });

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

describe("CS-1 환산 경로 × 토지 이월과세 — 취득가액 칸 이동분은 자본적지출 몫만", () => {
  // [자본적지출, 양도비, 이동분(자본적지출 몫), 필요경비 칸 = 증여세 50,000,000 + 양도비 몫, 결정세액(수정 前 현행 실측 = 後 불변 — 앞 줄 외 3건은 GBCO-1 과 같은 값)]
  it.each([
    [0, 5_000_000, 0, 50_000_000 + 4_122_020, 34_478_553],
    [3_000_000, 0, 2_473_212, 50_000_000, 34_882_511],
    [3_000_000, 5_000_000, 2_473_212, 50_000_000 + 4_122_020, 33_872_616],
    [150_000_000, 5_000_000, 123_660_614, 50_000_000 + 4_122_021, 5_534_770],
  ])("자본적지출 %i · 양도비 %i → 이동분 %i · 필요경비 칸 %i", async (capex, tr, shift, expCell, tax) => {
    const r = await landOf(estimatedBody(estimatedGbv(exp(capex, tr))));
    expect(r.shift).toBe(shift);
    expect(r.cellAcq).toBe(50_000_000 + shift);
    expect(r.cellExp).toBe(expCell);
    expect(r.tax).toBe(tax);
    // 항등식 — 양도가액 − (취득가액 칸 + 필요경비 칸) = 양도차익 (카드 단위)
    expect(r.p.transferPrice - r.cellAcq - r.cellExp).toBe(r.p.transferGain);
  });

  it("필요경비 합계는 수정 前과 같다 — 자본적지출·양도비를 합한 값(= 합산 몫)이다", async () => {
    const r = await landOf(estimatedBody(estimatedGbv(exp(3_000_000, 5_000_000))));
    expect(r.p.necessaryExpense).toBe(50_000_000 + 6_595_232);
  });
});

describe("CS-2 명세서 취득가액 산식 — 값과 같은 수를 적는다", () => {
  it.each([
    [0, 5_000_000, 54_122_020 - 4_122_020],
    [3_000_000, 0, 50_000_000 + 2_473_212],
    [3_000_000, 5_000_000, 50_000_000 + 2_473_212],
  ])("자본적지출 %i · 양도비 %i → 값(취득가액 칸) %i", async (capex, tr, value) => {
    const r = await landOf(estimatedBody(estimatedGbv(exp(capex, tr))));
    expect(r.cellAcq).toBe(value);
    const text = buildGbAcquisitionFormula(r.p, undefined, undefined, undefined) ?? "";
    if (r.shift > 0) expect(text).toContain(`자본적지출 ${r.shift.toLocaleString()}`);
    else expect(text).not.toContain("자본적지출");
  });
});

describe("CS-3 실가 경로 — 자본적지출은 취득시 기준시가, 양도비는 양도시 기준시가 비례로 따로 나뉜 뒤 합쳐지던 값을 그대로 가른다", () => {
  // 자본적지출 20,000,000 × 79,800,000 / 96,797,190 = 16,488,081 · 양도비 5,000,000 × 339,492,000 / 351,800,310 = 4,825,066 (합 21,313,147 = 수정 前 카드 몫)
  it("20,000,000 / 5,000,000 → 이동분 16,488,081 · 필요경비 칸 = 증여세 50,000,000 + 양도비 4,825,066", async () => {
    const r = await landOf(actualBody(actualGbv(exp(20_000_000, 5_000_000))));
    expect(r.p.necessaryExpense).toBe(50_000_000 + 16_488_081 + 4_825_066);
    expect(r.shift).toBe(16_488_081);
    expect(r.cellExp).toBe(50_000_000 + 4_825_066);
    expect(r.p.transferPrice - r.cellAcq - r.cellExp).toBe(r.p.transferGain);
  });

  it("양도비만 5,000,000 → 이동분 0 (전액 필요경비 칸)", async () => {
    const r = await landOf(actualBody(actualGbv(exp(0, 5_000_000))));
    expect(r.shift).toBe(0);
    expect(r.cellAcq).toBe(50_000_000);
  });

  it("legacy 한 덩어리 `expenses`(자본적지출·양도비로 나눌 근거 없음) → 이동분 0 — 전액 필요경비 칸 (접기 경로와 같은 표시)", async () => {
    const body = actualBody(actualGbv());
    const r = await landOf({ ...body, expenses: 10_000_000 });
    expect(r.shift).toBe(0);
    expect(r.p.necessaryExpense).toBeGreaterThan(50_000_000); // 본인 몫은 여전히 필요경비에 들어간다
    expect(r.cellExp).toBe(r.p.necessaryExpense);
  });
});

describe("CS-4 지분(%) 분할 — 지분 카드도 자본적지출 몫만 이동한다", () => {
  const level = { landArea: 100, buildingArea: 200, buildingFootprintArea: 50, transferLandPricePerSqm: 2_000_000, transferBuildingStdPrice: 200_000_000, zoneType: "general_residential" };
  const valuation = (acqL: number, acqB: number, o: object = {}) => ({ ...level, acquisitionLandPricePerSqm: acqL, acquisitionBuildingStdPrice: acqB, buildingAcquisitionCause: "purchase", ...o });
  const carry = { landAcquisitionCause: "carryover_gift", landCarryoverTaxation: { giftRegistryDate: "2021-03-01", donorAcquisitionDate: "2005-06-15", donorAcquisitionPrice: 60_000_000, useEstimatedAcquisition: false, giftTaxAmount: 12_000_000, giftDateValuation: 160_000_000 } };
  const shareA = { shareId: "a", shareLabel: "60%", ownershipRatio: 0.6, acquisitionDate: "2009-03-01", valuation: valuation(1_000_000, 100_000_000) };
  const shareB = (o: object) => ({ shareId: "b", shareLabel: "40%", ownershipRatio: 0.4, acquisitionDate: "2021-03-01", valuation: valuation(1_500_000, 150_000_000, { ...carry, ...o }) });
  const body = (shares: object[]) => ({
    ...COMMON, transferDate: "2024-03-01", acquisitionDate: "2009-03-01", transferPrice: 1_000_000_000, totalPropertyTransferPrice: 1_000_000_000,
    generalBuildingValuation: (shares[0] as { valuation: object }).valuation, generalBuildingShares: shares,
  });

  it("자본적지출 10,000,000 · 양도비 3,000,000 → 지분 B 토지: 필요경비 12,000,000(증여세) + 6,500,000 · 이동분 5,000,000(자본적지출 몫 — 토지 가액 50%) · 필요경비 칸 12,000,000 + 1,500,000", async () => {
    const r = await cardOf(body([shareA, shareB({ capitalExpenditure: 10_000_000, transferExpense: 3_000_000 })]), "land#1");
    expect(r.p.necessaryExpense).toBe(12_000_000 + 6_500_000);
    expect(r.shift).toBe(5_000_000);
    expect(r.cellExp).toBe(12_000_000 + 1_500_000);
  });
});

describe("CS-5 당초 증여 채무 매입분 조각 — 증여분 카드의 이동분은 자본적지출 증여분 몫이다", () => {
  // GBCO-7(b) 와 같은 픽스처: 토지 몫 자본적지출 floor(3,000,003 × 25,300,000 / 50,600,000) = 1,500,001 · 양도비 2,500,000 (합 4,000,001 — 합산 실행과 같다).
  // 증여분 = floor(몫 × 240,000,000 / 400,000,000): 자본적지출 floor(900,000.6) = 900,000 · 양도비 1,500,000 (합 2,400,000 = GBCO-7(b) 증여분 필요경비).
  const gbvWire = (extra: object) => ({
    landArea: 100, buildingArea: 200, buildingFootprintArea: 50, transferLandPricePerSqm: 2_000_000, transferBuildingStdPrice: 200_000_000,
    zoneType: "general_residential", acquisitionLandPricePerSqm: 100_000, acquisitionBuildingStdPrice: 10_000_000,
    buildingAcquisitionCause: "purchase", buildingAcquisitionDate: "2021-03-01", landAcquisitionDate: "2021-03-01", landAcquisitionCause: "carryover_gift",
    carryoverGiftEvent: { giftRegistryDate: "2021-03-01", giftTaxCalculated: 30_000_000, giftTaxBase: 1_000_000_000, donorRelation: "lineal", exclusionDeclared: {} },
    landCarryoverPart: { donorAcquisitionDate: "2005-06-15", donorAcquisitionPrice: 150_000_000, giftDateAssetValue: 400_000_000, giftAssumedDebt: 160_000_000, useEstimatedAcquisition: false },
    ...extra,
  });
  it("증여분 카드: 이동분 900,000 · 필요경비 칸 = 증여세 7,200,000 + 양도비 1,500,000 · 결정세액 215,879,400(GBCO-7 b 와 같다)", async () => {
    const body = { ...COMMON, transferDate: "2026-03-01", transferPrice: 1_000_000_000, totalPropertyTransferPrice: 1_000_000_000, acquisitionDate: "2021-03-01", generalBuildingValuation: gbvWire(exp(3_000_003, 5_000_000)) };
    const r = await cardOf(body, "land");
    expect(r.p.necessaryExpense).toBe(7_200_000 + 2_400_000);
    expect(r.shift).toBe(900_000);
    expect(r.cellExp).toBe(7_200_000 + 1_500_000);
    expect(r.tax).toBe(215_879_400);
  });
});
