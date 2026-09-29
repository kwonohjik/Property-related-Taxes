/**
 * 양도세 — ⑧을 통과해 **화면에서 닿던** 누락 (2026-09-30 Zod↔엔진 필수 점검 · 계획서
 * `docs/00-pm/zod-engine-required-mismatch.plan.md`).
 *
 * 폼 → ⑧ `collectStepIssues(0..3)` → ④ `callTransferTaxAPI` 본문 → 실제 route.
 *
 * - MU-1 겸용 환산: 취득시 개별주택공시가격이 비면 주택분 취득가액이 조용히 0 (175,236,001 → 238,236,001)
 * - MU-2 겸용: 취득시 상가건물 기준시가·개별공시지가가 비면 엔진이 던져 500
 * - MU-3 겸용 PHD: 최초공시일 토지 단가가 비면 ④가 PHD 객체를 빼고 보내 주택분 0 (134,004,001 → 238,236,001)
 * - Z1 부담부증여 일반건물: 용도지역이 비면 500 (⑧ 부담부증여 분기가 요구하지 않았다)
 * - Z1b 무허가 건물: 용도지역 선택이 숨겨지는데 ⑧이 요구했다(보이지 않는 칸) — 엔진은 요구하지 않는다
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

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

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";

type Form = ReturnType<typeof createDefaultTransferFormData>;

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

function issues(f: Form): string[] {
  return [0, 1, 2, 3].flatMap((s) => collectStepIssues(s, f).map((i) => i.message));
}

/** ④ 본문을 가로채 실제 route에 보낸다 */
async function run(f: Form) {
  let body: unknown;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init: { body: string }) => {
      body = JSON.parse(init.body);
      return new Response(JSON.stringify({ data: {} }), { status: 200 });
    }),
  );
  try {
    await callTransferTaxAPI(f).catch(() => undefined);
  } finally {
    vi.unstubAllGlobals();
  }
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: await res.json(), body: body as Record<string, unknown> };
}

const MIXED = {
  assetKind: "housing",
  isMixedUseHouse: true,
  acquisitionCause: "purchase",
  acquisitionDate: "2009-03-01",
  useEstimatedAcquisition: true,
  addressRoad: "서울 강남구 테헤란로 1",
  residentialFloorArea: "60",
  nonResidentialFloorArea: "40",
  buildingFootprintArea: "50",
  mixedUseTotalLandArea: "600",
  mixedZoneType: "general_residential",
  mixedTransferHousingPrice: "900000000",
  mixedTransferCommercialBuildingPrice: "300000000",
  mixedTransferLandPricePerSqm: "2000000",
  mixedAcqHousingPrice: "300000000",
  mixedAcqCommercialBuildingPrice: "100000000",
  mixedAcqLandPricePerSqm: "1000000",
};
function mixedForm(over: Record<string, unknown> = {}): Form {
  const f = createDefaultTransferFormData();
  f.assets[0] = { ...f.assets[0], ...MIXED, ...over } as Form["assets"][number];
  Object.assign(f, {
    transferDate: "2024-06-01",
    filingDate: "2024-08-31",
    contractTotalPrice: "1,200,000,000",
    householdHousingCount: "2",
    residencePeriodMonths: "0",
  });
  return f;
}
const detTax = (json: { data: { result: { total: { determinedTax: number } } } }) =>
  json.data.result.total.determinedTax;

describe("겸용주택 — 취득시 기준시가", () => {
  it("🟢 모두 있음 → ⑧ 통과 · 200 · 175,236,001", async () => {
    const f = mixedForm();
    expect(issues(f)).toEqual([]);
    const r = await run(f);
    expect(r.status).toBe(200);
    expect(detTax(r.json)).toBe(175_236_001);
  });

  it("MU-1 🔴 취득시 개별주택공시가격 빈 칸 → ⑧ 차단 · ⑫ 400 (종전 200 · 주택분 0 · 238,236,001)", async () => {
    const f = mixedForm({ mixedAcqHousingPrice: "" });
    expect(issues(f).join("|")).toMatch(/취득시 개별주택공시가격/);
    const r = await run(f);
    expect(r.status).toBe(400);
    expect(Object.keys(r.json.error.fieldErrors)).toContain("mixedUse.acquisitionStandardPrice.housingPrice");
  });

  it("MU-1b 🔴 신축도 같은 경로", async () => {
    const f = mixedForm({
      acquisitionCause: "newConstruction",
      useEstimatedAcquisition: false,
      fixedAcquisitionPrice: "300000000",
      mixedAcqHousingPrice: "",
    });
    expect(issues(f).join("|")).toMatch(/취득시 개별주택공시가격/);
  });

  it.each([
    ["둘 다", { mixedAcqCommercialBuildingPrice: "", mixedAcqLandPricePerSqm: "" }],
    ["건물만", { mixedAcqCommercialBuildingPrice: "" }],
    ["토지만", { mixedAcqLandPricePerSqm: "" }],
  ])("MU-2 🔴 상가 취득시 기준시가 %s 빈 칸 → ⑧ 차단 · ⑫ 400 (종전 500)", async (_n, over) => {
    const f = mixedForm(over);
    expect(issues(f).join("|")).toMatch(/취득시 상가건물 기준시가와 개별공시지가/);
    const r = await run(f);
    expect(r.status).toBe(400);
  });

  it("MU-2b 🔴 1985 이후 상속 — 평가액만으로는 상가분 기준시가를 대신하지 못한다 (종전 500)", async () => {
    const f = mixedForm({
      acquisitionCause: "inheritance",
      acquisitionDate: "2010-03-01",
      decedentAcquisitionDate: "2000-01-01",
      useEstimatedAcquisition: false,
      mixedHousingInheritedValueOverride: "400000000",
      mixedCommercialInheritedValueOverride: "200000000",
      mixedAcqCommercialBuildingPrice: "",
      mixedAcqLandPricePerSqm: "",
    });
    expect(issues(f).join("|")).toMatch(/취득시 상가건물 기준시가와 개별공시지가/);
  });
});

