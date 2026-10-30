/**
 * 함께 양도 × 부수토지 카드 차손 — 번들은 «한 주택 안에서 한 파트가 차손인 경우»의 엔진 규약과 같다
 * (계획서 `docs/02-design/features/land-only-v8-merged-vs-bundle.plan.md` V-8 · Q-1 a — 코드 불변, 안전망 추가).
 *
 * 규약: 장기보유특별공제(소득세법 §95②)는 양수 양도차익에만 걸고, 차손은 장특 뒤 양도소득금액에서 통산한다
 * (소득세법 §102② · 영 §167의2① · 조심 국심2007중3718). 번들 카드 차손과 단일 주택 파트 차손이 이 규약을 공유한다.
 * 「합쳐 입력」(두 필지 손익을 한 토지 파트로 미리 상계)은 다른 사실관계라서 장특이 작아진다 — 두 경로가 다른 것이 정상이다.
 *
 * 독립 산식(2026-06-15 양도 · 조정지역 · 모의 세율표 · 기본공제 2,500,000 · 2014 취득 = 보유 12년 24%):
 *   ① 같은 세대 1주택 고가주택(양도가 20억 → 12억 초과 비율 40%): 과세 양도차익 (9억 − 2억) × 40% = 280,000,000
 *      장특 = 주택 과세분 360,000,000 × 24% = 86,400,000 (차손 카드 8,000만은 장특 0) → 양도소득금액 193,600,000 → 과세표준 191,100,000
 *      산출세액 191,100,000 × 38% − 19,940,000 = 52,678,000 → × 1.1 = 57,945,800
 *   ② 다른 세대(토지만 본인): 주택 토지 4억 − 카드 2억. 장특 = 4억 × 24% = 96,000,000 → 양도소득금액 104,000,000 → 과세표준 101,500,000
 *      101,500,000 × 35% − 15,440,000 = 20,085,000 → × 1.1 = 22,093,500   (합쳐 입력: 순 2억 × 24% = 48,000,000 → 과세표준 149,500,000 → 36,885,000 × 1.1 = 40,573,500)
 *   ③ 카드 차익(2014 · 같은 세대): 과세 (9억 + 2억) × 40% = 440,000,000 · 장특 105,600,000 → 과세표준 331,900,000 × 40% − 25,940,000 = 106,820,000 → × 1.1 = 117,502,000
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

const ZONE = { buildingFootprintArea: 100, isUrbanArea: true, appurtenantLandZone: "metropolitan_residential" };
const OTHER_HOUSEHOLD = { selfOwns: "land_only", buildingOwnerSameHousehold: false };

const card = (acquisitionDate: string, fixedAcquisitionPrice: number, extra: Loose = {}) => ({
  assetId: "c1", assetLabel: "부수토지", assetKind: "land", landNature: "appurtenant_to_housing", acquisitionCause: "purchase", acquisitionDate,
  fixedAcquisitionPrice, standardPriceAtTransfer: 400_000, directExpenses: 0, isOneHousehold: true, areaM2: 100, reductions: [], ...extra,
});

/** 주택(주 카드) 16억·취득 7억 + 카드 */
const base = (acq: string, householdHousingCount: number, over: Loose) => ({
  propertyType: "housing", transferPrice: 1_600_000_000, transferDate: "2026-06-15", acquisitionPrice: 700_000_000, acquisitionDate: acq,
  acquisitionCause: "purchase", expenses: 0, useEstimatedAcquisition: false, householdHousingCount, residencePeriodMonths: 12, isRegulatedArea: true,
  wasRegulatedAtAcquisition: true, isUnregistered: false, isNonBusinessLand: false, isOneHousehold: true, reductions: [], annualBasicDeductionUsed: 0,
  ...ZONE, totalSalePrice: 2_000_000_000, standardPriceAtTransferForApportion: 1_600_000, isSeparateAcquisition: true, landAcquisitionDate: acq,
  landAcqMode: "actual", buildingAcqMode: "actual", saleSplitMode: "actual", landTransferPrice: 800_000_000, buildingTransferPrice: 800_000_000,
  landAcquisitionPrice: 400_000_000, buildingAcquisitionPrice: 300_000_000, acquisitionArea: 100, transferArea: 100,
  landStandardPriceAtTransfer: 800_000_000, buildingStandardPriceAtTransfer: 800_000_000, companionAssets: [], ...over,
});

/** 번들 — 카드를 컴패니언으로 */
const bundle = (acq: string, hc: number, cardPrice: number, household: Loose = {}) =>
  base(acq, hc, { ...household, companionAssets: [card(acq, cardPrice, household)] });

/** 합쳐 입력 — 카드를 없애고 양도가 20억·토지 12억·토지 취득가 4억 + 카드 취득가 */
const merged = (acq: string, hc: number, cardPrice: number, household: Loose = {}) =>
  base(acq, hc, {
    ...household, acquisitionArea: 200, transferArea: 200, transferPrice: 2_000_000_000, acquisitionPrice: 700_000_000 + cardPrice,
    landTransferPrice: 1_200_000_000, landAcquisitionPrice: 400_000_000 + cardPrice,
  });

