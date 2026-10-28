/**
 * 함께 양도 × 부수토지 카드가 짝 주택보다 늦게 취득된 경우 — 「주택부수토지로서」 보유는 카드 취득일부터다
 * (계획서 `docs/02-design/features/bundled-appurtenant-card-later-land-holding.plan.md` · Q-1 a · Q-2 a · Q-3 a).
 *
 * 카드의 장특 표2 보유연수·단기세율 기산이 카드 자기 취득일이 아니라 짝 주택의 12년으로 남아, 8개월 보유한 토지가 표2 60%(장특 120,000,000)·누진 24%를 받았다.
 * 같은 사실을 주택 카드 하나(토지를 별도 취득일로 입력)로 합쳐 넣으면 토지 파트는 자기 취득일로 단기 70%·장특 0이다 — 입력 방식으로 세액이 갈렸다.
 *
 * 시료(독립 정수 산식): 20억 고가 · 주택 2014-01-01 · 2026-02-16 양도 · 수도권 주거지역 3배 · 정착면적 100㎡ · 거주 5년.
 *   주택 카드 자기 토지 100㎡ + 부수토지 카드 100㎡(한 장 `c1`, 양도차익 200,000,000 · 12억 초과 안분 후 과세 몫 80,000,000). 토지(주 카드 토지·카드)를 늦게 취득.
 *   표1 = 보유 2%/년(30% 캡) · 표2 = 보유분 4%/년 + 거주분(5년 = 20%)(각 40% 캡) · 3년 미만은 둘 다 0.
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

type Card = { propertyId: string; transferGain: number; income: number; longTermHoldingDeduction: number; appliedRate?: number; rateClause?: string };
type Agg = { totalTax: number; warnings?: string[]; properties: Card[] };
async function agg(body: Loose): Promise<Agg> {
  const res = await postTransfer(body);
  expect(res.status, JSON.stringify((res.json as Loose).error)).toBe(200);
  return (res.json as Loose).data.aggregated as Agg;
}
const card = (a: Agg, id: string) => a.properties.find((c) => c.propertyId === id)!;
async function singleTotal(body: Loose): Promise<number> {
  const res = await postTransfer(body);
  expect(res.status, JSON.stringify((res.json as Loose).error)).toBe(200);
  return (res.json as Loose).data.result.totalTax as number;
}

/** 토지(주 카드 토지·부수토지 카드)를 `d`에 취득 — 한도 이내 한 장 */
const later = (d: string) => ({ landAcquisitionDate: d, acquisitionArea: 100, transferArea: 100, companionAssets: [landCompanion("c1", 100, d)] });
/** 같은 사실을 주택 카드 하나로 합쳐 입력(토지 200㎡ · 취득일은 토지만 `d`) — 양도 20억 · 취득 9억 */
const merged = (d: string) => ({
  landAcquisitionDate: d, acquisitionArea: 200, transferArea: 200, companionAssets: [] as Loose[],
  transferPrice: 2_000_000_000, acquisitionPrice: 900_000_000, landTransferPrice: 1_200_000_000, landAcquisitionPrice: 600_000_000,
});
const TWO = { householdHousingCount: 2, isRegulatedArea: true, wasRegulatedAtAcquisition: true, transferDate: "2026-06-15" };
const D25 = "2025-06-01"; // 양도 시 8개월
const D22 = "2022-06-01"; // 3년 8개월
const D18 = "2018-06-01"; // 7년 8개월

