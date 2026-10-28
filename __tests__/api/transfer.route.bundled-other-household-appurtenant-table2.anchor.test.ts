/**
 * 함께 양도 × 토지만 본인 · 건물(주택) 소유자 다른 세대 — 부수토지 카드는 표2 장특을 받지 않는다
 * (계획서 `docs/02-design/features/bundled-other-household-appurtenant-table2.plan.md` · V-3′).
 *
 * 그 토지는 이 세대 1세대1주택에 딸린 토지가 아니라(「소득세법 시행령」 §154① · 조심 2008중3554) 단건·주 카드는 표2가 배제되는데,
 * 같은 묶음의 부수토지 카드는 짝 주택의 판정 채널(`appurtenantHouseVerdict`)이 표2 자산 축을 싣지 않아 표2 60%를 받았다.
 *
 * 시료(독립 정수 산식): 20억 고가 · 주택 2014-01-01 취득 · 2026-02-16 양도 · 수도권 주거지역 3배 · 정착면적 100㎡(한도 300㎡) · 거주 5년.
 *   부수토지 카드 양도 4억 · 취득 2억. 보유 12년(2014-01-01 ~ 2026-02-16 = 12년 1개월) → 표1 12 × 2% = 24% · 표2 min(12×4%, 40%) + 5×4% = 60%.
 *   합산 소득세 = 기본세율(3억 초과 40% 누진공제 25,940,000 · 5억 초과 42% 35,940,000) · 지방소득세 10% · 기본공제 2,500,000.
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

const landCompanion = (id: string, areaM2: number) => ({
  assetId: id, assetLabel: "부수토지", assetKind: "land", landNature: "appurtenant_to_housing", acquisitionCause: "purchase", acquisitionDate: "2014-01-01",
  fixedAcquisitionPrice: 200_000_000, standardPriceAtTransfer: 400_000, directExpenses: 0, isOneHousehold: true, areaM2, reductions: [],
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

/** 역방향 — 첫 자산이 부수토지(400,000,000 · 200㎡), 함께 양도 주택이 컴패니언(토지만 본인이면 분리취득 사실을 함께 넣는다) */
const reverse = (own: Loose) => ({
  transferDate: "2026-02-16", acquisitionDate: "2014-01-01", acquisitionCause: "purchase", expenses: 0, useEstimatedAcquisition: false,
  residencePeriodMonths: 60, isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false,
  reductions: [], annualBasicDeductionUsed: 0, isOneHousehold: true, householdHousingCount: 1,
  propertyType: "land", landNature: "appurtenant_to_housing", transferPrice: 400_000_000, acquisitionPrice: 200_000_000, acquisitionArea: 200, transferArea: 200,
  totalSalePrice: 2_000_000_000, standardPriceAtTransferForApportion: 400_000,
  companionAssets: [{
    assetId: "h1", assetLabel: "주택", assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2014-01-01", fixedAcquisitionPrice: 800_000_000,
    standardPriceAtTransfer: 1_600_000, directExpenses: 0, isOneHousehold: true, reductions: [], ...ZONE,
    companionHousingLand: { landAreaM2: 200, footprintM2: 100, zone: "metropolitan_residential" },
    ...own,
  }],
});
/** 역방향 컴패니언 주택이 토지만 본인일 때 ⑫가 요구하는 분리취득 사실 */
const REVERSE_LAND_ONLY = {
  landAcquisitionDate: "2014-01-01", standardPricePerSqmAtAcquisition: 500_000, acquisitionArea: 200, standardPriceAtAcquisition: 300_000_000,
  landStandardPriceAtTransfer: 800_000_000, buildingStandardPriceAtTransfer: 800_000_000, buildingStandardPriceAtAcquisition: 300_000_000,
};

type Card = { propertyId: string; transferGain: number; income: number; longTermHoldingDeduction: number; warnings?: string[] };
type Agg = { totalTax: number; warnings?: string[]; properties: Card[] };
async function agg(body: Loose): Promise<Agg> {
  const res = await postTransfer(body);
  expect(res.status, JSON.stringify((res.json as Loose).error)).toBe(200);
  return (res.json as Loose).data.aggregated as Agg;
}
const card = (a: Agg, id: string) => a.properties.find((c) => c.propertyId === id)!;
const twoLands = { acquisitionArea: 100, transferArea: 100, companionAssets: [landCompanion("c1", 100), landCompanion("c2", 100)] };
const oneLand = { acquisitionArea: 100, transferArea: 100, companionAssets: [landCompanion("c1", 100)] };

