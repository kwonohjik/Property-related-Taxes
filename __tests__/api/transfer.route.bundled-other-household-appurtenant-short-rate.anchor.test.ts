/**
 * 함께 양도 × 토지만 본인 · 건물(주택) 소유자 다른 세대 — 부수토지 카드의 단기세율은 일반 토지 세율이다
 * (계획서 `docs/02-design/features/bundled-other-household-appurtenant-short-rate.plan.md` · 서면법규과-944 · Q-1 a · Q-2 a · Q-3 a).
 *
 * 주 카드는 #2657에서 「부수토지가 아닌 일반 토지」 세율(보유 1년 미만 50% · 1~2년 40%)을 받는데, 같은 묶음의 부수토지 카드는
 * 짝 주택 판정 채널(`appurtenantHouseVerdict`)이 「다른 세대」 사실을 싣지 않아 짝 주택의 일체과세 세율(오래된 주택이면 누진)을 받았다.
 *
 * 시료(독립 정수 산식): 20억 고가 · 주택 2014-01-01 · 2026-02-16 양도 · 수도권 주거지역 3배 · 정착면적 100㎡ · 주택 카드 자기 토지 100㎡ +
 *   부수토지 카드 100㎡(한도 300㎡ 이내) · 토지 2025-06-01 취득(8개월). 소득금액은 수정 전후 같다(주 400,000,000 · 카드 200,000,000).
 *   합산 소득세 = (소득 합계 − 기본공제 2,500,000) × 세율(둘 다 같은 정률이라 기본공제 배정은 합계에 영향이 없다) · 지방소득세 10%.
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

type Card2 = Card & { appliedRate?: number; rateClause?: string };
const c2 = (a: Agg, id: string) => card(a, id) as Card2;

/** R — 토지 2025-06-01 취득(양도 시 8개월) · 한도 이내 한 장 */
const R = { landAcquisitionDate: "2025-06-01", acquisitionArea: 100, transferArea: 100, companionAssets: [landCompanion("c1", 100, "2025-06-01")] };
/** S — R + 양도일 2026-06-15(토지 1년 0.5개월) · 2주택·조정(다른 세대라 중과 없음) */
const S = { ...R, householdHousingCount: 2, isRegulatedArea: true, wasRegulatedAtAcquisition: true, transferDate: "2026-06-15" };
/** 수동 세율 지정을 단 R */
const manual = (v: string) => ({ ...R, companionAssets: [landCompanion("c1", 100, "2025-06-01", { manualHoldingPeriodOverride: v })] });
const reverseShort = (own: Loose) => ({ ...reverse(own), acquisitionDate: "2025-06-01" });

describe("순방향 — 다른 세대 부수토지 카드는 일반 토지 단기세율", () => {
  it("🔑 A1 8개월: c1 50%(104-1-3) · 합계 328,625,000 (수정 전 38% · 280,291,000)", async () => {
    const a = await agg(forward({ ...OTHER, ...R }));
    expect([c2(a, "c1").income, c2(a, "c1").appliedRate, c2(a, "c1").rateClause]).toEqual([200_000_000, 0.5, "104-1-3"]);
    expect(c2(a, "primary").appliedRate).toBe(0.5);
    // (400,000,000 + 200,000,000 − 2,500,000) × 50% = 298,750,000 → ×1.1
    expect(a.totalTax).toBe(328_625_000);
  });

  it("🔑 A2 1년 0.5개월: c1 40%(104-1-2) · 합계 262,900,000 (수정 전 38% · 236,566,000)", async () => {
    const a = await agg(forward({ ...OTHER, ...S }));
    expect([c2(a, "c1").appliedRate, c2(a, "c1").rateClause]).toEqual([0.4, "104-1-2"]);
    // (400,000,000 + 200,000,000 − 2,500,000) × 40% = 239,000,000 → ×1.1
    expect(a.totalTax).toBe(262_900_000);
  });

  it("A4 불변 — 토지 12년(2014) 보유는 누진 그대로: c1__appurtenant 24% · 합계 171,006,000", async () => {
    const a = await agg(forward(OTHER));
    expect(c2(a, "c1__appurtenant").appliedRate).toBe(0.24);
    expect(a.totalTax).toBe(171_006_000);
  });

  it("A8 카드가 짝 주택보다 이른 토지(2014 · 12년)면 주 카드만 단기: 카드는 표1 24% · 누진 38%, 주 카드 50% · 합계 260,227,000", async () => {
    const a = await agg(forward({ ...OTHER, landAcquisitionDate: "2025-06-01", acquisitionArea: 100, transferArea: 100, companionAssets: [landCompanion("c1", 100)] }));
    const c = c2(a, "c1");
    expect([c.longTermHoldingDeduction, c.income, c.appliedRate]).toEqual([48_000_000, 152_000_000, 0.38]);
    expect(c2(a, "primary").appliedRate).toBe(0.5);
    // 정률 몫 (400,000,000 − 2,500,000) × 50% = 198,750,000 + 누진 몫 152,000,000 × 38% − 19,940,000 = 37,820,000 → ×1.1
    expect(a.totalTax).toBe(260_227_000);
  });

  it("A5 같은 세대·소유자 같음은 일체과세 — 카드를 8개월 보유했으니 짝 주택 12년이 아니라 카드 취득일부터(c1 70% · 합계 460,075,000 · 474,859,000)", async () => {
    // O-4(계획서 bundled-appurtenant-card-later-land-holding.plan.md)로 갱신 — 종전 24% · 320,859,000 · 351,021,000은 짝 주택 보유연수를 쓴 값이다.
    const same = await agg(forward({ ...SAME, ...R }));
    expect(c2(same, "c1").appliedRate).toBe(0.7);
    // (주 카드 400,000,000 + 카드 200,000,000 − 2,500,000) × 70% = 418,250,000 → ×1.1
    expect(same.totalTax).toBe(460_075_000);
    const both = await agg(forward({ ...R }));
    expect(c2(both, "c1").appliedRate).toBe(0.7);
    expect(both.totalTax).toBe(474_859_000);
  });
});

