/**
 * 함께 양도 × 주택 부수토지 카드(L-1b)를 주 주택보다 늦게 취득 × 주 자산이 **구간 입력** — 카드 보유기간과 겹친 거주 개월만 센다
 * (계획서 split-land-residence-rate-4289 §8 Q-5-1 · 직접 입력은 카드 보유 개월 상한 + 확인 필요, 구간 입력은 ④ 겹침 · 고지 없음).
 *
 * 시료는 `transfer.route.bundled-appurtenant-card-later-land.anchor.test.ts` B4의 카드와 같되 주 카드 토지는 주택과 같은 날 취득(고지가 카드 것만 남는다) — 주택 2014-01-01 · 카드(토지) 2022-06-01(보유 44개월) · 양도 2026-02-16 · 거주 60개월.
 *   과세 몫 80,000,000. 표2 보유 3년 12%. 거주분: 직접 입력 min(60, 44) = 3년 12% → 24% → 19,200,000.
 *   겹침 24개월 → 2년 8% → 20% → 16,000,000 · 겹침 0 → 거주분 없음 → 12% → 9,600,000. 표2 대상 판정(거주 60개월 = 5년)은 어느 경우든 그대로라 12%(표2)다 — 표1이면 6%.
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

const SAME = {};
const ZONE = { buildingFootprintArea: 100, isUrbanArea: true, appurtenantLandZone: "metropolitan_residential" };
const D22 = "2022-06-01";

const card = (acquisitionDate: string, extra: Loose = {}) => ({
  assetId: "c1", assetLabel: "부수토지", assetKind: "land", landNature: "appurtenant_to_housing", acquisitionCause: "purchase", acquisitionDate,
  fixedAcquisitionPrice: 200_000_000, standardPriceAtTransfer: 400_000, directExpenses: 0, isOneHousehold: true, areaM2: 100, reductions: [], ...extra,
});
const forward = (extra: Loose = {}, over: Loose = {}) => ({
  propertyType: "housing", transferPrice: 1_600_000_000, transferDate: "2026-02-16", acquisitionPrice: 700_000_000, acquisitionDate: "2014-01-01",
  acquisitionCause: "purchase", expenses: 0, useEstimatedAcquisition: false, householdHousingCount: 1, residencePeriodMonths: 60, isRegulatedArea: false,
  wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, isOneHousehold: true, reductions: [], annualBasicDeductionUsed: 0,
  ...ZONE, totalSalePrice: 2_000_000_000, standardPriceAtTransferForApportion: 1_600_000, isSeparateAcquisition: true, landAcquisitionDate: "2014-01-01",
  landAcqMode: "actual", buildingAcqMode: "actual", saleSplitMode: "actual", landTransferPrice: 800_000_000, buildingTransferPrice: 800_000_000,
  landAcquisitionPrice: 400_000_000, buildingAcquisitionPrice: 300_000_000, acquisitionArea: 100, transferArea: 100,
  landStandardPriceAtTransfer: 800_000_000, buildingStandardPriceAtTransfer: 800_000_000,
  companionAssets: [card(D22, extra)],
  ...SAME, ...over,
});

type Card = { propertyId: string; longTermHoldingDeduction: number; income: number };
async function run(extra: Loose = {}, over: Loose = {}) {
  const res = await postTransfer(forward(extra, over));
  const json = res.json as Loose;
  return { status: res.status, json, props: (json.data?.aggregated?.properties ?? []) as Card[], warnings: (json.data?.aggregated?.warnings ?? []) as string[] };
}
const c1 = (r: Awaited<ReturnType<typeof run>>) => r.props.find((p) => p.propertyId === "c1")!;
const primary = (r: Awaited<ReturnType<typeof run>>) => r.props.find((p) => p.propertyId === "primary")!;
const capNote = (r: Awaited<ReturnType<typeof run>>) => r.warnings.filter((w) => w.includes("토지 보유기간 중 거주만 셉니다"));

describe("카드를 늦게 취득 — route(⑫⑭) → 엔진 L-1b", () => {
  it("직접 입력(키 없음): 거주 min(60, 44) = 3년 → 카드 장특 19,200,000 · 고지 1건 (직전 값과 같다)", async () => {
    const r = await run();
    expect(r.status).toBe(200);
    expect(c1(r).longTermHoldingDeduction).toBe(19_200_000);
    expect(capNote(r)).toHaveLength(1);
  });

  it("구간 입력 겹침 24개월: 카드 거주 2년 → 20% = 16,000,000 · 고지 없음", async () => {
    const r = await run({ landHoldingResidenceMonths: 24 });
    expect(r.status, JSON.stringify(r.json.error ?? {})).toBe(200);
    expect(c1(r).longTermHoldingDeduction).toBe(16_000_000);
    expect(capNote(r)).toHaveLength(0);
  });

  it("겹침 0(카드 취득 전에만 거주): 거주분 없음 12% = 9,600,000 · 표2 대상 판정은 거주 60개월 그대로(표1이면 6%) · 주 카드 값 불변", async () => {
    const direct = await run();
    const r = await run({ landHoldingResidenceMonths: 0 });
    expect(r.status).toBe(200);
    expect(c1(r).longTermHoldingDeduction).toBe(9_600_000);
    expect(primary(r).longTermHoldingDeduction).toBe(primary(direct).longTermHoldingDeduction);
    expect(capNote(r)).toHaveLength(0);
  });

  it("겹침이 카드 보유 개월 이상이어도(44 = 직접 입력 상한과 같다) 고지 없음 — 구간 입력이므로", async () => {
    const r = await run({ landHoldingResidenceMonths: 44 });
    expect(c1(r).longTermHoldingDeduction).toBe(19_200_000);
    expect(capNote(r)).toHaveLength(0);
  });
});

describe("⑫ 게이트 — 카드 모양에서만 받고 그 밖은 계속 400", () => {
  it("카드를 주 주택보다 먼저 취득(2010-01-01): 값이 와도 400", async () => {
    const r = await run({ landHoldingResidenceMonths: 10 }, { companionAssets: [card("2010-01-01", { landHoldingResidenceMonths: 10 })] });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.json)).toContain("landHoldingResidenceMonths");
  });
  it("거주 합계(60)를 넘으면 400 · 정확히 60은 통과", async () => {
    expect((await run({ landHoldingResidenceMonths: 61 })).status).toBe(400);
    expect((await run({ landHoldingResidenceMonths: 60 })).status).toBe(200);
  });
  it("독립 나대지(landNature non_appurtenant)에 값이 오면 400", async () => {
    const r = await run({ landHoldingResidenceMonths: 10, landNature: "non_appurtenant" });
    expect(r.status).toBe(400);
  });
  it("주 자산이 주택이 아니면(토지) 400", async () => {
    const r = await run({ landHoldingResidenceMonths: 10 }, { propertyType: "land", landNature: "appurtenant_to_housing", isSeparateAcquisition: undefined, landAcquisitionDate: undefined });
    expect(r.status).toBe(400);
  });
});
