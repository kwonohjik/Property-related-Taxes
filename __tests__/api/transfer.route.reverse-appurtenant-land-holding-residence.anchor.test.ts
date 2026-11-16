/**
 * G1 역방향(첫 자산이 주택 부수토지 · 주택은 함께 양도) × 부수토지를 주택보다 나중에 취득 — API 직접 호출의 「토지 보유기간 중 거주 개월」.
 *
 * 계획서: docs/00-pm/split-land-residence-rate-4289.plan.md §8 (PR-2 남은 한계 1)
 * 같은 사실을 주택 먼저(K1)로 보내면 부수토지 카드에 `landHoldingResidenceMonths`를 받았는데, 토지 먼저(G1)로 보내면 ⑫가 같은 키를 400으로 막아
 * 엔진이 직접 입력 상한(min)으로만 계산했다(실측: 주택 먼저 겹침 0 → 총세액 4,707,213 · 고지 0건 / 토지 먼저 → 4,141,500 · 고지 2건).
 * 짝 주택은 route가 역방향 단위를 만드는 주택이다(`reverse-appurtenant-wire.ts` — route·⑫ 공용). 화면은 이 구성을 ⑧이 막는다.
 * 시료: 주택 2014-01-01 · 부수토지 두 필지 2022-06-01(각 100㎡) · 정착면적 100㎡ · 수도권 주거 · 1세대1주택 · 거주 142개월 · 양도 2026-02-16 · 14억.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (o) => ({ ...(await o<typeof import("@/lib/db/tax-rates")>()), preloadTaxRates: vi.fn() }));
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { LAND_HOLDING_RESIDENCE_CARD_GATE_MESSAGE, LAND_HOLDING_RESIDENCE_EXCEEDS_MESSAGE } from "@/lib/tax-engine/transfer-land-holding-residence";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

type Prop = { propertyId: string; longTermHoldingDeduction: number };
type Json = { data?: { aggregated: { totalTax: number; warnings?: string[]; properties: Prop[] } }; error?: { fieldErrors?: Record<string, string[]> } };
async function post(body: object): Promise<{ status: number; json: Json }> {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  return { status: res.status, json: (await res.json()) as Json };
}

const ZONE = { buildingFootprintArea: 100, isUrbanArea: true, appurtenantLandZone: "metropolitan_residential" };
const COMMON = {
  transferDate: "2026-02-16", acquisitionCause: "purchase", expenses: 0, useEstimatedAcquisition: false, residencePeriodMonths: 142, isRegulatedArea: false,
  wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, reductions: [], annualBasicDeductionUsed: 0, isOneHousehold: true, householdHousingCount: 1,
};
const house = (o: object = {}) => ({
  assetId: "h1", assetLabel: "주택", assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2014-01-01", fixedAcquisitionPrice: 500_000_000,
  standardPriceAtTransfer: 1_000_000, directExpenses: 0, isOneHousehold: true, reductions: [], ...ZONE, ...o,
});
const card = (id: string, o: object = {}) => ({
  assetId: id, assetLabel: id, assetKind: "land", landNature: "appurtenant_to_housing", acquisitionCause: "purchase", acquisitionDate: "2022-06-01",
  fixedAcquisitionPrice: 100_000_000, standardPriceAtTransfer: 200_000, directExpenses: 0, isOneHousehold: true, areaM2: 100, reductions: [], ...o,
});
/** 토지 먼저(G1) — 첫 자산 토지 = 부수토지 c1 */
const reverse = (top: object = {}, c2: object = {}, h: object = {}) => ({
  ...COMMON, propertyType: "land", landNature: "appurtenant_to_housing", acquisitionDate: "2022-06-01", transferPrice: 200_000_000, acquisitionPrice: 100_000_000,
  acquisitionArea: 100, transferArea: 100, totalSalePrice: 1_400_000_000, standardPriceAtTransferForApportion: 200_000,
  companionAssets: [house(h), card("c2", c2)], ...top,
});
/** 주택 먼저(K1) — 같은 사실 */
const forward = (c1: object = {}, c2: object = {}) => ({
  ...COMMON, ...ZONE, propertyType: "housing", acquisitionDate: "2014-01-01", transferPrice: 1_000_000_000, acquisitionPrice: 500_000_000,
  totalSalePrice: 1_400_000_000, standardPriceAtTransferForApportion: 1_000_000, companionAssets: [card("c1", c1), card("c2", c2)],
});
const ltd = (j: Json, id: string) => j.data!.aggregated.properties.find((p) => p.propertyId === id)!.longTermHoldingDeduction;
const capNotes = (j: Json) => (j.data!.aggregated.warnings ?? []).filter((w) => w.includes("토지 보유기간 중 거주만 셉니다"));

