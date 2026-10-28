/**
 * 함께 양도 × 부수토지 카드 — 짝 주택의 다주택 중과(§104⑦)·장특 배제(§95②)를 카드가 따른다
 * (계획서 `docs/02-design/features/bundled-appurtenant-card-multi-house-surcharge.plan.md` · Q-1 a · Q-2 a · Q-3 a).
 *
 * 중과 주택을 부수토지와 함께 양도하면 주택 카드는 기본세율 +20%p(3주택 이상 +30%p)와 장특 배제를 받는데, 부수토지 카드는 짝 주택 판정 채널
 * (`appurtenantHouseVerdict`)에 중과 판정이 없어 누진세율 · 표1 장특을 받았다 — 같은 사실을 한 카드로 합쳐 입력한 값과 달랐다.
 *
 * 시료(독립 정수 산식): 20억 고가 · 주택 2014-01-01 · 수도권 주거지역 3배 · 정착면적 100㎡ · 2주택·조정대상지역 · 양도일 2026-06-15(한시 배제 이후).
 *   주택 카드 자기 토지 100㎡ + 부수토지 카드 100㎡(양도차익 200,000,000, 한 장 `c1`). 주 카드 양도차익 900,000,000(토지만 본인이면 400,000,000).
 *   중과 세액 = 기본세율 산출세액 + 과세표준 × 20%p(3주택 이상 30%p) · 지방소득세 10% · 기본공제 2,500,000.
 *   기본세율: 5억 초과 10억 이하 42%(누진공제 35,940,000) · 10억 초과 45%(누진공제 65,940,000).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { postTransfer } from "../calc/_helpers/redev-one-house-route";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const SAME = { selfOwns: "land_only", buildingOwnerSameHousehold: true, buildingOwnerHouseholdMerged: false };
const OTHER = { selfOwns: "land_only", buildingOwnerSameHousehold: false };
const ZONE = { buildingFootprintArea: 100, isUrbanArea: true, appurtenantLandZone: "metropolitan_residential" };

const landCompanion = (id: string, areaM2: number, acquisitionDate = "2014-01-01", extra: Loose = {}) => ({
  assetId: id, assetLabel: "부수토지", assetKind: "land", landNature: "appurtenant_to_housing", acquisitionCause: "purchase", acquisitionDate,
  fixedAcquisitionPrice: 200_000_000, standardPriceAtTransfer: 400_000, directExpenses: 0, isOneHousehold: true, areaM2, reductions: [], ...extra,
});

/** 순방향 — 주택이 첫 자산: 건물 8억(취득 3억) · 자기 토지 8억(취득 4억) 200㎡ · 부수토지 카드 4억(취득 2억) */
const forward = (over: Loose) => ({
  propertyType: "housing", transferPrice: 1_600_000_000, transferDate: "2026-02-16", acquisitionPrice: 700_000_000, acquisitionDate: "2014-01-01",
  acquisitionCause: "purchase", expenses: 0, useEstimatedAcquisition: false, householdHousingCount: 1, residencePeriodMonths: 60, isRegulatedArea: false,
  wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, isOneHousehold: true, reductions: [], annualBasicDeductionUsed: 0,
  ...ZONE, totalSalePrice: 2_000_000_000, standardPriceAtTransferForApportion: 1_600_000, isSeparateAcquisition: true, landAcquisitionDate: "2014-01-01",
  landAcqMode: "actual", buildingAcqMode: "actual", saleSplitMode: "actual", landTransferPrice: 800_000_000, buildingTransferPrice: 800_000_000,
  landAcquisitionPrice: 400_000_000, buildingAcquisitionPrice: 300_000_000, acquisitionArea: 200, transferArea: 200,
  landStandardPriceAtTransfer: 800_000_000, buildingStandardPriceAtTransfer: 800_000_000,
  companionAssets: [landCompanion("c1", 200)],
  ...over,
});

type Card = { propertyId: string; transferGain: number; income: number; longTermHoldingDeduction: number; warnings?: string[] };
type Agg = { totalTax: number; warnings?: string[]; properties: Card[] };
async function agg(body: Loose): Promise<Agg> {
  const res = await postTransfer(body);
  expect(res.status, JSON.stringify((res.json as Loose).error)).toBe(200);
  return (res.json as Loose).data.aggregated as Agg;
}
const card = (a: Agg, id: string) => a.properties.find((c) => c.propertyId === id)!;


