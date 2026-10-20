/**
 * 확인 필요 ② — 함께 양도 1세대1주택 단위의 배율 초과분 몫(`resolveUnitExcessShares`)에 **토지 차손 조각**을 넣는다
 * (계획서 `transfer-split-part-loss-offset-p3.plan.md` §2 B안 · 사용자 결정 2026-10-20 「권장안대로」).
 *
 * 기준: 같은 사실을 「주택 1건(토지 전체 · 배율 초과 면적)」으로 넣은 단일 입력 — 기준면적 이내 토지분 = min(0, 안분(전체 토지) − 초과분)
 * (기획재정부 재산세제과-915 회신 식을 부호만 대칭으로 · 조심2016부0323 · P2 §9 A안). 종전 함께 양도는 차손 조각 · 차손 초과분을 몫에서 0으로 버려
 * 한도 내 카드가 자기 차손만 안분했다 — 같은 차손이 초과분(전액)과 이내분(안분)에 이중으로 들어가 세액이 작았다(T1 16,989,500 · 단일 34,149,498).
 *
 * 이익과 차손이 **섞인** 단위는 종전 계산 그대로 두고(해석례 미확인) 확인 필요 고지만 띄운다(Q-U1 B안).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { baseTransferInput } from "../tax-engine/_helpers/mock-rates";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { allocateUnitExcessShares } from "@/lib/tax-engine/high-value-excess-land";

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

const TD = "2026-02-16";
const D = (s: string) => new Date(s);
const rates = loadFallbackTransferRates(new Date(TD));
beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(rates as never);
});

/** 주택 카드 — 정착면적 100㎡ · 수도권 주거지역(배율 3배 → 한도 300㎡) · 1세대1주택 · 거주 5년 · 2014 취득. */
const primary = (house: number, land: number, over: object = {}) => ({
  propertyType: "housing", transferPrice: house, transferDate: TD, acquisitionPrice: house / 2, acquisitionDate: "2014-01-01", acquisitionCause: "purchase",
  expenses: 0, useEstimatedAcquisition: false, householdHousingCount: 1, residencePeriodMonths: 60, isRegulatedArea: false, wasRegulatedAtAcquisition: false,
  isUnregistered: false, isNonBusinessLand: false, isOneHousehold: true, reductions: [], annualBasicDeductionUsed: 0, buildingFootprintArea: 100, isUrbanArea: true,
  appurtenantLandZone: "metropolitan_residential", totalSalePrice: house + land, standardPriceAtTransferForApportion: house / 1000, ...over,
});
const landCard = (price: number, acq: number, over: object = {}) => ({
  assetId: "c1", assetLabel: "부수토지", assetKind: "land", landNature: "appurtenant_to_housing", acquisitionCause: "purchase", acquisitionDate: "2014-01-01",
  fixedAcquisitionPrice: acq, standardPriceAtTransfer: price / 1000, directExpenses: 0, isOneHousehold: true, areaM2: 200, reductions: [], ...over,
});
/** 주택 카드가 자기 토지(분리 파트 200㎡)를 들고, 부수토지 카드 200㎡를 함께 양도 — 합 400㎡ · 한도 300㎡. */
const sepHouse = (bld: number, bldAcq: number, ownLand: number, ownLandAcq: number, compLand: number) =>
  primary(bld + ownLand, compLand, {
    acquisitionPrice: bldAcq + ownLandAcq, isSeparateAcquisition: true, selfOwns: "both", landAcquisitionDate: "2014-01-01",
    landAcqMode: "actual", buildingAcqMode: "actual", saleSplitMode: "actual", landTransferPrice: ownLand, buildingTransferPrice: bld,
    landAcquisitionPrice: ownLandAcq, buildingAcquisitionPrice: bldAcq, acquisitionArea: 200, transferArea: 200,
    landStandardPriceAtTransfer: ownLand, buildingStandardPriceAtTransfer: bld,
  });

type Prop = { propertyId: string; transferGain: number; income: number; longTermHoldingDeduction: number };
type Agg = { totalTax: number; warnings?: string[]; properties: Prop[] };
async function post(body: object): Promise<Agg> {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  );
  const json = (await res.json()) as { data?: { aggregated: Agg }; error?: unknown };
  expect(res.status, JSON.stringify(json.error)).toBe(200);
  return json.data!.aggregated;
}
/** 단위 카드들의 과세 양도차익 합계(양도소득금액 + 장특). */
const sumTg = (a: Agg) => a.properties.reduce((n, q) => n + q.income + q.longTermHoldingDeduction, 0);

