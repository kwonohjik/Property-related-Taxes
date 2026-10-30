/**
 * O-23 route anchor — 기준시가가 같은 부수토지 카드의 입력 순서를 바꿔도 총세액·카드별 양도가액이 같다.
 *
 * 시료: 주택 + 기준시가 400,000 카드 3장(c1 차손 · c2·c3 이익), 1세대 주택 수 1 · 2.
 * 종전: 입력 순서상 마지막 카드가 안분 잔액 1원을 받아 총세액이 175,068,811 ↔ 175,068,810으로 갈렸다(순열 6개 중).
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

type L = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ZONE = { buildingFootprintArea: 100, isUrbanArea: true, appurtenantLandZone: "metropolitan_residential" };

const land = (id: string, acquisitionPrice: number) => ({
  assetId: id,
  assetLabel: "부수토지",
  assetKind: "land",
  landNature: "appurtenant_to_housing",
  acquisitionCause: "purchase",
  acquisitionDate: "2025-01-01",
  fixedAcquisitionPrice: acquisitionPrice,
  standardPriceAtTransfer: 400_000,
  directExpenses: 0,
  isOneHousehold: true,
  areaM2: 100,
  reductions: [],
});

const base = (over: L) => ({
  propertyType: "housing",
  transferPrice: 1_600_000_000,
  transferDate: "2026-06-15",
  acquisitionPrice: 700_000_000,
  acquisitionDate: "2025-01-01",
  acquisitionCause: "purchase",
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 2,
  residencePeriodMonths: 12,
  isRegulatedArea: true,
  wasRegulatedAtAcquisition: true,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: true,
  reductions: [],
  annualBasicDeductionUsed: 0,
  ...ZONE,
  totalSalePrice: 2_000_000_000,
  standardPriceAtTransferForApportion: 1_600_000,
  isSeparateAcquisition: true,
  landAcquisitionDate: "2025-01-01",
  landAcqMode: "actual",
  buildingAcqMode: "actual",
  saleSplitMode: "actual",
  landTransferPrice: 800_000_000,
  buildingTransferPrice: 800_000_000,
  landAcquisitionPrice: 400_000_000,
  buildingAcquisitionPrice: 300_000_000,
  acquisitionArea: 100,
  transferArea: 100,
  landStandardPriceAtTransfer: 800_000_000,
  buildingStandardPriceAtTransfer: 800_000_000,
  ...over,
});

function perms<T>(a: T[]): T[][] {
  if (a.length <= 1) return [a];
  return a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((r) => [x, ...r]));
}

describe("O-23 — 같은 기준시가 카드 3장의 입력 순서는 총세액을 바꾸지 않는다", () => {
  for (const hc of [1, 2]) {
    it(`🔑 차손 카드 1장 + 이익 카드 2장, 주택 수 ${hc} — 6개 순열의 총세액·카드별 양도가액이 모두 같다`, async () => {
      const cards = [land("c1", 600_000_000), land("c2", 200_000_000), land("c3", 220_000_000)];
      const totals = new Set<number>();
      const prices = new Set<string>();
      for (const order of perms(cards)) {
        const res = await postTransfer(capResidenceToHolding(base({ householdHousingCount: hc, companionAssets: order })));
        expect(res.status).toBe(200);
        const agg = (res.json as L).data.aggregated;
        totals.add(agg.totalTax);
        prices.add(
          (agg.properties as L[])
            .map((p) => `${p.propertyId}:${p.transferPrice}`)
            .sort()
            .join("|"),
        );
      }
      expect([...totals]).toHaveLength(1);
      expect([...prices]).toHaveLength(1);
      if (hc === 1) expect([...totals][0]).toBe(175_068_811);
    });
  }
});