describe("순방향 — 다른 세대 부수토지 카드는 표1(12년 24%)", () => {
  it("🔑 이내분·초과분 갈림: c1__appurtenant 장특 24,000,000 · 소득 76,000,000 · 합계 171,006,000 (수정 전 60,000,000 · 40,000,000 · 155,166,000)", async () => {
    const a = await agg(forward(OTHER));
    const c = card(a, "c1__appurtenant");
    expect([c.transferGain, c.longTermHoldingDeduction, c.income]).toEqual([100_000_000, 24_000_000, 76_000_000]);
    // (304,000,000 + 76,000,000 + 76,000,000 − 2,500,000) × 40% − 25,940,000 = 155,460,000 → ×1.1
    expect(a.totalTax).toBe(171_006_000);
  });

  it("🔑 한도 이내 한 장: c1 장특 48,000,000(= 200,000,000 × 24%) · 소득 152,000,000 · 합계 171,006,000 (수정 전 120,000,000 · 139,326,000)", async () => {
    const a = await agg(forward({ ...OTHER, ...oneLand }));
    const c = card(a, "c1");
    expect([c.longTermHoldingDeduction, c.income]).toEqual([48_000_000, 152_000_000]);
    expect(a.totalTax).toBe(171_006_000);
  });

  it("🔑 한도 이내 두 장: 장특 31,999,999 · 32,000,000(= floor(133,333,333 × 24%) · floor(133,333,334 × 24%)) · 합계 193,391,000 (수정 전 151,059,333)", async () => {
    const a = await agg(forward({ ...OTHER, ...twoLands }));
    expect([card(a, "c1").longTermHoldingDeduction, card(a, "c2").longTermHoldingDeduction]).toEqual([31_999_999, 32_000_000]);
    // 소득 304,000,000 + 101,333,334 × 2 − 2,500,000 = 504,166,668 × 42% = 211,750,000(절사) − 35,940,000 = 175,810,000 → ×1.1
    expect(a.totalTax).toBe(193_391_000);
  });

  it("불변 — 초과분 카드는 표1 그대로(24,000,000 · 76,000,000)", async () => {
    const c = card(await agg(forward(OTHER)), "c1__excess");
    expect([c.longTermHoldingDeduction, c.income]).toEqual([24_000_000, 76_000_000]);
  });

  it("부정 짝 — 소유자 같음·같은 세대는 부수토지 표2 그대로(합계 수정 전과 같다)", async () => {
    expect((await agg(forward({}))).totalTax).toBe(65_637_000);
    expect((await agg(forward(SAME))).totalTax).toBe(32_873_500);
    expect((await agg(forward({ ...oneLand }))).totalTax).toBe(50_589_000);
    expect((await agg(forward({ ...SAME, ...oneLand }))).totalTax).toBe(19_013_500);
    expect((await agg(forward({ ...SAME, ...twoLands }))).totalTax).toBe(23_120_166);
  });

  it("부정 짝 — 다른 세대 · 2주택(1주택 축 false)은 수정 전후 같은 표1: c1 장특 48,000,000 · 소득 152,000,000", async () => {
    const c = card(await agg(forward({ ...OTHER, ...oneLand, householdHousingCount: 2, isRegulatedArea: true, wasRegulatedAtAcquisition: true, transferDate: "2026-06-15" })), "c1");
    expect([c.longTermHoldingDeduction, c.income]).toEqual([48_000_000, 152_000_000]);
  });
});

describe("역방향 — 첫 자산이 부수토지, 짝 주택이 토지만 본인 · 다른 세대", () => {
  it("🔑 primary__appurtenant 장특 24,000,000 · 소득 76,000,000 · 합계 240,207,000 · 짝 주택 h1 장특 144,000,000 (수정 전 60,000,000 · 223,575,000)", async () => {
    const a = await agg(reverse({ ...OTHER, ...REVERSE_LAND_ONLY }));
    const c = card(a, "primary__appurtenant");
    expect([c.transferGain, c.longTermHoldingDeduction, c.income]).toEqual([100_000_000, 24_000_000, 76_000_000]);
    expect(card(a, "h1").longTermHoldingDeduction).toBe(144_000_000);
    // (456,000,000 + 76,000,000 + 76,000,000 − 2,500,000) × 42% − 35,940,000 = 218,370,000 → ×1.1
    expect(a.totalTax).toBe(240_207_000);
  });

  it("부정 짝 — 짝 주택 소유자 같음·같은 세대는 합계 62,293,000 · 45,573,000 그대로", async () => {
    expect((await agg(reverse({}))).totalTax).toBe(62_293_000);
    expect((await agg(reverse({ ...SAME, ...REVERSE_LAND_ONLY }))).totalTax).toBe(45_573_000);
  });
});

describe("고지 — 부수토지 카드가 표1인 이유(Q-2 a)", () => {
  const cardNotices = (a: Agg) => (a.warnings ?? []).filter((w) => w.includes("부수토지 카드") && w.includes("표2"));
  const TWO_HOUSE = { householdHousingCount: 2, isRegulatedArea: true, wasRegulatedAtAcquisition: true, transferDate: "2026-06-15" };

  it("다른 세대 · 표2가 걸렸을 조합: 이내분 카드 1건에만 고지가 실린다(초과분 카드는 표2 자산이 아니라 말하지 않는다)", async () => {
    expect(cardNotices(await agg(forward(OTHER))).length).toBe(1);
    expect(cardNotices(await agg(forward({ ...OTHER, ...oneLand }))).length).toBe(1);
    expect(cardNotices(await agg(reverse({ ...OTHER, ...REVERSE_LAND_ONLY }))).length).toBe(1);
  });

  it("같은 세대·소유자 같음·다른 세대 2주택(표1이라 값에 닿지 않음)에는 없다", async () => {
    expect(cardNotices(await agg(forward({ ...SAME, ...oneLand })))).toEqual([]);
    expect(cardNotices(await agg(forward({ ...oneLand })))).toEqual([]);
    expect(cardNotices(await agg(forward({ ...OTHER, ...oneLand, ...TWO_HOUSE })))).toEqual([]);
  });
});
