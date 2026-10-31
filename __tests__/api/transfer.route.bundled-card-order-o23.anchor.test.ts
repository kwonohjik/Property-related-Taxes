/**
 * O-23 route anchor — 기준시가가 같은 부수토지 카드의 입력 순서를 바꿔도 총세액·카드별 양도가액이 같다.
 *
 * 시료: 주택 + 기준시가 400,000 카드 3장(c1 차손 · c2·c3 이익), 1세대 주택 수 1 · 2.
 * 종전: 입력 순서상 마지막 카드가 안분 잔액 1원을 받아 총세액이 175,068,811 ↔ 175,068,810으로 갈렸다(순열 6개 중).
 *
 * Step 5(공통경비, `commonTransferExpense`)도 같은 구조였다 — 마지막 카드가 잔액을 흡수해 카드별 필요경비가 1원씩 옮겨 가고,
 * 일부 시료는 총세액이 381,581,301 ↔ 381,581,302로 갈렸다(지금은 302 하나). 이제 흡수자는 입력 순서와 무관하다.
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

const land = (id: string, acquisitionPrice: number, acquisitionDate = "2025-01-01") => ({
  assetId: id,
  assetLabel: "부수토지",
  assetKind: "land",
  landNature: "appurtenant_to_housing",
  acquisitionCause: "purchase",
  acquisitionDate,
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

describe("Step 5 — 공통경비가 있어도 같은 기준시가 카드 3장의 입력 순서는 총세액·카드별 필요경비를 바꾸지 않는다", () => {
  // 필요경비 시료는 취득시 기준시가 3종이 필요하다(별도 취득 환산 경로) — 칸이 비면 400
  const withCe = (over: L) =>
    base({
      standardPricePerSqmAtAcquisition: 3_000_000,
      standardPriceAtAcquisition: 600_000_000,
      buildingStandardPriceAtAcquisition: 300_000_000,
      ...over,
    });
  const cardOf = (propertyId: string) => propertyId.split("__")[0];

  const run = async (cards: L[], hc: number, ce: number) => {
    const totals = new Set<number>();
    const expenses = new Set<string>();
    let first: L | undefined;
    for (const order of perms(cards)) {
      const res = await postTransfer(
        capResidenceToHolding(withCe({ householdHousingCount: hc, commonTransferExpense: ce, companionAssets: order })),
      );
      expect(res.status).toBe(200);
      const agg = (res.json as L).data.aggregated;
      first ??= agg;
      totals.add(agg.totalTax);
      const byCard: Record<string, number> = {};
      for (const p of agg.properties as L[]) byCard[cardOf(p.propertyId)] = (byCard[cardOf(p.propertyId)] ?? 0) + (p.necessaryExpense ?? 0);
      expenses.add(
        Object.keys(byCard)
          .sort()
          .map((k) => `${k}:${byCard[k]}`)
          .join("|"),
      );
    }
    return { totals: [...totals], expenses: [...expenses], first: first as L };
  };

  it("🔑 ggMix(취득 연도가 섞인 카드) · 주택 수 1 · 공통경비 3,000,001 — 총세액이 하나뿐이다", async () => {
    const cards = [
      land("c1", 200_000_000, "2014-01-01"),
      land("c2", 250_000_000),
      land("c3", 220_000_000),
    ];
    const r = await run(cards, 1, 3_000_001);
    expect(r.totals).toEqual([381_581_302]);
    expect(r.expenses).toHaveLength(1);
  });

  it("🔑 gg · 공통경비 1,000,003 — 카드별 필요경비가 6개 순열 모두 같다", async () => {
    const cards = [land("c1", 200_000_000), land("c2", 250_000_000), land("c3", 150_000_000)];
    for (const hc of [1, 2]) {
      const r = await run(cards, hc, 1_000_003);
      expect(r.totals).toHaveLength(1);
      expect(r.expenses).toHaveLength(1);
    }
  });
});