describe("토지만 본인 · 같은 세대 — 카드 취득일부터 보유로 본다", () => {
  it("🔑 B1 토지 2025-06(8개월): c1 장특 0 · 70%(104-1-3) · 합계 460,075,000 (수정 전 장특 120,000,000 · 24% · 320,859,000)", async () => {
    const a = await agg(forward({ ...SAME, ...later(D25) }));
    const c = card(a, "c1");
    expect([c.longTermHoldingDeduction, c.appliedRate, c.rateClause]).toEqual([0, 0.7, "104-1-3"]);
    // (주 카드 400,000,000 + 카드 200,000,000 − 2,500,000) × 70% = 418,250,000 → ×1.1
    expect(a.totalTax).toBe(460_075_000);
  });

  it("🔑 B2 토지 2022-06(3년 8개월): c1 장특 25,600,000 · 소득 54,400,000 · 합계 45,238,600 (수정 전 장특 48,000,000 · 36,261,500)", async () => {
    const a = await agg(forward({ ...SAME, ...later(D22) }));
    const c = card(a, "c1");
    // 과세 몫 80,000,000 × (표2 보유 3년 12% + 거주 5년 20% = 32%)
    expect([c.longTermHoldingDeduction, c.income]).toEqual([25_600_000, 54_400_000]);
    // 소득 합 108,800,000 + 54,400,000 − 2,500,000 = 160,700,000 × 38% − 19,940,000 = 41,126,000 → ×1.1
    expect(a.totalTax).toBe(45_238_600);
  });

  it("🔑 B3 토지 2018-06(7년 8개월): c1 장특 38,400,000 · 소득 41,600,000 · 합계 30,101,500 (수정 전 장특 48,000,000 · 26,405,500)", async () => {
    const a = await agg(forward({ ...SAME, ...later(D18) }));
    const c = card(a, "c1");
    // 80,000,000 × (표2 보유 7년 28% + 거주 5년 20% = 48%)
    expect([c.longTermHoldingDeduction, c.income]).toEqual([38_400_000, 41_600_000]);
    // 소득 합 83,200,000 + 41,600,000 − 2,500,000 = 122,300,000 × 35% − 15,440,000 = 27,365,000 → ×1.1
    expect(a.totalTax).toBe(30_101_500);
  });
});

describe("소유자 같음 — 합쳐 입력한 값과 같다", () => {
  it.each([
    [D25, 474_859_000],
    [D22, 78_678_600],
    [D18, 62_627_400],
  ])("🔑 B4 토지 %s: 합계 %i = 주택 카드 하나로 합쳐 입력한 값", async (d, expected) => {
    expect((await agg(forward(later(d)))).totalTax).toBe(expected);
    expect(await singleTotal(forward(merged(d)))).toBe(expected);
  });
});

/** 순·역 등가 사실 — 주택 16억(자기 토지 200㎡ · 정착 100㎡) + 부수토지 4억(200㎡), 부수토지는 `d` 취득 · 총 양도 20억 */
const eqForward = (d: string) => forward({
  acquisitionPrice: 800_000_000, ...ZONE, acquisitionArea: 200, transferArea: undefined, landAcquisitionDate: undefined, isSeparateAcquisition: undefined,
  landAcqMode: undefined, buildingAcqMode: undefined, saleSplitMode: undefined, landTransferPrice: undefined, buildingTransferPrice: undefined,
  landAcquisitionPrice: undefined, buildingAcquisitionPrice: undefined, landStandardPriceAtTransfer: undefined, buildingStandardPriceAtTransfer: undefined,
  companionAssets: [landCompanion("c1", 200, d)],
});
const eqReverse = (d: string) => ({
  transferDate: "2026-02-16", acquisitionDate: d, acquisitionCause: "purchase", expenses: 0, useEstimatedAcquisition: false, residencePeriodMonths: 60,
  isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, reductions: [], annualBasicDeductionUsed: 0,
  isOneHousehold: true, householdHousingCount: 1, propertyType: "land", landNature: "appurtenant_to_housing", transferPrice: 400_000_000,
  acquisitionPrice: 200_000_000, acquisitionArea: 200, transferArea: 200, totalSalePrice: 2_000_000_000, standardPriceAtTransferForApportion: 400_000,
  companionAssets: [{
    assetId: "h1", assetLabel: "주택", assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2014-01-01", fixedAcquisitionPrice: 800_000_000,
    standardPriceAtTransfer: 1_600_000, directExpenses: 0, isOneHousehold: true, reductions: [], ...ZONE,
    companionHousingLand: { landAreaM2: 200, footprintM2: 100, zone: "metropolitan_residential" },
  }],
});

