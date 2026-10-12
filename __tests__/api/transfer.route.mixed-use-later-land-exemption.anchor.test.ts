/**
 * 단건 겸용주택 · 1세대1주택 — 주택보다 나중에 취득한 부수토지가 보유요건(「소득세법 시행령」 §154①) 미만이면 그 토지분은
 * 비과세에서 뺀다(분리취득 G-3과 같은 규칙). 종전에는 보유요건을 건물 취득일 하나로만 판정해 전부 비과세했다.
 * 엔진 단위 anchor: `__tests__/tax-engine/transfer/mixed-use-later-land-exemption-g3.anchor.test.ts`.
 * route 경유(⑧ → ④ → ⑫ → ⑭ → 겸용 엔진). 양도 2024-06-01.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));
import { POST } from "@/app/api/calc/transfer/route";
import { withIdentityHousingBuildingStdOnForm } from "../tax-engine/_helpers/mixed-use-identity-std-form";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
type Form = ReturnType<typeof createDefaultTransferFormData>;
beforeEach(() => { vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates()); });
const issues = (f: Form) => [0, 1, 2, 3].flatMap((s) => collectStepIssues(s, f).map((i) => i.message));
async function run(f: Form, extra: Record<string, unknown> = {}) {
  let body: unknown;
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init: { body: string }) => { body = JSON.parse(init.body); return new Response(JSON.stringify({ data: {} }), { status: 200 }); }));
  try { await callTransferTaxAPI(f).catch(() => undefined); } finally { vi.unstubAllGlobals(); }
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...(body as object), ...extra }) }));
  return { status: res.status, json: await res.json(), body: body as Record<string, unknown> };
}
const MIXED = {
  assetKind: "housing", isMixedUseHouse: true, acquisitionCause: "purchase", acquisitionDate: "2009-03-01", useEstimatedAcquisition: true,
  addressRoad: "서울 강남구 테헤란로 1", residentialFloorArea: "60", nonResidentialFloorArea: "40", buildingFootprintArea: "50",
  mixedUseTotalLandArea: "600", mixedZoneType: "general_residential", mixedTransferHousingPrice: "900000000",
  mixedTransferCommercialBuildingPrice: "300000000", mixedTransferLandPricePerSqm: "2000000", mixedAcqHousingPrice: "300000000",
  mixedAcqCommercialBuildingPrice: "100000000", mixedAcqLandPricePerSqm: "1000000",
};
function mixedForm(over: Record<string, unknown> = {}): Form {
  const f = createDefaultTransferFormData();
  f.assets[0] = { ...f.assets[0], residenceInputMode: "direct", residencePeriods: [], ...MIXED, ...over } as Form["assets"][number];
  Object.assign(f, { transferDate: "2024-06-01", filingDate: "2024-08-31", contractTotalPrice: "1,200,000,000", householdHousingCount: "2",
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, residencePeriodMonths: "0" });
  return withIdentityHousingBuildingStdOnForm(f, { acqN: 90_000_000 });
}
const ONE = { householdHousingCount: "1", isOneHousehold: true };
const SEP = (building: string, land: string) => ({
  acquisitionDate: building,
  landAcquisitionDate: land,
  hasSeperateLandAcquisitionDate: true,
  mixedAcqLandPricePerSqmAtBuildingAcq: "1500000",
  useEstimatedAcquisition: false,
  fixedAcquisitionPrice: "400000000",
  landAcquisitionPrice: "250000000",
  buildingAcquisitionPrice: "150000000",
});

async function calc(over: Record<string, unknown>) {
  const f = mixedForm(over);
  Object.assign(f, ONE);
  expect(issues(f)).toEqual([]);
  const r = await run(f);
  expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
  return r.json.data.result;
}

describe("단건 겸용 1세대1주택 — 나중 취득 부수토지 보유요건 미만분 과세", () => {
  it("건물 2009 · 토지 2023-10(보유 8개월) → 토지분 과세 (종전 전부 비과세 · 226,428,570)", async () => {
    const r = await calc(SEP("2009-03-01", "2023-10-01"));
    expect(r.housingPart.incomeAmount).toBe(91_071_429);
    expect(r.commercialPart.incomeAmount).toBe(60_714_286);
    expect(r.total.determinedTax).toBe(320_035_713);
  }, 60_000);

  it("대조: 토지 2015 먼저 · 건물 2021-09(보유 2년 이상) → 주택분 비과세(불변)", async () => {
    const r = await calc(SEP("2021-09-01", "2015-03-01"));
    expect(r.housingPart.incomeAmount).toBe(0);
    expect(r.total.determinedTax).toBe(159_506_427);
  }, 60_000);
});
