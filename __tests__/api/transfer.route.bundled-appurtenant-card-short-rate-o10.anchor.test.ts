/**
 * 함께 양도 × 부수토지 카드 — 짝 주택이 단기(2년 미만)·중과일 때 카드의 §104⑦ 후단 비교는 **주택 단기 세율**(60%/70%)로 한다
 * (계획서 `docs/02-design/features/bundled-appurtenant-card-unit-share-and-rate-display.plan.md` O-10 · Q-2′ a · Q-4 a).
 *
 * 부수토지 카드는 `propertyType: "land"`라 후단 비교의 단기세율이 토지 40%였다. 그 결과 ① 순방향은 합계가 맞지만(집계가 대표 단위인 주택 입력으로 버킷을 합산 재계산)
 * 카드 줄(세율·조항·산출세액)이 «중과 58%»/«40%»로 남았고 ② 역방향은 대표 단위가 카드라 버킷 전체가 토지 40% vs 중과로 계산돼 합계가 과소였다(순 636,350,000 ↔ 역 616,561,000).
 * 「소득세법」 §104①2호 괄호 «주택(이에 딸린 토지를 포함한다)» · §104⑦ 후단 — 부수토지는 주택이라 단기세율도 주택 세율이다. 같은 사실이면 입력 순서와 무관하게 같은 세액이다(K1 등가).
 *
 * 독립 산식(2주택 · 조정 · 2026-06-15 · 기본공제 2,500,000 · 모의 세율표): 주택 800,000,000 + 이내분 100,000,000 − 2,500,000 = 897,500,000 → 단기 60% = 538,500,000 vs
 * 중과(42% 누진 − 35,940,000 + 20%p) = 520,510,000 → 큰 쪽 538,500,000. 초과분 100,000,000 × 40% = 40,000,000(1~2년 일반 토지).
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
import { capResidenceToHolding } from "../calc/_helpers/held-residence";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

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
  const res = await postTransfer(capResidenceToHolding(body));
  expect(res.status, JSON.stringify((res.json as Loose).error)).toBe(200);
  return (res.json as Loose).data.aggregated as Agg;
}
const card = (a: Agg, id: string) => a.properties.find((c) => c.propertyId === id)!;


type Card2 = Card & { appliedRate?: number; rateClause?: string };

const TWO = { householdHousingCount: 2, isRegulatedArea: true, wasRegulatedAtAcquisition: true, transferDate: "2026-06-15" };
const oneLand = { acquisitionArea: 100, transferArea: 100, companionAssets: [landCompanion("c1", 100)] };
/** 같은 사실을 주택 카드 하나로 합쳐 입력(토지 200㎡ 포함) — 양도 20억 · 취득 9억 */
const MERGED = { acquisitionArea: 200, transferArea: 200, companionAssets: [] as Loose[], transferPrice: 2_000_000_000, acquisitionPrice: 900_000_000, landTransferPrice: 1_200_000_000, landAcquisitionPrice: 600_000_000 };
/** 주택·주 카드 토지 2025-01-01 취득(양도 시 1년 5개월) · 부수토지 카드 */
const SHORT_HOUSE = { acquisitionDate: "2025-01-01", landAcquisitionDate: "2025-01-01" };
async function singleTotal(body: Loose): Promise<number> {
  const res = await postTransfer(capResidenceToHolding(body));
  expect(res.status, JSON.stringify((res.json as Loose).error)).toBe(200);
  return (res.json as Loose).data.result.totalTax as number;
}
const surchargeNotices = (a: Agg) => (a.warnings ?? []).filter((w) => w.includes("부수토지 카드") && w.includes("다주택 중과"));
const c3 = (a: Agg, id: string) => card(a, id) as Card2 & { refCalculatedTax?: number };
/** 순·역 등가 시료(A7) — 주택 1,600,000,000(취득 800,000,000) · 주택 토지 200㎡ · 부수토지 400,000,000(취득 200,000,000) 200㎡ · 2주택·조정 · 2026-06-15. 취득일만 바꾼다. */
function eqPair(houseAcq: string, cardAcq: string) {
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
  const f = eqForward();
  const r = eqReverse();
  f.acquisitionDate = houseAcq;
  (f.companionAssets[0] as Loose).acquisitionDate = cardAcq;
  r.acquisitionDate = cardAcq;
  (r.companionAssets[0] as Loose).acquisitionDate = houseAcq;
  return { f, r };
}

const T_BOTH = () => forward({ ...TWO, ...oneLand, ...SHORT_HOUSE, companionAssets: [landCompanion("c1", 100, "2025-01-01")] });
const U_TWO = () => forward({ ...TWO, ...oneLand, ...SHORT_HOUSE, companionAssets: [landCompanion("c1", 100, "2014-01-01")] });
const T_SPLIT = () => forward({ ...TWO, ...SHORT_HOUSE, companionAssets: [landCompanion("c1", 200, "2025-01-01")] });