describe("역방향 — 첫 자산이 늦게 취득한 부수토지, 짝 주택이 함께 양도", () => {
  it("🔑 B5 토지 2025-06: primary__appurtenant 70%(104-1-3) · 장특 0 · 순·역 합계가 같고 162,371,000 (수정 전 15% · 장특 60,000,000 · 101,915,000)", async () => {
    const fwd = await agg(eqForward(D25));
    const rev = await agg(eqReverse(D25));
    const c = card(rev, "primary__appurtenant");
    expect([c.longTermHoldingDeduction, c.appliedRate, c.rateClause]).toEqual([0, 0.7, "104-1-3"]);
    // 순·역은 같은 사실이라 합계가 같아야 한다 — 12억 단위 재배분의 독립 산식은 없어(계획서 O-8) 등가로 고정한다
    expect(rev.totalTax).toBe(fwd.totalTax);
    expect(rev.totalTax).toBe(162_371_000);
  });
});

describe("중과 조합 — 2주택·조정, 양도 2026-06-15 (§104⑦ 후단 비교의 보유기간도 카드 취득일부터)", () => {
  it("🔑 B6a 토지만 본인 · 같은 세대 · 토지 2025-06(1년 0.5개월): 단기 60%가 중과를 이긴다 — 합계 394,350,000 (수정 전 중과 368,016,000)", async () => {
    const a = await agg(forward({ ...SAME, ...TWO, ...later(D25) }));
    // (주 카드 400,000,000 + 카드 200,000,000 − 2,500,000) × 60% = 358,500,000 → ×1.1 (중과 367,961,000 + α보다 크다)
    expect(a.totalTax).toBe(394_350_000);
  });

  it("🔑 B6b 소유자 같음 · 토지 2025-06: 합계 695,816,000 = 합쳐 입력한 값 (수정 전 700,161,000)", async () => {
    const a = await agg(forward({ ...TWO, ...later(D25) }));
    expect(a.totalTax).toBe(695_816_000);
    expect(await singleTotal(forward({ ...TWO, ...merged(D25) }))).toBe(695_816_000);
  });

  it("B6c 불변 — 토지 2022-06(보유 3년 이상 → 비교 없음)은 중과가 그대로: 소유자 같음 712,178,500 · 같은 세대 367,961,000", async () => {
    expect((await agg(forward({ ...TWO, ...later(D22) }))).totalTax).toBe(712_178_500);
    expect((await agg(forward({ ...SAME, ...TWO, ...later(D22) }))).totalTax).toBe(367_961_000);
  });
});

describe("불변 — 다른 세대 · 카드가 짝 주택보다 이른 토지", () => {
  it.each([
    [D25, 328_625_000],
    [D22, 219_879_000],
    [D18, 197_703_000],
  ])("🔑 B7a 다른 세대 토지 %s: 일반 토지 기준이라 이미 바르다 — 합계 %i", async (d, expected) => {
    expect((await agg(forward({ ...OTHER, ...later(d) }))).totalTax).toBe(expected);
  });

  it("B7b 카드가 짝 주택과 같은 날(2014) 취득이면 짝 주택 12년 그대로 — c1 장특 48,000,000(= 80,000,000 × 표2 60%) · 소득 32,000,000", async () => {
    const c = card(await agg(forward({ ...SAME, ...later("2014-01-01") })), "c1");
    expect([c.longTermHoldingDeduction, c.income]).toEqual([48_000_000, 32_000_000]);
  });
});

describe("고지 — 짝 주택보다 늦게 취득된 부수토지 카드 (Q-3 a)", () => {
  const laterNotices = (a: Agg) => (a.warnings ?? []).filter((w) => w.includes("부수토지 카드") && w.includes("카드 취득일부터"));

  it("🔑 B8 늦게 취득한 소유자 같음·같은 세대 카드에는 1건 — 「확인이 필요합니다」를 병기한다", async () => {
    for (const body of [forward(later(D25)), forward({ ...SAME, ...later(D22) })]) {
      const notices = laterNotices(await agg(body));
      expect(notices.length).toBe(1);
      expect(notices[0]).toContain("확인이 필요합니다");
    }
  });

  it("카드가 짝 주택보다 이르거나 같으면 · 다른 세대면 말하지 않는다", async () => {
    expect(laterNotices(await agg(forward({ ...SAME, ...later("2014-01-01") }))).length).toBe(0);
    expect(laterNotices(await agg(forward(later("2014-01-01")))).length).toBe(0);
    expect(laterNotices(await agg(forward({ ...OTHER, ...later(D25) }))).length).toBe(0);
  });
});