describe("G1 역방향 — 부수토지의 토지 보유기간 중 거주 개월", () => {
  it("🔑 parity — 토지 먼저 겹침 0(첫 자산 토지·부수토지 카드) = 주택 먼저 겹침 0: 총세액·부수토지 장특·고지 0건", async () => {
    const rv = await post(reverse({ landHoldingResidenceMonths: 0 }, { landHoldingResidenceMonths: 0 }));
    const fw = await post(forward({ landHoldingResidenceMonths: 0 }, { landHoldingResidenceMonths: 0 }));
    expect(rv.status, JSON.stringify(rv.json.error)).toBe(200);
    expect(fw.status).toBe(200);
    expect(rv.json.data!.aggregated.totalTax).toBe(fw.json.data!.aggregated.totalTax);
    expect(rv.json.data!.aggregated.totalTax).toBe(4_707_213);
    expect(ltd(rv.json, "primary")).toBe(ltd(fw.json, "c1"));
    expect(ltd(rv.json, "c2")).toBe(ltd(fw.json, "c2"));
    expect(ltd(rv.json, "h1")).toBe(ltd(fw.json, "primary"));
    expect(capNotes(rv.json)).toHaveLength(0);
  });

  it("첫 자산 토지에만 겹침 0: 그 토지 장특이 줄고(직접 상한 3,428,571 → 1,714,285) 키 없는 부수토지 카드만 상한 고지 1건", async () => {
    const dir = await post(reverse());
    const r = await post(reverse({ landHoldingResidenceMonths: 0 }));
    expect(r.status, JSON.stringify(r.json.error)).toBe(200);
    expect(ltd(dir.json, "primary")).toBe(3_428_571);
    expect(ltd(r.json, "primary")).toBe(1_714_285);
    expect(ltd(r.json, "c2")).toBe(ltd(dir.json, "c2"));
    expect(capNotes(dir.json)).toHaveLength(2);
    expect(capNotes(r.json)).toHaveLength(1);
  });

  it("거주 합계는 짝 주택 카드 값 — 주택 카드 30개월이면 31개월은 400(첫 자산 토지 · 부수토지 카드)", async () => {
    for (const [body, path] of [
      [reverse({ landHoldingResidenceMonths: 31 }, {}, { residencePeriodMonths: 30 }), "landHoldingResidenceMonths"],
      [reverse({}, { landHoldingResidenceMonths: 31 }, { residencePeriodMonths: 30 }), "companionAssets.1.landHoldingResidenceMonths"],
    ] as const) {
      const r = await post(body);
      expect(r.status, path).toBe(400);
      expect(r.json.error?.fieldErrors?.[path], path).toEqual([LAND_HOLDING_RESIDENCE_EXCEEDS_MESSAGE]);
    }
    expect((await post(reverse({ landHoldingResidenceMonths: 30 }, {}, { residencePeriodMonths: 30 }))).status).toBe(200);
  });

  it("게이트 — 부수토지가 주택과 같은 날·먼저면 400(카드 규칙 문구)", async () => {
    for (const d of ["2014-01-01", "2010-01-01"]) {
      const r = await post(reverse({ acquisitionDate: d, landHoldingResidenceMonths: 0 }));
      expect(r.status, d).toBe(400);
      expect(r.json.error?.fieldErrors?.landHoldingResidenceMonths, d).toEqual([LAND_HOLDING_RESIDENCE_CARD_GATE_MESSAGE]);
    }
  });

  it("게이트 — route가 역방향 단위를 만들지 않는 본문(정착면적 없음 · 주택 2건)은 400 — 엔진이 읽지 않아 조용히 버려지지 않게", async () => {
    const noFootprint = reverse({ landHoldingResidenceMonths: 0 }, {}, { buildingFootprintArea: undefined });
    const twoHouses = { ...reverse({ landHoldingResidenceMonths: 0 }), companionAssets: [house(), house({ assetId: "h2" }), card("c2")] };
    for (const [name, body] of [["정착면적 없음", noFootprint], ["주택 2건", twoHouses]] as const) {
      const r = await post(body);
      expect(r.status, name).toBe(400);
      expect(r.json.error?.fieldErrors?.landHoldingResidenceMonths, name).toEqual([LAND_HOLDING_RESIDENCE_CARD_GATE_MESSAGE]);
    }
  });
});