/** 같은 사실의 단일 입력 — 주택 1건 · 토지 전체(면적 area) · 토지·건물 분리 실가. */
const single = (house: number, landP: number, landAcq: number, area: number, houseAcq = house / 2) =>
  calculateTransferTax(
    baseTransferInput({
      propertyType: "housing", transferPrice: house + landP, acquisitionPrice: houseAcq + landAcq, transferDate: D(TD), acquisitionDate: D("2014-01-01"),
      landAcquisitionDate: D("2014-01-01"), isSeparateAcquisition: true, landAcqMode: "actual", buildingAcqMode: "actual", landTransferPrice: landP,
      buildingTransferPrice: house, landAcquisitionPrice: landAcq, buildingAcquisitionPrice: houseAcq, landStandardPriceAtTransfer: landP,
      buildingStandardPriceAtTransfer: house, buildingFootprintArea: 100, acquisitionArea: area, appurtenantLandZone: "metropolitan_residential",
      residencePeriodMonths: 60, isOneHousehold: true, householdHousingCount: 1, annualBasicDeductionUsed: 0, expenses: 0,
    } as never),
    rates,
  );

const LOSS_NOTICE = "부수토지가 모두 양도차손이라 같은 식을 부호만 바꿔 적용했습니다";
const MIXED_NOTICE = "양도차익과 양도차손이 섞여 있어";
const has = (a: Agg, s: string) => (a.warnings ?? []).some((w) => w.includes(s));

describe("확인 필요 ② — 단위 몫 leaf: 토지 차손 단위는 부호만 대칭", () => {
  it("음수 초과분은 |조각|으로 |X|를 나눈 몫에 음수 부호 — Σ몫 = X · 양수 입력은 종전 값", () => {
    expect(allocateUnitExcessShares([-100, -200, -300], -1000)).toEqual([-166, -333, -501]);
    expect(allocateUnitExcessShares([-777], -123)).toEqual([-123]);
    expect(allocateUnitExcessShares([100, 200, 300], 1000)).toEqual([166, 333, 501]);
  });
});

describe("확인 필요 ② — 토지가 모두 차손이면 함께 양도 = 단일 입력", () => {
  it.each([
    // 이름, 주택가, 토지가, 토지 취득가, 면적, Σtg(고정)
    ["S1 20억 · 토지 −2억 · 700㎡ (종전 11,428,571)", 800_000_000, 1_200_000_000, 1_400_000_000, 700, 45_714_285],
    ["S1b 20억 · 토지 −2억 · 500㎡ (종전 32,000,000)", 800_000_000, 1_200_000_000, 1_400_000_000, 500, 80_000_000],
    ["S2 15억 · 토지 −1억 (종전 −5,714,285)", 600_000_000, 900_000_000, 1_000_000_000, 700, 2_857_143],
    ["S4 20억 · 토지 −6억 · 자산 전체 차손 (종전 −285,714,285)", 800_000_000, 1_200_000_000, 1_800_000_000, 700, -182_857_143],
  ] as const)("%s", async (_n, h, l, acq, area, expected) => {
    const a = await post({ ...primary(h, l), companionAssets: [landCard(l, acq, { areaM2: area })] });
    const s = single(h, l, acq, area);
    expect(sumTg(a)).toBe(expected);
    expect(Math.abs(sumTg(a) - s.taxableGain)).toBeLessThanOrEqual(2);
    expect(has(a, LOSS_NOTICE)).toBe(true);
    expect(has(a, MIXED_NOTICE)).toBe(false);
  }, 60_000);

  it.each([
    ["T1 25억(주택 15억 · 취득 3억) · 토지 −2억 · 700㎡ (종전 16,989,500)", 1_200_000_000, 700, 34_149_500],
    ["T2 25억 · 토지 −0.5억 · 500㎡ (종전 66,473,000)", 1_050_000_000, 500, 70_485_800],
  ] as const)("%s — 세액 = 단일 입력(±2원)", async (_n, acq, area, tax) => {
    const a = await post({ ...primary(1_500_000_000, 1_000_000_000, { acquisitionPrice: 300_000_000 }), companionAssets: [landCard(1_000_000_000, acq, { areaM2: area })] });
    const s = single(1_500_000_000, 1_000_000_000, acq, area, 300_000_000);
    expect(a.totalTax).toBe(tax);
    expect(Math.abs(a.totalTax - s.totalTax)).toBeLessThanOrEqual(2);
  }, 60_000);

  it("H3 주택 자기 토지 −1억 + 부수토지 카드 −1억 → 주택 카드도 음수 몫을 받아 단일과 같다 (종전 37,500,000)", async () => {
    const a = await post({ ...sepHouse(800_000_000, 300_000_000, 400_000_000, 500_000_000, 400_000_000), companionAssets: [landCard(400_000_000, 500_000_000)] });
    expect(sumTg(a)).toBe(75_000_000);
    expect(sumTg(a)).toBe(single(800_000_000, 800_000_000, 1_000_000_000, 400, 300_000_000).taxableGain);
    expect(has(a, LOSS_NOTICE)).toBe(true);
  }, 60_000);

  it("필지 두 장이 모두 차손 — 단일과 같고 입력 순서와 무관", async () => {
    const c1 = landCard(300_000_000, 400_000_000, { assetId: "c1" });
    const c2 = landCard(300_000_000, 450_000_000, { assetId: "c2" });
    const a = await post({ ...primary(1_400_000_000, 600_000_000), companionAssets: [c1, c2] });
    const b = await post({ ...primary(1_400_000_000, 600_000_000), companionAssets: [c2, c1] });
    expect(Math.abs(sumTg(a) - single(1_400_000_000, 600_000_000, 850_000_000, 400).taxableGain)).toBeLessThanOrEqual(2);
    expect(b.totalTax).toBe(a.totalTax);
    expect(sumTg(b)).toBe(sumTg(a));
  }, 60_000);
});