describe("수동 세율 지정은 다른 세대에서도 그대로(Q-2 a)", () => {
  it("🔑 A6 70% · 60% · 누진 지정 — c1 세율·합계가 지정대로(분기 전체를 건너뛰면 모두 328,625,000이 된다)", async () => {
    const m70 = await agg(forward({ ...OTHER, ...manual("shortTermHousing70") }));
    expect(c2(m70, "c1").appliedRate).toBe(0.7);
    // 주 400,000,000 × 50% = 200,000,000 + 카드 (200,000,000 − 2,500,000) × 70% = 138,250,000 → ×1.1
    expect(m70.totalTax).toBe(372_075_000);
    const m60 = await agg(forward({ ...OTHER, ...manual("shortTerm60") }));
    expect(c2(m60, "c1").appliedRate).toBe(0.6);
    // 200,000,000 + (200,000,000 − 2,500,000) × 60% = 118,500,000 → ×1.1
    expect(m60.totalTax).toBe(350_350_000);
    const prog = await agg(forward({ ...OTHER, ...manual("progressive") }));
    expect(c2(prog, "c1").appliedRate).toBe(0.38);
    expect(prog.totalTax).toBe(280_291_000);
  });
});

describe("역방향 — 첫 자산이 부수토지, 짝 주택이 토지만 본인 · 다른 세대", () => {
  it("🔑 A3 8개월: primary__appurtenant 50% · 소득 100,000,000 · 합계 280,731,000 (수정 전 35% · 270,963,000)", async () => {
    const a = await agg(reverseShort({ ...OTHER, ...REVERSE_LAND_ONLY }));
    const c = c2(a, "primary__appurtenant");
    expect([c.income, c.appliedRate, c.rateClause]).toEqual([100_000_000, 0.5, "104-1-3"]);
    // 누진 몫 짝 주택 소득 456,000,000 × 40% − 25,940,000 = 156,460,000 + 정률 몫 (100,000,000 + 100,000,000 − 2,500,000) × 50% = 98,750,000 → ×1.1
    expect(a.totalTax).toBe(280_731_000);
  });

  it("A4 12년(2014)은 24% · 합계 240,207,000 불변 / 같은 세대·소유자 같음 8개월은 카드 취득일부터라 142,747,000 · 162,371,000", async () => {
    const old = await agg(reverse({ ...OTHER, ...REVERSE_LAND_ONLY }));
    expect(c2(old, "primary__appurtenant").appliedRate).toBe(0.24);
    expect(old.totalTax).toBe(240_207_000);
    // O-4(계획서 bundled-appurtenant-card-later-land-holding.plan.md)로 갱신 — 종전 79,761,000 · 101,915,000은 짝 주택 보유연수를 쓴 값이다.
    // 같은 세대: 이내분 70% (100,000,000 − 2,500,000) × 70% = 68,250,000 + 초과분 100,000,000 × 50% = 50,000,000 + 주택 소득 72,000,000 × 24% − 5,760,000 = 11,520,000 → 129,770,000 × 1.1
    expect((await agg(reverseShort({ ...SAME, ...REVERSE_LAND_ONLY }))).totalTax).toBe(142_747_000);
    // 소유자 같음은 순·역 등가로 고정한다 — `transfer.route.bundled-appurtenant-card-later-land.anchor.test.ts` B5
    expect((await agg(reverseShort({}))).totalTax).toBe(162_371_000);
  });
});

describe("고지 — 다른 세대 부수토지 카드의 단기세율(Q-3 a)", () => {
  // 주 카드(`landOnlyOtherHouseholdRateNotice`)도 같은 문안을 낸다 — 합산 경고에서 카드 몫은 문안 개수 − 주 카드 1건이다.
  const rateNotices = (a: Agg) => (a.warnings ?? []).filter((w) => w.includes("일반 토지 기준으로 판정했습니다"));

  it("🔑 A7 2년 미만이면 부수토지 카드 몫 1건이 더 실린다(주 카드 1건 + 카드 1건)", async () => {
    expect(rateNotices(await agg(forward({ ...OTHER, ...R }))).length).toBe(2);
    expect(rateNotices(await agg(forward({ ...OTHER, ...S }))).length).toBe(2);
  });

  it("2년 이상(2014)·같은 세대·소유자 같음에는 카드 고지가 없다(주 카드 고지만 — 같은 세대는 문안 자체가 없다)", async () => {
    expect(rateNotices(await agg(forward(OTHER))).length).toBe(0);
    expect(rateNotices(await agg(forward({ ...SAME, ...R }))).length).toBe(0);
    expect(rateNotices(await agg(forward({ ...R }))).length).toBe(0);
  });
});