describe("겸용주택 PHD", () => {
  const PHD = {
    acquisitionDate: "2003-03-01",
    mixedAcqHousingPrice: "",
    usePreHousingDisclosure: true,
    phdFirstDisclosureDate: "2005-04-30",
    phdFirstDisclosureHousingPrice: "400000000",
    phdTransferHousingPrice: "900000000",
  };
  it("🟢 최초공시일 토지 단가 있음 → 200 · 134,004,001", async () => {
    const f = mixedForm({ ...PHD, phdLandPricePerSqmAtFirst: "800000" });
    expect(issues(f)).toEqual([]);
    const r = await run(f);
    expect(r.status).toBe(200);
    expect(detTax(r.json)).toBe(134_004_001);
  });
  it("MU-3 🔴 최초공시일 토지 단가 빈 칸 → ⑧ 차단 · ⑫ 400 (종전 PHD 객체 누락 · 주택분 0 · 238,236,001)", async () => {
    const f = mixedForm(PHD);
    expect(issues(f).join("|")).toMatch(/최초공시일 토지 단위 공시지가/);
    const r = await run(f);
    expect(r.status).toBe(400);
    expect(Object.keys(r.json.error.fieldErrors)).toContain("mixedUse.preHousingDisclosure");
  });
});

describe("일반건물 용도지역", () => {
  const GB = {
    assetKind: "general_building",
    transferType: "burdened_gift",
    acquisitionCause: "purchase",
    acquisitionDate: "2010-03-01",
    addressRoad: "서울 강남구 테헤란로 1",
    bgValuationMode: "sangjeungbeop_standard",
    bgLendingDepositTotal: "200000000",
    bgMortgageDebtAmount: "0",
    bgAnnualRentTotal: "0",
    bgDonorRelation: "lineal_descendant",
    gbLandArea: "100",
    gbBuildingArea: "200",
    gbBuildingFootprintArea: "50",
    gbTransferLandPricePerSqm: "2000000",
    gbTransferBuildingValue: "200000000",
    gbAcqLandPricePerSqm: "1000000",
    gbAcqBuildingValue: "100000000",
    gbBuildingAcquisitionCause: "purchase",
    gbZoneType: "general_residential",
  };
  function gbForm(over: Record<string, unknown> = {}): Form {
    const f = createDefaultTransferFormData();
    f.assets[0] = { ...f.assets[0], ...GB, ...over } as Form["assets"][number];
    Object.assign(f, {
      transferDate: "2024-06-01",
      filingDate: "2024-08-31",
      contractTotalPrice: "500,000,000",
      householdHousingCount: "0",
    });
    return f;
  }
  it("🟢 부담부증여 GB 용도지역 있음 → 200 · 11,441,760", async () => {
    const f = gbForm();
    expect(issues(f)).toEqual([]);
    const r = await run(f);
    expect(r.status).toBe(200);
    expect(r.json.data.aggregated.totalTax).toBe(11_441_760);
  });
  it("Z1 🔴 부담부증여 GB 용도지역 빈 칸 → ⑧ 차단 · ⑫ 400 (종전 500)", async () => {
    const f = gbForm({ gbZoneType: "" });
    expect(issues(f).join("|")).toMatch(/용도지역을 선택하세요/);
    const r = await run(f);
    expect(r.status).toBe(400);
    expect(Object.keys(r.json.error.fieldErrors)).toContain("generalBuildingValuation.zoneType");
  });
  it("Z1c 🟢 무허가 건물은 용도지역을 요구하지 않는다 → 200 · 같은 세액", async () => {
    const f = gbForm({ gbZoneType: "", gbUnapprovedBuilding: true });
    expect(issues(f)).toEqual([]);
    const r = await run(f);
    expect(r.status).toBe(200);
    expect(r.json.data.aggregated.totalTax).toBe(11_441_760);
  });
  it("Z1b 🟢 일반 GB + 무허가 — ⑧이 숨겨진 용도지역을 요구하지 않는다", () => {
    const f = gbForm({ transferType: "regular", gbZoneType: "", gbUnapprovedBuilding: true, useEstimatedAcquisition: true });
    expect(issues(f).join("|")).not.toMatch(/용도지역을 선택하세요/);
  });
});