type Card2 = Card & { appliedRate?: number; rateClause?: string };
const c2 = (a: Agg, id: string) => card(a, id) as Card2;

const TWO = { householdHousingCount: 2, isRegulatedArea: true, wasRegulatedAtAcquisition: true, transferDate: "2026-06-15" };
const THREE = { ...TWO, householdHousingCount: 3 };
const oneLand = { acquisitionArea: 100, transferArea: 100, companionAssets: [landCompanion("c1", 100)] };
/** 같은 사실을 주택 카드 하나로 합쳐 입력(토지 200㎡ 포함) — 양도 20억 · 취득 9억 */
const MERGED = { acquisitionArea: 200, transferArea: 200, companionAssets: [] as Loose[], transferPrice: 2_000_000_000, acquisitionPrice: 900_000_000, landTransferPrice: 1_200_000_000, landAcquisitionPrice: 600_000_000 };
/** 주택·주 카드 토지 2025-01-01 취득(양도 시 1년 5개월) · 부수토지 카드 */
const SHORT_HOUSE = { acquisitionDate: "2025-01-01", landAcquisitionDate: "2025-01-01" };
async function singleTotal(body: Loose): Promise<number> {
  const res = await postTransfer(body);
  expect(res.status, JSON.stringify((res.json as Loose).error)).toBe(200);
  return (res.json as Loose).data.result.totalTax as number;
}
const surchargeNotices = (a: Agg) => (a.warnings ?? []).filter((w) => w.includes("부수토지 카드") && w.includes("다주택 중과"));

describe("순방향 — 부수토지 카드가 짝 주택의 중과·장특 배제를 따른다", () => {
  it("🔑 A1 소유자 같음 · 2주택 · 한 장: c1 장특 0 · 소득 200,000,000 · 58%(104-7-1) · 합계 712,178,500 = 합쳐 입력 (수정 전 38% · 장특 48,000,000 · 614,163,000)", async () => {
    const a = await agg(forward({ ...TWO, ...oneLand }));
    const c = c2(a, "c1");
    expect([c.longTermHoldingDeduction, c.income, c.appliedRate, c.rateClause]).toEqual([0, 200_000_000, 0.58, "104-7-1"]);
    // 1,097,500,000 × 45% − 65,940,000 = 427,935,000 + 1,097,500,000 × 20% = 219,500,000 → 647,435,000 → ×1.1
    expect(a.totalTax).toBe(712_178_500);
    expect(await singleTotal(forward({ ...TWO, ...MERGED }))).toBe(712_178_500);
  });

  it("🔑 A2 토지만 본인 · 같은 세대: 합계 367,961,000 (수정 전 275,418,000)", async () => {
    const a = await agg(forward({ ...SAME, ...TWO, ...oneLand }));
    expect([c2(a, "c1").longTermHoldingDeduction, c2(a, "c1").rateClause]).toEqual([0, "104-7-1"]);
    // 597,500,000 × 42% − 35,940,000 = 215,010,000 + 597,500,000 × 20% = 119,500,000 → 334,510,000 → ×1.1
    expect(a.totalTax).toBe(367_961_000);
  });

  it("🔑 A3 3주택: c1 68%(104-7-3) · 합계 832,903,500 = 합쳐 입력 (수정 전 712,888,000)", async () => {
    const a = await agg(forward({ ...THREE, ...oneLand }));
    expect([c2(a, "c1").appliedRate, c2(a, "c1").rateClause]).toEqual([0.68, "104-7-3"]);
    // 427,935,000 + 1,097,500,000 × 30% = 329,250,000 → 757,185,000 → ×1.1
    expect(a.totalTax).toBe(832_903_500);
    expect(await singleTotal(forward({ ...THREE, ...MERGED }))).toBe(832_903_500);
  });

  it("🔑 A4 이내분·초과분 분리: c1__appurtenant 장특 0 · 합계 662,849,000 · 초과분 c1__excess는 비사업용 표1 그대로(장특 24,000,000 · 소득 76,000,000)", async () => {
    const a = await agg(forward({ ...TWO }));
    expect([c2(a, "c1__appurtenant").longTermHoldingDeduction, c2(a, "c1__appurtenant").rateClause]).toEqual([0, "104-7-1"]);
    expect([c2(a, "c1__excess").longTermHoldingDeduction, c2(a, "c1__excess").income]).toEqual([24_000_000, 76_000_000]);
    // 중과 몫 (900,000,000 + 100,000,000 − 2,500,000) × 42% − 35,940,000 = 383,010,000 + 199,500,000 = 582,510,000 + 초과분 11,240,000 + (76,000,000 − 50,000,000) × 34% = 20,080,000 → ×1.1
    expect(a.totalTax).toBe(662_849_000);
  });

  it("🔑 A5 옛 토지(2014)에 신축한 단기 보유 주택 — 카드 보유기간은 짝 주택 기준: 2주택 724,350,000 · 3주택 832,903,500 · 카드 장특 0 (수정 전 692,670,000 · 771,606,000)", async () => {
    const two = await agg(forward({ ...TWO, ...SHORT_HOUSE, ...oneLand }));
    expect(c2(two, "c1").longTermHoldingDeduction).toBe(0);
    // 단기 60%(1,097,500,000 × 60% = 658,500,000)가 중과 647,435,000보다 크다 → ×1.1
    expect(two.totalTax).toBe(724_350_000);
    const three = await agg(forward({ ...THREE, ...SHORT_HOUSE, ...oneLand }));
    expect(three.totalTax).toBe(832_903_500);
  });
});