/** 한 주택 안 파트 차손 — 양도가 20억: 토지 12억(취득 3억 → +9억) · 건물 8억(취득 10억 → −2억) */
const singlePartLoss = (acq: string) =>
  base(acq, 1, {
    acquisitionArea: 200, transferArea: 200, transferPrice: 2_000_000_000, acquisitionPrice: 1_300_000_000,
    landTransferPrice: 1_200_000_000, landAcquisitionPrice: 300_000_000, buildingAcquisitionPrice: 1_000_000_000,
    landStandardPriceAtTransfer: 1_200_000_000, buildingStandardPriceAtTransfer: 800_000_000,
  });

type Agg = { totalTax: number; totalLongTermHoldingDeduction: number; totalIncomeAfterOffset: number; taxBase: number; properties: { propertyId: string; income: number }[]; lossOffsetTable: { fromPropertyId: string; toPropertyId: string; amount: number; scope: string }[] };
type Single = { totalTax: number; longTermHoldingDeduction: number; taxBase: number };

async function call(body: Loose): Promise<Loose> {
  const res = await postTransfer(capResidenceToHolding(body));
  expect(res.status, JSON.stringify((res.json as Loose).error)).toBe(200);
  return (res.json as Loose).data;
}
const bundleOf = async (body: Loose) => (await call(body)).aggregated as Agg;
const singleOf = async (body: Loose) => (await call(body)).result as Single;
const tableOf = (a: Agg) => a.lossOffsetTable.map((t) => `${t.fromPropertyId}->${t.toPropertyId}:${t.amount}:${t.scope}`);

describe("V-8 — 번들 카드 차손 = 단일 주택 파트 차손 (같은 세대 1주택 · 2014 취득)", () => {
  it("📐 E1 번들: 장특은 주택 과세분에만(86,400,000) · 카드 소득 −80,000,000을 장특 뒤 통산 · 합계 57,945,800", async () => {
    const a = await bundleOf(bundle("2014-01-01", 1, 600_000_000));
    expect(a.totalLongTermHoldingDeduction).toBe(86_400_000);
    expect(a.properties.find((p) => p.propertyId === "c1")!.income).toBe(-80_000_000);
    expect(tableOf(a)).toEqual(["c1->primary:80000000:same_group"]);
    expect(a.totalIncomeAfterOffset).toBe(193_600_000);
    expect(a.taxBase).toBe(191_100_000);
    expect(a.totalTax).toBe(57_945_800);
  });

  it("📐 E2 단일 주택 파트 차손: 같은 규약 — 장특 86,400,000 · 과세표준 191,100,000 · 합계 57,945,800 (= E1)", async () => {
    const r = await singleOf(singlePartLoss("2014-01-01"));
    expect(r.longTermHoldingDeduction).toBe(86_400_000);
    expect(r.taxBase).toBe(191_100_000);
    expect(r.totalTax).toBe(57_945_800);
  });

  it("📐 E3 합쳐 입력은 필지 손익을 미리 상계해 장특이 작다(67,200,000) — 번들과 달라야 정상 · 65,971,400", async () => {
    const r = await singleOf(merged("2014-01-01", 1, 600_000_000));
    expect(r.longTermHoldingDeduction).toBe(67_200_000); // 순 2.8억 × 24%
    expect(r.totalTax).toBe(65_971_400);
  });
});

describe("V-8 — 다른 세대(토지만 본인) · 2014 취득 · 카드 차손", () => {
  it.each([1, 2])("📐 E4 hc%i: 번들 장특 96,000,000 · 합계 22,093,500 / 합쳐 입력 장특 48,000,000 · 합계 40,573,500", async (hc) => {
    const a = await bundleOf(bundle("2014-01-01", hc, 600_000_000, OTHER_HOUSEHOLD));
    expect(a.totalLongTermHoldingDeduction).toBe(96_000_000); // 주택 토지 차익 4억 × 24%, 차손 카드는 장특 0
    expect(a.taxBase).toBe(101_500_000);
    expect(a.totalTax).toBe(22_093_500);
    const r = await singleOf(merged("2014-01-01", hc, 600_000_000, OTHER_HOUSEHOLD));
    expect(r.longTermHoldingDeduction).toBe(48_000_000); // 순 2억 × 24%
    expect(r.totalTax).toBe(40_573_500);
  });
});

describe("V-8 — 차이가 나지 않는 셀은 번들 = 합쳐 입력 (장특이 선형이거나 0)", () => {
  it("📐 E5 카드 차익(2014 · 같은 세대): 둘 다 117,502,000", async () => {
    expect((await bundleOf(bundle("2014-01-01", 1, 200_000_000))).totalTax).toBe(117_502_000);
    expect((await singleOf(merged("2014-01-01", 1, 200_000_000))).totalTax).toBe(117_502_000);
  });

  it("📐 E6 장특율 0(2025 취득)에서 카드 차손: 둘 다 460,350,000", async () => {
    expect((await bundleOf(bundle("2025-01-01", 1, 600_000_000))).totalTax).toBe(460_350_000);
    expect((await singleOf(merged("2025-01-01", 1, 600_000_000))).totalTax).toBe(460_350_000);
  });
});
