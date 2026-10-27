/**
 * 함께 양도 묶음 — 토지만 본인 주택 카드의 토지 면적이 배율 한도 공유에 든다(§6.3 · 계획서 `docs/02-design/features/bundled-land-only-limit-share.plan.md`).
 *
 * 배율 한도(정착면적 × 배율 — 영 §154⑦)는 한 주택의 부수토지 면적 전체에 걸린다. 주택 카드가 스스로 든 토지(`acquisitionArea`)와
 * 같은 묶음의 부수토지 카드가 그 한도를 함께 쓰는데(K1), 종전에는 주택 카드 토지를 «토지·건물 모두 본인 소유»일 때만 셌다. #2645 D-2 이후 엔진은 토지만 본인
 * 카드의 배율 초과분도 분리하므로 조건이 그 범위와 어긋나 있었다 — 부수토지 카드가 한 장으로 남아 초과분 비사업용 분리가 없었다.
 *
 * 시료(독립 정수 산식): 20억 고가 · 주택 2014-01-01 취득 · 2026-02-16 양도 · 수도권 주거지역 3배 · 정착면적 100㎡ → 한도 300㎡
 *   주택 카드 자기 토지 200㎡ + 부수토지 카드 200㎡ = 400㎡ → 한도 잔여 100㎡ = 부수토지 카드의 이내분, 나머지 100㎡ = 초과분.
 *   부수토지 카드 양도가 4억 · 취득가 2억 → 면적 비율 ½씩: 이내분·초과분 각 양도가 2억 · 취득가 1억 · 양도차익 1억.
 *   초과분 장특 = 표1 토지 12년 24%(2014-01-01 ~ 2026-02-16) → 24,000,000 · 소득 76,000,000.
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
import { appurtenantLimitShareOf } from "@/app/api/calc/transfer/bundled-companion-split";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** route 원시 본문 — 주택 카드: 건물 8억(취득 3억) · 자기 토지 8억(취득 4억) 200㎡ · 부수토지 카드 4억(취득 2억) 200㎡ · 2026-02-16 양도(20억 고가) */
const houseCard = (over: Loose) => ({

    propertyType: "housing", transferPrice: 1_600_000_000, transferDate: "2026-02-16", acquisitionPrice: 700_000_000, acquisitionDate: "2014-01-01",
    acquisitionCause: "purchase", expenses: 0, useEstimatedAcquisition: false, householdHousingCount: 1, residencePeriodMonths: 60, isRegulatedArea: false,
    wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, isOneHousehold: true, reductions: [], annualBasicDeductionUsed: 0,
    buildingFootprintArea: 100, isUrbanArea: true, appurtenantLandZone: "metropolitan_residential", totalSalePrice: 2_000_000_000,
    standardPriceAtTransferForApportion: 1_600_000, isSeparateAcquisition: true, landAcquisitionDate: "2014-01-01", landAcqMode: "actual",
    buildingAcqMode: "actual", saleSplitMode: "actual", landTransferPrice: 800_000_000, buildingTransferPrice: 800_000_000,
    landAcquisitionPrice: 400_000_000, buildingAcquisitionPrice: 300_000_000, acquisitionArea: 200, transferArea: 200,
    landStandardPriceAtTransfer: 800_000_000, buildingStandardPriceAtTransfer: 800_000_000,
    companionAssets: [{
      assetId: "c1", assetLabel: "부수토지", assetKind: "land", landNature: "appurtenant_to_housing", acquisitionCause: "purchase", acquisitionDate: "2014-01-01",
      fixedAcquisitionPrice: 200_000_000, standardPriceAtTransfer: 400_000, directExpenses: 0, isOneHousehold: true, areaM2: 200, reductions: [],
    }],
    ...over,
  });

type Card = { propertyId: string; transferGain: number; income: number; longTermHoldingDeduction: number; splitDetail?: { land?: { taxableGainAfterProration?: number } } };
async function cards(over: Loose): Promise<Card[]> {
  const res = await postTransfer(houseCard(over));
  expect(res.status).toBe(200);
  return ((res.json as Loose).data?.aggregated?.properties ?? []) as Card[];
}
const ids = (cs: Card[]) => cs.map((c) => c.propertyId);
const byId = (cs: Card[], id: string) => cs.find((c) => c.propertyId === id)!;
const SAME = { selfOwns: "land_only", buildingOwnerSameHousehold: true };
const OTHER = { selfOwns: "land_only", buildingOwnerSameHousehold: false };