describe("한시 배제 · 비부수토지 · 수동 지정", () => {
  it("🔑 A8a 한시 배제 양도일(2026-02-16, 보유 2년 이상): 짝 주택이 중과를 안 받으니 카드도 안 받는다 — c1 장특 48,000,000 · 38% · 합계 345,543,000 · 고지 없음", async () => {
    const a = await agg(forward({ ...TWO, ...oneLand, transferDate: "2026-02-16" }));
    expect([c2(a, "c1").longTermHoldingDeduction, c2(a, "c1").appliedRate]).toEqual([48_000_000, 0.38]);
    // (900,000,000 − 216,000,000 + 200,000,000 − 48,000,000 − 2,500,000) = 833,500,000 × 42% − 35,940,000 = 314,130,000 → ×1.1
    expect(a.totalTax).toBe(345_543_000);
    expect(surchargeNotices(a)).toEqual([]);
  });

  it("A8b 부수토지가 아닌 토지 컴패니언(non_appurtenant)은 주택이 아니라 중과를 받지 않는다 — c1 장특 48,000,000 · 38% · 합계 614,163,000(수정 전후 같다)", async () => {
    const nonApp = { acquisitionArea: 100, transferArea: 100, companionAssets: [landCompanion("c1", 100, "2014-01-01", { landNature: "non_appurtenant" })] };
    const a = await agg(forward({ ...TWO, ...nonApp }));
    expect([c2(a, "c1").longTermHoldingDeduction, c2(a, "c1").appliedRate]).toEqual([48_000_000, 0.38]);
    expect(a.totalTax).toBe(614_163_000);
  });

  it("A8c Q-2 a 수동 세율 지정(70%)은 중과 카드에서도 존중한다: c1 70% · 수동 지정 문구 · 장특 0", async () => {
    const body = { ...TWO, acquisitionArea: 100, transferArea: 100, companionAssets: [landCompanion("c1", 100, "2014-01-01", { manualHoldingPeriodOverride: "shortTermHousing70" })] };
    const c = c2(await agg(forward(body)), "c1") as Card2 & { shortTermNote?: string };
    expect([c.appliedRate, c.shortTermNote, c.longTermHoldingDeduction]).toEqual([0.7, "수동 지정: 70%", 0]);
  });
});

describe("불변 — 중과 대상이 아닌 구성", () => {
  it("A6 다른 세대 · 주택 1채 · 주택·카드 같은 날 단기(60%가 중과보다 크다)는 수정 전과 같다", async () => {
    expect((await agg(forward({ ...OTHER, ...TWO, ...oneLand }))).totalTax).toBe(171_006_000);
    expect((await agg(forward({ ...oneLand }))).totalTax).toBe(50_589_000);
    const sameDay = { ...SHORT_HOUSE, companionAssets: [landCompanion("c1", 100, "2025-01-01")], acquisitionArea: 100, transferArea: 100 };
    expect((await agg(forward({ ...TWO, ...sameDay }))).totalTax).toBe(724_350_000);
    expect((await agg(forward({ ...OTHER, ...TWO, ...sameDay }))).totalTax).toBe(262_900_000);
  });
});

