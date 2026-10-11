/**
 * 「조세특례제한법」 §77⑨ — 상속받은 토지등은 피상속인 취득일로 §77① 「사업인정고시일부터 소급하여 2년 이전에 취득」을 판정한다.
 * route 경유(④ → ⑫ → ⑭ → 엔진) — 화면의 피상속인 취득일이 감면 판정까지 닿는지, 토지·건물을 따로 취득한 자산(5B 파트별 판정)에서
 * 상속받은 파트가 피상속인 취득일로 판정되는지 잠근다. 엔진 단위 케이스: `__tests__/tax-engine/transfer/expropriation-77-9-inheritance.anchor.test.ts`.
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";

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
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

/** 2주택(비과세 없음) · 토지 300→500 · 건물 150→300 · 양도 2026-06-30 · 사업인정고시 2025-06-01(소급 2년 = 2023-06-01) */
const house = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2010-03-02",
    landAcquisitionCause: "purchase",
    landCauseHost: "purchase",
    landAcquisitionDate: "2024-01-10",
    hasSeperateLandAcquisitionDate: true,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landAcquisitionPrice: "300,000,000",
    buildingAcquisitionPrice: "150,000,000",
    actualSalePrice: "800,000,000",
    saleSplitMode: "actual",
    landTransferPrice: "500,000,000",
    buildingTransferPrice: "300,000,000",
    landStandardPriceAtTransfer: "500,000,000",
    buildingStandardPriceAtTransfer: "300,000,000",
    acquisitionArea: "200",
    transferArea: "200",
    standardPricePerSqmAtAcq: "100000",
    ...over,
  }) as AssetForm;

const form = (a: AssetForm, over: Partial<TransferFormData> = {}): TransferFormData =>
  ({
    transferDate: "2026-06-30", filingDate: "2026-08-31", assets: [a], houses: [], presaleRights: [],
    contractTotalPrice: String(a.actualSalePrice).replace(/,/g, ""), bundledSaleMode: "actual",
    totalTransferExpense: "0", householdHousingCount: "2", isOneHousehold: false, ...over,
  }) as unknown as TransferFormData;

const PE = {
  reductions: [{ type: "public_expropriation", cashCompensation: 800_000_000, bondCompensation: 0, bondHoldingYears: null, businessApprovalDate: "2025-06-01" }],
  isOneHousehold: false, householdHousingCount: 2, transferCause: "public_expropriation",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function run(f: TransferFormData, extra: Record<string, unknown> = PE): Promise<any> {
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    cap.body = JSON.parse(String(init?.body));
    return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
  }));
  await callTransferTaxAPI(f);
  vi.unstubAllGlobals();
  const body = {
    isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false,
    annualBasicDeductionUsed: 0, ...cap.body, residencePeriodMonths: 0, ...extra,
  };
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }));
  const j = await res.json();
  expect(res.status, JSON.stringify(j).slice(0, 600)).toBe(200);
  return j.data.result;
}

describe("§77⑨ — 상속 토지등은 피상속인 취득일로 판정 (route)", () => {
  it("토지·건물 한 번에 상속(2024-01-10) · 피상속인 2000 취득 → 자산 전체 감면(종전 0)", async () => {
    const r = await run(form(house({
      hasSeperateLandAcquisitionDate: false, acquisitionCause: "inheritance", acquisitionDate: "2024-01-10",
      decedentAcquisitionDate: "2000-01-01", landAcquisitionCause: "", landCauseHost: "",
    } as never)));
    expect(r.publicExpropriationDetail.isEligible).toBe(true);
    expect(r.publicExpropriationDetail.partWise).toBeUndefined();
    expect(r.reductionAmount).toBe(44_851_500);
  }, 60_000);

  it("파트별 — 토지만 상속(2024-01-10 · 피상속인 2012) · 건물 2010 매매 → 두 파트 모두 충족, 자산 전체 감면(종전 건물분만 4,949,404)", async () => {
    const r = await run(form(house({ landAcquisitionCause: "inheritance", landCauseHost: "purchase", landDecedentAcquisitionDate: "2012-01-10" })));
    expect(r.publicExpropriationDetail.partWise).toBeUndefined();
    expect(r.reductionAmount).toBe(14_259_000);
  }, 60_000);

  it("긍정 짝 — 토지 피상속인도 소급 2년 안(2023-12-01) 취득 → 건물분만(매매 토지와 같은 값)", async () => {
    const r = await run(form(house({ landAcquisitionCause: "inheritance", landCauseHost: "purchase", landDecedentAcquisitionDate: "2023-12-01" })));
    expect(r.publicExpropriationDetail.partWise.eligiblePart).toBe("building");
    expect(r.reductionAmount).toBe(4_949_404);
  }, 60_000);

  it("파트별 — 건물 상속(2024-01-10 · 피상속인 2000) · 토지 2024-02-10 매매 → 건물분 감면(종전 두 파트 미충족 0)", async () => {
    const r = await run(form(house({
      acquisitionCause: "inheritance", acquisitionDate: "2024-01-10", decedentAcquisitionDate: "2000-01-01",
      landAcquisitionCause: "purchase", landCauseHost: "inheritance", landAcquisitionDate: "2024-02-10",
    })));
    expect(r.publicExpropriationDetail.partWise).toEqual({ eligiblePart: "building", eligibleIncome: 150_000_000, excludedIncome: 200_000_000, basicDeductionOnExcluded: 2_500_000 });
    expect(r.reductionAmount).toBe(7_320_431);
  }, 60_000);
});