describe("확인 필요 ② — 이익과 차손이 섞이면 종전 계산 그대로 + 확인 필요 고지(Q-U1 B안)", () => {
  const twoParcels = (h: number, [p1, p2]: [number, number], [a1, a2]: [number, number], reverse = false) => {
    const cards = [landCard(p1, a1, { assetId: "c1" }), landCard(p2, a2, { assetId: "c2" })];
    return { ...primary(h, p1 + p2), companionAssets: reverse ? cards.reverse() : cards };
  };
  it.each([
    ["M1 14억 · 필지1 +2억 · 필지2 −1억", 800_000_000, [300_000_000, 300_000_000], [100_000_000, 400_000_000], 71_428_572, 2_649_428],
    ["M2 14억 · 필지1 +0.5억 · 필지2 −2억", 800_000_000, [300_000_000, 300_000_000], [250_000_000, 500_000_000], -1_785_714, 0],
    ["M3 20억 · 필지1 +4억 · 필지2 −1억", 1_100_000_000, [600_000_000, 300_000_000], [200_000_000, 400_000_000], 325_000_000, 33_258_500],
  ] as const)("%s", async (_n, h, p, acq, tg, tax) => {
    const a = await post(twoParcels(h, [...p], [...acq]));
    expect(sumTg(a)).toBe(tg);
    expect(a.totalTax).toBe(tax);
    expect(has(a, MIXED_NOTICE)).toBe(true);
    expect(has(a, LOSS_NOTICE)).toBe(false);
    const b = await post(twoParcels(h, [...p], [...acq], true));
    expect(b.totalTax).toBe(tax);
  }, 60_000);

  it.each([
    ["H1 주택 자기 토지 +2억 · 카드 −1억", 200_000_000, 500_000_000, 112_500_000, 330_000],
    ["H2 주택 자기 토지 −1억 · 카드 +2억", 500_000_000, 200_000_000, 200_000_000, 23_892_000],
  ] as const)("%s", async (_n, ownAcq, cardAcq, tg, tax) => {
    const a = await post({ ...sepHouse(800_000_000, 300_000_000, 400_000_000, ownAcq, 400_000_000), companionAssets: [landCard(400_000_000, cardAcq)] });
    expect(sumTg(a)).toBe(tg);
    expect(a.totalTax).toBe(tax);
    expect(has(a, MIXED_NOTICE)).toBe(true);
  }, 60_000);
});

describe("확인 필요 ② — 불변 회귀선", () => {
  it("S0 토지 이익 · H4 둘 다 이익 → 종전 값, 차손·혼합 고지 없음", async () => {
    const s0 = await post({ ...primary(800_000_000, 1_200_000_000), companionAssets: [landCard(1_200_000_000, 600_000_000, { areaM2: 700 })] });
    expect(s0.totalTax).toBe(124_887_713);
    const h4 = await post({ ...sepHouse(800_000_000, 300_000_000, 400_000_000, 200_000_000, 400_000_000), companionAssets: [landCard(400_000_000, 200_000_000)] });
    expect(h4.totalTax).toBe(30_563_500);
    for (const a of [s0, h4]) {
      expect(has(a, LOSS_NOTICE)).toBe(false);
      expect(has(a, MIXED_NOTICE)).toBe(false);
    }
  }, 60_000);

  it("S3 12억 이하(전액 비과세) · 토지 차손 → 몫 없음, 초과분 차손만 남는다", async () => {
    const a = await post({ ...primary(300_000_000, 850_000_000), companionAssets: [landCard(850_000_000, 950_000_000, { areaM2: 700 })] });
    expect(sumTg(a)).toBe(-57_142_857);
    expect(has(a, LOSS_NOTICE)).toBe(false);
  }, 60_000);
});
