/**
 * 함께 양도 × 토지만 본인 · 같은 세대(합가) — 세대합가일이 부수토지 카드에도 반영된다
 * (계획서 `docs/02-design/features/bundled-merge-date-appurtenant-card.plan.md` · 사용자 결정 Q-1 a · Q-2 a · Q-3 a).
 *
 * 합가 이전 기간은 주택부수토지로서 보유한 기간이 아니다(재산46014-610 · 부동산거래관리과-515). 주 카드는 합가일을 반영하는데(#2662) 부수토지 카드는
 * 합가일이 짝 주택 판정 채널(`appurtenantHouseVerdict`)에 실리지 않아 어떤 합가일이든 합가 없을 때와 같았다.
 *
 * 시료(독립 정수 산식): 20억 고가 · 주택·토지 2014-01-01 · 2026-02-16 양도 · 정착면적 100㎡(한도 300㎡) · 거주 5년 · 토지만 본인 · 같은 세대 · 합가함.
 *   분리 배치(주택 카드 토지 200㎡ + 부수토지 200㎡): `c1__appurtenant` 고가주택 안분 후 과세 몫 28,000,000 · 한 장 배치(100㎡ + 100㎡): `c1` 80,000,000.
 *   표2 = 보유 4%/년(상한 40%) + 거주 5×4% = 20% · 표1 = 12년 × 2% = 24% · 통칙 95-0…1 큰 값 · 표2 보유분은 3년 미만이면 0.
 *   합산 소득세 = 기본세율(1.5억 초과 38% 누진공제 19,940,000 · 1.5억 이하 35% 15,440,000 · 5억 초과 42% 35,940,000) · 지방소득세 10% · 기본공제 2,500,000.
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


const MERGE = (d?: string) => ({ selfOwns: "land_only", buildingOwnerSameHousehold: true, ...(d ? { buildingOwnerHouseholdMerged: true, buildingOwnerHouseholdMergeDate: d } : { buildingOwnerHouseholdMerged: false }) });
const oneLand = { acquisitionArea: 100, transferArea: 100, companionAssets: [landCompanion("c1", 100)] };
const SAM_REV = (d?: string) => ({ ...MERGE(d), ...REVERSE_LAND_ONLY });

type Card = { propertyId: string; steps?: { label: string; formula?: string }[]; transferGain: number; income: number; longTermHoldingDeduction: number; isPartialExempt?: boolean; appliedRate?: number; rateClause?: string };
type Agg = { totalTax: number; warnings?: string[]; properties: Card[] };
async function agg(body: Loose): Promise<Agg> {
  const res = await postTransfer(body);
  expect(res.status, JSON.stringify((res.json as Loose).error)).toBe(200);
  return (res.json as Loose).data.aggregated as Agg;
}
const card = (a: Agg, id: string) => a.properties.find((c) => c.propertyId === id)!;
const vals = (c: Card) => [c.longTermHoldingDeduction, c.income];

describe("순방향 분리 배치 — 부수토지 카드(c1__appurtenant)가 합가일을 반영한다", () => {
  it("🔑 합가 2020-01-01(합가 후 6년): 표2 6×4% + 거주 20% = 44% → 장특 12,320,000 · 소득 15,680,000 · 합계 41,560,200 (수정 전 16,800,000 · 11,200,000 · 39,772,700)", async () => {
    const a = await agg(forward(MERGE("2020-01-01")));
    expect(vals(card(a, "c1__appurtenant"))).toEqual([12_320_000, 15_680_000]);
    // 소득 62,720,000 + 15,680,000 + 76,000,000 − 2,500,000 = 151,900,000 × 38% − 19,940,000 = 37,782,000 → ×1.1
    expect(a.totalTax).toBe(41_560_200);
  });
  it("🔑 합가 2023-06-01(합가 후 2년 8개월): 표2 보유분 0 → 표1 24% → 장특 6,720,000 · 소득 21,280,000 · 합계 53,264,200 (수정 전 16,800,000 · 11,200,000)", async () => {
    const a = await agg(forward(MERGE("2023-06-01")));
    expect(vals(card(a, "c1__appurtenant"))).toEqual([6_720_000, 21_280_000]);
    // 85,120,000 + 21,280,000 + 76,000,000 − 2,500,000 = 179,900,000 × 38% − 19,940,000 = 48,422,000 → ×1.1
    expect(a.totalTax).toBe(53_264_200);
  });
  it("🔑 합가 2025-01-01(합가 후 1년 1개월 — 2년 미만): 비과세 아님 · 표1 24% → 장특 24,000,000 · 소득 76,000,000 · 세율 60%(주택 단기) · 합계 271,238,000 (수정 전 부분 비과세 · 소득 0)", async () => {
    const a = await agg(forward(MERGE("2025-01-01")));
    const c = card(a, "c1__appurtenant");
    expect([c.isPartialExempt, ...vals(c), c.appliedRate]).toEqual([false, 24_000_000, 76_000_000, 0.6]);
    // (304,000,000 + 76,000,000) × 60% = 228,000,000 + 초과분 20,080,000 − 기본공제 2,500,000 × 60% = 246,580,000 → ×1.1
    expect(a.totalTax).toBe(271_238_000);
  });
  it("불변 — 초과분 카드는 합가일과 무관(24,000,000 · 76,000,000)", async () => {
    for (const d of [undefined, "2020-01-01", "2025-01-01"]) expect(vals(card(await agg(forward(MERGE(d))), "c1__excess")), String(d)).toEqual([24_000_000, 76_000_000]);
  });
});

describe("순방향 한 장 배치 — 부수토지 카드(c1)가 합가일을 반영한다", () => {
  it("🔑 합가 2020: 장특 35,200,000(= 80,000,000 × 44%) · 소득 44,800,000 · 합계 33,797,500 (수정 전 48,000,000 · 32,000,000)", async () => {
    const a = await agg(forward({ ...MERGE("2020-01-01"), ...oneLand }));
    expect(vals(card(a, "c1"))).toEqual([35_200_000, 44_800_000]);
    // 89,600,000 + 44,800,000 − 2,500,000 = 131,900,000 × 35% − 15,440,000 = 30,725,000 → ×1.1
    expect(a.totalTax).toBe(33_797_500);
  });
  it("🔑 합가 2023-06-01: 장특 19,200,000(= 80,000,000 × 24%) · 소득 60,800,000 · 합계 53,264,200", async () => {
    const a = await agg(forward({ ...MERGE("2023-06-01"), ...oneLand }));
    expect(vals(card(a, "c1"))).toEqual([19_200_000, 60_800_000]);
    expect(a.totalTax).toBe(53_264_200);
  });
  it("🔑 합가 2025-01-01: 비과세 아님 · 장특 48,000,000(= 200,000,000 × 24%) · 소득 152,000,000 · 60% · 합계 299,310,000 (수정 전 부분 비과세 · 48,000,000 · 32,000,000 · 202,884,000)", async () => {
    const a = await agg(forward({ ...MERGE("2025-01-01"), ...oneLand }));
    const c = card(a, "c1");
    expect([c.isPartialExempt, ...vals(c), c.appliedRate]).toEqual([false, 48_000_000, 152_000_000, 0.6]);
    // (304,000,000 + 152,000,000 − 2,500,000) × 60% = 272,100,000 → ×1.1
    expect(a.totalTax).toBe(299_310_000);
  });
});

describe("역방향 — 첫 자산이 부수토지, 짝 주택이 토지만 본인 · 같은 세대 · 합가", () => {
  it("🔑 합가 2020: primary__appurtenant 장특 13,828,571(= floor(31,428,571 × 44%)) · 합계 60,286,600", async () => {
    const a = await agg(reverse(SAM_REV("2020-01-01")));
    expect(card(a, "primary__appurtenant").longTermHoldingDeduction).toBe(13_828_571);
    // 소득 105,600,001 + 17,600,000 + 76,000,000 − 2,500,000 = 196,700,001 × 38%(절사) − 19,940,000 = 54,806,000 → ×1.1
    expect(a.totalTax).toBe(60_286_600);
  });
  it("🔑 합가 2023-06-01: 장특 7,542,857(= floor(31,428,571 × 24%)) · 합계 78,678,600", async () => {
    const a = await agg(reverse(SAM_REV("2023-06-01")));
    expect(card(a, "primary__appurtenant").longTermHoldingDeduction).toBe(7_542_857);
    expect(a.totalTax).toBe(78_678_600);
  });
  it("🔑 합가 2025-01-01: 비과세 아님 · 장특 24,000,000 · 소득 76,000,000 · 60%(104-1-2) · 합계 160,886,000", async () => {
    const a = await agg(reverse(SAM_REV("2025-01-01")));
    const c = card(a, "primary__appurtenant");
    expect([c.isPartialExempt, ...vals(c), c.rateClause]).toEqual([false, 24_000_000, 76_000_000, "104-1-2"]);
    // (136,800,000 + 76,000,000) × 60% = 127,680,000 + 초과분 20,080,000 − 1,500,000 = 146,260,000 → ×1.1 (h1 값은 12억 단위 몫 재배분 — 측정 일치)
    expect(a.totalTax).toBe(160_886_000);
  });
});

describe("불변 짝 — 합가일이 값에 닿지 않는 조합은 수정 전과 같다", () => {
  it("처음부터 같은 세대(합가 없음) · 합가일이 짝 주택보다 이른 날 · 소유자 같음: 부수토지 카드 값 = 수정 전 측정값", async () => {
    for (const own of [MERGE(), MERGE("2012-01-01"), {}]) {
      const a = await agg(forward(own));
      expect(vals(card(a, "c1__appurtenant")), JSON.stringify(own)).toEqual([16_800_000, 11_200_000]);
      const one = await agg(forward({ ...own, ...oneLand }));
      expect(vals(card(one, "c1")), JSON.stringify(own)).toEqual([48_000_000, 32_000_000]);
    }
    expect((await agg(forward(MERGE()))).totalTax).toBe(32_873_500);
    expect((await agg(forward({ ...MERGE("2012-01-01"), ...oneLand }))).totalTax).toBe(19_013_500);
    expect((await agg(reverse(SAM_REV()))).totalTax).toBe(45_573_000);
    expect(vals(card(await agg(reverse(SAM_REV("2012-01-01"))), "primary__appurtenant"))).toEqual([18_857_142, 12_571_429]);
  });
});

describe("표시·고지 — 합가일이 값에 닿을 때만(AN-7 · AN-8)", () => {
  const cardNotices = (a: Agg) => (a.warnings ?? []).filter((w) => w.includes("부수토지 카드") && w.includes("합가일"));
  const lthdFormula = (c: Card) => (c.steps ?? []).find((st) => /장기보유/.test(st.label))?.formula ?? "";

  it("AN-7 표2가 이긴 카드의 산식 문구가 합가일 기준 연·개월을 쓴다(보유 6년 · 6년 1개월) — 수정 전 12년 1개월", async () => {
    const f = lthdFormula(card(await agg(forward({ ...MERGE("2020-01-01"), ...oneLand })), "c1"));
    expect(f).toContain("보유 6년×4%=24% + 거주 5년×4%=20% = 44%");
    expect(f).toContain("보유기간 6년 1개월");
    expect(lthdFormula(card(await agg(reverse(SAM_REV("2020-01-01"))), "primary__appurtenant"))).toContain("보유기간 6년 1개월");
  });
  it("AN-7 개월 표시도 합가일 기준 — 합가 2020-05-10이면 5년 9개월(주택 기준 12년 1개월과 개월이 달라 구분된다) · 표2 5×4% + 거주 5×4% = 40%", async () => {
    const f = lthdFormula(card(await agg(forward({ ...MERGE("2020-05-10"), ...oneLand })), "c1"));
    expect(f).toContain("보유 5년×4%=20% + 거주 5년×4%=20% = 40%");
    expect(f).toContain("보유기간 5년 9개월");
  });
  it("AN-8 합가일이 값에 닿는 부수토지 카드마다 고지 1건(합가 2020·2023·2025 · 순·역방향 · 「확인 필요」 병기)", async () => {
    for (const d of ["2020-01-01", "2023-06-01", "2025-01-01"]) {
      const n = cardNotices(await agg(forward({ ...MERGE(d), ...oneLand })));
      expect(n.length, d).toBe(1);
      expect(n[0], d).toContain(`합가일(${d})`);
      expect(n[0], d).toContain("확인이 필요합니다");
    }
    expect(cardNotices(await agg(reverse(SAM_REV("2020-01-01")))).length).toBe(1);
    // 분리 배치는 이내분 카드에만(초과분 카드는 표2·비과세 자산이 아니다)
    expect(cardNotices(await agg(forward(MERGE("2020-01-01")))).length).toBe(1);
  });
  it("AN-8 부정 짝 — 합가 없음 · 합가일이 짝 주택보다 이른 날 · 소유자 같음 · 다른 세대에는 없다", async () => {
    for (const own of [MERGE(), MERGE("2012-01-01"), {}, { selfOwns: "land_only", buildingOwnerSameHousehold: false }]) {
      expect(cardNotices(await agg(forward({ ...own, ...oneLand }))), JSON.stringify(own)).toEqual([]);
    }
  });
});