describe("카드 줄 — 짝 주택 단기·중과: 합쳐 입력한 값과 같은 세율·조항(주택 단기 60%)", () => {
  it("🔑 S1 둘 다 2025-01-01(한 장 100㎡): c1 60% · 104-1-2 · 산출 120,000,000(= 200,000,000 × 60%) · 합계 724,350,000 불변 = 합쳐 입력 (수정 전 58% · 104-7-1 · 96,059,999)", async () => {
    const a = await agg(T_BOTH());
    const c = c3(a, "c1");
    expect([c.appliedRate, c.rateClause, c.refCalculatedTax]).toEqual([0.6, "104-1-2", 120_000_000]);
    // (900,000,000 + 200,000,000 − 2,500,000) × 60% = 658,500,000 → ×1.1
    expect(a.totalTax).toBe(724_350_000);
    expect(await singleTotal(forward({ ...TWO, ...MERGED, ...SHORT_HOUSE, landAcquisitionDate: "2025-01-01" }))).toBe(724_350_000);
  });

  it("🔑 S2 카드 옛 토지(2014) · 주택 2025: c1 60% · 104-1-2 · 합계 724,350,000 불변 (수정 전 그룹 행 58% +20%p · 세액은 60%)", async () => {
    const a = await agg(U_TWO());
    const c = c3(a, "c1");
    expect([c.appliedRate, c.rateClause, c.longTermHoldingDeduction]).toEqual([0.6, "104-1-2", 0]);
    expect(a.totalTax).toBe(724_350_000);
  });

  it("🔑 S3 분리 배치(200㎡ → 이내분 · 초과분): c1__appurtenant 60% · 60,000,000 · c1__excess 40% 불변 · 합계 702,350,000 불변 (수정 전 이내분 40% · 40,000,000)", async () => {
    const a = await agg(T_SPLIT());
    const ap = c3(a, "c1__appurtenant");
    expect([ap.appliedRate, ap.rateClause, ap.refCalculatedTax]).toEqual([0.6, "104-1-2", 60_000_000]);
    const ex = c3(a, "c1__excess");
    expect([ex.appliedRate, ex.rateClause, ex.refCalculatedTax]).toEqual([0.4, "104-1-2", 40_000_000]);
    // (800,000,000 + 100,000,000 − 2,500,000) × 60% = 538,500,000 + 초과분 40,000,000 = 578,500,000 + 이내분 외 주 카드 … 합계는 그룹 산식 — 독립 값: 주 카드 포함 702,350,000
    expect(a.totalTax).toBe(702_350_000);
  });

  it("S4 1년 미만 70%: 주택·카드 2026-03-01 취득(양도 2026-06-15 · 3개월) — 카드도 70%(104-1-3)", async () => {
    const a = await agg(forward({ ...TWO, ...oneLand, acquisitionDate: "2026-03-01", landAcquisitionDate: "2026-03-01", companionAssets: [landCompanion("c1", 100, "2026-03-01")] }));
    const c = c3(a, "c1");
    expect([c.appliedRate, c.rateClause]).toEqual([0.7, "104-1-3"]);
  });
});

describe("순·역 등가 — 같은 사실을 주택 먼저/부수토지 먼저 넣으면 총세액이 같다(단기 조합)", () => {
  it("🔑 S5 둘 다 2025: 순 = 역 = 636,350,000 = (538,500,000 + 40,000,000) × 1.1 (수정 전 역 616,561,000)", async () => {
    const { f, r } = eqPair("2025-01-01", "2025-01-01");
    const fa = await agg(f);
    const ra = await agg(r);
    // 독립 산식 — 주택+이내분 단기 60% 538,500,000(중과 520,510,000보다 큼) + 초과분 40,000,000
    expect(Math.floor((538_500_000 + 40_000_000) * 1.1)).toBe(636_350_000);
    expect([fa.totalTax, ra.totalTax]).toEqual([636_350_000, 636_350_000]);
    expect(c3(ra, "primary__appurtenant").appliedRate).toBe(0.6);
  });

  it("🔑 S6 주택 2025 · 카드 옛 토지 2014: 순 = 역 = 614,438,000 = (478,500,000 + 60,000,000 + 20,080,000) × 1.1 (수정 전 역 594,649,000)", async () => {
    const { f, r } = eqPair("2025-01-01", "2014-01-01");
    expect(Math.floor((478_500_000 + 60_000_000 + 20_080_000) * 1.1)).toBe(614_438_000);
    expect([(await agg(f)).totalTax, (await agg(r)).totalTax]).toEqual([614_438_000, 614_438_000]);
  });

  it("S7 불변 — 장기(2014 · 2014) 순 = 역 = 594,649,000(A7) · 중과 없음(다른 세대) 단기도 불변", async () => {
    const { f, r } = eqPair("2014-01-01", "2014-01-01");
    expect([(await agg(f)).totalTax, (await agg(r)).totalTax]).toEqual([594_649_000, 594_649_000]);
    expect((await agg(forward({ ...OTHER, ...TWO, ...oneLand, ...SHORT_HOUSE, companionAssets: [landCompanion("c1", 100, "2025-01-01")] }))).totalTax).toBe(262_900_000);
  });
});

describe("고지(Q-4 a) — 중과 카드 고지가 후단 비교의 단기세율이 주택 세율임을 말한다", () => {
  it("S8 고지에 «주택(이에 딸린 토지를 포함한다)» 단기 세율 문구", async () => {
    const n = surchargeNotices(await agg(T_BOTH()));
    expect(n.length).toBe(1);
    expect(n[0]).toContain("주택 단기세율(1~2년 60% · 1년 미만 70%)");
  });
});