describe("역방향 — 첫 자산이 부수토지 (같은 사실을 주택 먼저/토지 먼저 넣으면 총세액이 같다 — K1 등가)", () => {
  // 순·역 등가 시료: 주택 1,600,000,000(취득 800,000,000) · 주택 카드 자기 토지 200㎡ · 부수토지 400,000,000(취득 200,000,000) 200㎡ · 2주택·조정 · 2026-06-15
  const EQ_COMMON = {
    transferDate: "2026-06-15", acquisitionDate: "2014-01-01", acquisitionCause: "purchase", expenses: 0, useEstimatedAcquisition: false, residencePeriodMonths: 60,
    isRegulatedArea: true, wasRegulatedAtAcquisition: true, isUnregistered: false, isNonBusinessLand: false, reductions: [], annualBasicDeductionUsed: 0,
    isOneHousehold: true, householdHousingCount: 2,
  };
  const EQ_LAND = (id: string) => ({
    assetId: id, assetLabel: `부수토지 ${id}`, assetKind: "land", landNature: "appurtenant_to_housing", acquisitionCause: "purchase", acquisitionDate: "2014-01-01",
    fixedAcquisitionPrice: 200_000_000, standardPriceAtTransfer: 400_000, directExpenses: 0, isOneHousehold: true, areaM2: 200, reductions: [],
  });
  const eqForward = () => ({
    ...EQ_COMMON, ...ZONE, propertyType: "housing", transferPrice: 1_600_000_000, acquisitionPrice: 800_000_000, acquisitionArea: 200,
    totalSalePrice: 2_000_000_000, standardPriceAtTransferForApportion: 1_600_000, companionAssets: [EQ_LAND("c1")],
  });
  const eqReverse = () => ({
    ...EQ_COMMON, propertyType: "land", landNature: "appurtenant_to_housing", transferPrice: 400_000_000, acquisitionPrice: 200_000_000, acquisitionArea: 200, transferArea: 200,
    totalSalePrice: 2_000_000_000, standardPriceAtTransferForApportion: 400_000,
    companionAssets: [{
      assetId: "h1", assetLabel: "주택", assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2014-01-01", fixedAcquisitionPrice: 800_000_000,
      standardPriceAtTransfer: 1_600_000, directExpenses: 0, isOneHousehold: true, reductions: [], ...ZONE,
      companionHousingLand: { landAreaM2: 200, footprintM2: 100, zone: "metropolitan_residential" },
    }],
  });

  it("🔑 A7 순·역 총세액 594,649,000 (수정 전 540,177,000) · 부수토지 카드 장특 0 · 104-7-1 / 짝 주택 h1은 그대로", async () => {
    const f = await agg(eqForward());
    const r = await agg(eqReverse());
    expect(c2(r, "primary__appurtenant").longTermHoldingDeduction).toBe(0);
    expect(c2(r, "primary__appurtenant").rateClause).toBe("104-7-1");
    expect(c2(f, "c1__appurtenant").longTermHoldingDeduction).toBe(0);
    // 순·역 등가가 독립 기준이다 — 짝 주택 몫은 #2668 O-8 한계(독립 재도출 불가)라 합계 값은 측정 일치로만 고정한다.
    expect(r.totalTax).toBe(f.totalTax);
    expect(r.totalTax).toBe(594_649_000);
  });

  it("A9 고지 — 역방향 부수토지 카드에도 1건", async () => {
    expect(surchargeNotices(await agg(eqReverse())).length).toBe(1);
  });
});

describe("고지 — 중과 규정을 카드에도 적용했다(Q-3 a)", () => {
  it("목록 없는 원시 플래그 중과 고지(「다른 보유 주택 목록이 입력되지 않아」)는 주 카드 몫 1건만 — 부수토지 카드가 같은 문안을 되풀이하지 않는다", async () => {
    const a = await agg(forward({ ...TWO, ...oneLand }));
    expect((a.warnings ?? []).filter((w) => w.includes("다른 보유 주택 목록이 입력되지 않아")).length).toBe(1);
  });

  it("🔑 A9 중과 대상 구성의 부수토지 카드에 1건 / 중과 아닌 구성에는 없다", async () => {
    for (const body of [forward({ ...TWO, ...oneLand }), forward({ ...SAME, ...TWO, ...oneLand }), forward({ ...THREE, ...oneLand }), forward({ ...TWO }), forward({ ...TWO, ...SHORT_HOUSE, ...oneLand })]) {
      expect(surchargeNotices(await agg(body)).length).toBe(1);
    }
    for (const body of [forward({ ...OTHER, ...TWO, ...oneLand }), forward({ ...oneLand }), forward({ ...OTHER, ...TWO })]) {
      expect(surchargeNotices(await agg(body))).toEqual([]);
    }
  });
});
