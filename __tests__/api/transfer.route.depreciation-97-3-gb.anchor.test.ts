/**
 * route anchor — 일반건물(토지+건물 일괄) §97③ 감가상각비 (Phase B-2)
 *
 * 폼 → ④ → ⑫ → ⑭ → 카드(원건물) → 단건 엔진까지 **세액에 닿는지**를 본다(침묵 strip 방지).
 * 감가상각비는 **건물분**에 귀속된다 — 원건물 카드의 취득가액에서만 공제되고 토지·증축분 카드는 불변이다.
 * 합계 양도차익의 차이가 정확히 감가상각비다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST as SINGLE } from "@/app/api/calc/transfer/route";
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

type Form = ReturnType<typeof createDefaultTransferFormData>;
type Obj = Record<string, unknown>;

const TD = "2026-06-03";
const rates = loadFallbackTransferRates(new Date(TD));

function form(over: Partial<AssetForm> = {}): Form {
  const f = createDefaultTransferFormData();
  f.assets[0] = {
    ...f.assets[0],
    assetKind: "general_building",
    addressJibun: "서울 강남구 테스트동 1-1",
    acquisitionCause: "purchase",
    acquisitionDate: "2015-03-01",
    actualSalePrice: "1000000000",
    fixedAcquisitionPrice: "500000000",
    gbLandArea: "200",
    gbBuildingFootprintArea: "100",
    gbZoneType: "commercial",
    gbTransferLandPricePerSqm: "3000000",
    gbTransferBuildingValue: "200000000",
    gbAcqLandPricePerSqm: "1000000",
    gbAcqBuildingValue: "100000000",
    gbBuildingAcquisitionCause: "purchase",
    ...over,
  } as AssetForm;
  return Object.assign(f, {
    transferDate: TD,
    contractTotalPrice: "1000000000",
    householdHousingCount: "0",
    isOneHousehold: false,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
  });
}

async function bodyOf(send: () => Promise<unknown>): Promise<Obj> {
  let body: unknown;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as Response;
    }),
  );
  await send().catch(() => undefined);
  vi.unstubAllGlobals();
  return body as Obj;
}

interface Card {
  propertyId: string;
  transferGain: number;
  acquisitionPrice: number;
  necessaryExpense: number;
  depreciationAmount?: number;
}

async function run(f: Form) {
  const body = await bodyOf(() => callTransferTaxAPI(f));
  const res = await SINGLE(
    new NextRequest("http://l/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  const json = (await res.json()) as { data: { aggregated: { properties: Card[]; totalTax: number } } };
  expect(res.status, JSON.stringify(json).slice(0, 500)).toBe(200);
  const cards = json.data.aggregated.properties;
  return {
    body,
    cards,
    totalTax: json.data.aggregated.totalTax,
    gain: cards.reduce((s, c) => s + c.transferGain, 0),
    building: cards.find((c) => !c.propertyId.startsWith("land"))!,
    lands: cards.filter((c) => c.propertyId.startsWith("land")),
  };
}

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(rates as never);
});
afterEach(() => vi.unstubAllGlobals());

describe("E0-1 실가 경로 — 건물 카드에서만 공제한다", () => {
  it("🔴 합계 양도차익이 감가상각비만큼 커지고 건물 카드만 바뀐다", async () => {
    const base = await run(form({ depreciationAmount: "0" }));
    const dep = await run(form({ depreciationAmount: "20000000" }));
    expect(dep.body.generalBuildingValuation).toBeDefined();
    expect((dep.body.generalBuildingValuation as Obj).depreciationAmount).toBe(20_000_000);
    expect(dep.gain).toBe(base.gain + 20_000_000);
    expect(dep.building.depreciationAmount).toBe(20_000_000);
    expect(dep.building.transferGain).toBe(base.building.transferGain + 20_000_000);
    // 토지 카드는 불변
    expect(dep.lands.map((c) => c.transferGain)).toEqual(base.lands.map((c) => c.transferGain));
    // 항등식: 카드 취득가액은 공제 후
    expect(dep.building.acquisitionPrice).toBe(base.building.acquisitionPrice - 20_000_000);
    expect(dep.totalTax).toBeGreaterThan(base.totalTax);
  });

  it("긍정 짝 — 0·미입력이면 body에 키가 없고 종전과 같다", async () => {
    const a = await run(form({ depreciationAmount: "0" }));
    expect((a.body.generalBuildingValuation as Obj).depreciationAmount).toBeUndefined();
    expect(a.building.depreciationAmount).toBeUndefined();
  });
});

describe("E0-2 환산 경로 — 같은 규칙, swap 비교는 공제 후", () => {
  const est = (over: Partial<AssetForm> = {}) =>
    form({
      useEstimatedAcquisition: true,
      fixedAcquisitionPrice: "",
      ...over,
    });

  it("🔴 환산 — 건물 카드 취득가액에서 공제한다", async () => {
    const base = await run(est({ depreciationAmount: "0" }));
    const dep = await run(est({ depreciationAmount: "10000000" }));
    expect(dep.gain).toBe(base.gain + 10_000_000);
    expect(dep.building.depreciationAmount).toBe(10_000_000);
    expect(dep.lands.map((c) => c.transferGain)).toEqual(base.lands.map((c) => c.transferGain));
  });
});