describe("§6.3 route — 토지만 본인 주택 카드의 토지 200㎡가 한도 300㎡를 부수토지 카드와 나눠 쓴다", () => {
  it("소유자 같음(기준) — 부수토지 카드가 이내분·초과분으로 갈린다: 각 양도차익 100,000,000 · 초과분 소득 76,000,000(장특 24,000,000)", async () => {
    const cs = await cards({});
    expect(ids(cs)).toEqual(["primary", "c1__appurtenant", "c1__excess"]);
    const [ap, ex] = [byId(cs, "c1__appurtenant"), byId(cs, "c1__excess")];
    expect([ap.transferGain, ex.transferGain, ex.income, ex.longTermHoldingDeduction]).toEqual([100_000_000, 100_000_000, 76_000_000, 24_000_000]);
  });

  it("토지만 본인 · 같은 세대 — 소유자 같음과 같이 갈리고 두 카드·주 카드 토지분이 소유자 같음과 일치한다(수정 전: c1 한 장 · 양도차익 200,000,000)", async () => {
    const both = await cards({});
    const same = await cards(SAME);
    expect(ids(same)).toEqual(["primary", "c1__appurtenant", "c1__excess"]);
    for (const id of ["c1__appurtenant", "c1__excess"]) {
      const [a, b] = [byId(same, id), byId(both, id)];
      expect([a.transferGain, a.income, a.longTermHoldingDeduction]).toEqual([b.transferGain, b.income, b.longTermHoldingDeduction]);
    }
    // 주 카드 토지분 과세 양도차익도 같은 사실(12억 안분 · 한도 내 토지)이라 소유자 같음의 토지 파트와 같다
    expect(byId(same, "primary").splitDetail!.land!.taxableGainAfterProration).toBe(byId(both, "primary").splitDetail!.land!.taxableGainAfterProration);
    expect([byId(same, "c1__excess").transferGain, byId(same, "c1__excess").income]).toEqual([100_000_000, 76_000_000]);
  });

  it("토지만 본인 · 다른 세대 — 초과분 카드가 같은 값으로 분리된다(초과 판정은 세대와 무관한 면적 사실)", async () => {
    const other = await cards(OTHER);
    expect(ids(other)).toEqual(["primary", "c1__appurtenant", "c1__excess"]);
    const ex = byId(other, "c1__excess");
    expect([ex.transferGain, ex.income, ex.longTermHoldingDeduction]).toEqual([100_000_000, 76_000_000, 24_000_000]);
  });

  it("건물만 본인 — 주택 카드 토지는 본인 것이 아니라 한도에 세지 않는다: 부수토지 카드는 한 장(200㎡ < 한도 300㎡)", async () => {
    const cs = await cards({ selfOwns: "building_only" });
    expect(ids(cs)).toEqual(["primary", "c1"]);
    expect(byId(cs, "c1").transferGain).toBe(200_000_000);
  });

  it("한도 이내(주택 카드 토지 100㎡ + 부수토지 카드 200㎡ = 300㎡)면 토지만 본인도 갈리지 않는다", async () => {
    const cs = await cards({ ...SAME, acquisitionArea: 100, transferArea: 100 });
    expect(ids(cs)).toEqual(["primary", "c1"]);
  });
});

describe("§6.3 route 함수 — appurtenantLimitShareOf: 주택 카드 토지 면적을 세는 소유 범위", () => {
  const companions = [{ assetKind: "land", landNature: "appurtenant_to_housing" as const, areaM2: 200 }];
  const share = (selfOwns?: "both" | "land_only" | "building_only") =>
    appurtenantLimitShareOf({ propertyType: "housing", selfOwns, acquisitionArea: 200 }, companions);

  it("both · 미지정 · land_only는 세고, building_only는 세지 않는다", () => {
    expect(share("both")).toEqual({ houseLandAreaM2: 200, appurtenantCardsAreaM2: 200 });
    expect(share(undefined)).toEqual({ houseLandAreaM2: 200, appurtenantCardsAreaM2: 200 });
    expect(share("land_only")).toEqual({ houseLandAreaM2: 200, appurtenantCardsAreaM2: 200 });
    expect(share("building_only")).toEqual({ houseLandAreaM2: undefined, appurtenantCardsAreaM2: 200 });
  });

  it("주택이 아니면 세지 않는다", () => {
    expect(appurtenantLimitShareOf({ propertyType: "land", selfOwns: "both", acquisitionArea: 200 }, companions).houseLandAreaM2).toBeUndefined();
  });
});
