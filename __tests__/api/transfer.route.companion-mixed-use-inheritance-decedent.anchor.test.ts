/**
 * 컴패니언(함께양도) 겸용주택 — 상속받은 겸용주택의 피상속인 취득일이 파트 카드 판정에 닿는다.
 *
 * 파트 카드 경로(`mixed-use-part-cards.ts`)는 겸용 서브엔진의 `total`을 버리고 안분·환산 값만 쓰며,
 * 세율·장기보유특별공제·감면은 카드(aggregate item)마다 단건 엔진이 다시 판정한다. 그래서 단건 겸용 경로의
 * 결함(#2130 — 피상속인 취득일이 겸용 엔진에 닿지 않음)이 이 경로에는 **없었다**. 그 사실을 잠근다.
 *  - 「소득세법」 §104②1호 — 상속받은 자산의 단기보유 세율 보유기간은 피상속인 취득일부터.
 *  - 「조세특례제한법」 §77⑨ — 상속받은 토지등의 「소급 2년 이전 취득」은 피상속인 취득일로.
 * primary = 일반 주택(2015 매매) · companion = 겸용주택(상속 2023-09-01) · 양도 2024-06-01. route 경유(⑧ → ④ → ⑫ → ⑭).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
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

import { POST } from "@/app/api/calc/transfer/route";
import { withIdentityHousingBuildingStdOnForm } from "../tax-engine/_helpers/mixed-use-identity-std-form";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

async function pipeline(form: TransferFormData, patch?: (b: unknown) => void) {
  let captured: unknown = null;
  const orig = global.fetch;
  global.fetch = (async (_u: unknown, init: { body?: string }) => {
    captured = JSON.parse(init?.body ?? "{}");
    return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) };
  }) as unknown as typeof fetch;
  try {
    await callTransferTaxAPI(form);
  } catch {
    /* body만 필요하다 */
  }
  global.fetch = orig;
  patch?.(captured);
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      body: JSON.stringify(captured),
      headers: { "content-type": "application/json" },
    }),
  );
  return {
    body: captured as { companionAssets?: Array<{ assetKind?: string; mixedUse?: Record<string, unknown> }> },
    status: res.status,
    json: (await res.json()) as Record<string, unknown>,
  };
}

type AggProp = { propertyId?: unknown; rateGroup?: unknown };
function aggregated(r: { json: Record<string, unknown> }) {
  return (r.json as { data?: { aggregated?: { properties?: AggProp[] } } }).data?.aggregated ?? {};
}

/** 겸용주택 — 주택 60㎡ · 상가 40㎡ · 정착 50㎡ · 대지 600㎡(배율초과 발생). */
const MIXED_FIELDS = {
  assetKind: "housing",
  isMixedUseHouse: true,
  acquisitionCause: "purchase",
  acquisitionDate: "2009-03-01",
  useEstimatedAcquisition: false,
  residentialFloorArea: "60",
  nonResidentialFloorArea: "40",
  buildingFootprintArea: "50",
  mixedUseTotalLandArea: "600",
  // 부수토지가 정착면적의 3배 초과 ⇒ 용도지역 필수 (2026-09-06 · UI 리뷰). 주제와 무관한 축이라 값만 채운다.
  mixedZoneType: "general_residential",
  mixedTransferHousingPrice: "900000000",
  mixedTransferCommercialBuildingPrice: "300000000",
  mixedTransferLandPricePerSqm: "2000000",
  mixedAcqHousingPrice: "300000000",
  mixedAcqCommercialBuildingPrice: "100000000",
  mixedAcqLandPricePerSqm: "1000000",
};

function asset(i: number, over: Record<string, unknown> = {}) {
  return {
    ...makeDefaultAsset(i), addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2015-03-01",
    useEstimatedAcquisition: false,
    fixedAcquisitionPrice: "300000000",
    actualSalePrice: "600000000",
    standardPriceAtTransfer: "500000000",
    standardPriceAtAcq: "250000000",
    ...over,
  };
}

/** primary 주택 + companion 겸용주택. 기준시가를 같게 두어 안분이 50:50. */
function bundledForm(): TransferFormData {
  // S3-2 ④ — 나목은 폼 필드에서 실려 간다(body shim 아님).
  return withIdentityHousingBuildingStdOnForm({
    ...createDefaultTransferFormData(),
    assets: [
      asset(1),
      asset(2, { ...MIXED_FIELDS, standardPriceAtTransfer: "500000000", actualSalePrice: "600000000" }),
    ],
    transferDate: "2024-06-01",
    filingDate: "2024-08-31",
    contractTotalPrice: "1200000000",
    householdHousingCount: "2",
  } as TransferFormData);
}

const INH = { acquisitionCause: "inheritance", acquisitionDate: "2023-09-01", mixedHousingInheritedValueOverride: "400000000", mixedCommercialInheritedValueOverride: "200000000" };
const PE = { type: "public_expropriation", cashCompensation: 600_000_000, bondCompensation: 0, businessApprovalDate: "2024-03-01" };

async function calc(over: Record<string, unknown>, withPE = false) {
  const base = bundledForm();
  const f = {
    ...base,
    assets: [base.assets[0], { ...base.assets[1], ...over }],
    isOneHousehold: false,
    householdNoOtherHousesConfirmed: true,
    householdNoPresaleRightsConfirmed: true,
  } as TransferFormData;
  expect([0, 1, 2, 3].flatMap((s) => collectStepIssues(s, f).map((i) => i.message))).toEqual([]);
  const r = await pipeline(f, withPE ? (b) => {
    const c = (b as { companionAssets: Array<Record<string, unknown>> }).companionAssets[0];
    c.reductions = [PE];
    c.transferCause = "public_expropriation";
  } : undefined);
  expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
  const a = aggregated(r) as { totalTax: number; reductionAmount: number; properties: Array<{ propertyId: string; rateGroup: string; appliedRate: number }> };
  const card = (id: string) => a.properties.find((p) => String(p.propertyId).startsWith(id))!;
  return { a, card };
}

describe("컴패니언 겸용주택 — 상속 피상속인 취득일", () => {
  it("대조: 매매 2023-09-01 → 주택 카드 70% · 상가 카드 50%", async () => {
    const { a, card } = await calc({ acquisitionDate: "2023-09-01" });
    expect(card("mu-house-land").appliedRate).toBe(0.7);
    expect(card("mu-comm-bld").appliedRate).toBe(0.5);
    expect(a.totalTax).toBe(264_520_338);
  }, 60_000);

  it("§104②1호 — 피상속인 2000 취득 → 모든 카드 단기세율 아님", async () => {
    const { a, card } = await calc({ ...INH, decedentAcquisitionDate: "2000-01-01" });
    for (const id of ["mu-house-land", "mu-house-bld", "mu-comm-land", "mu-comm-bld"]) expect(card(id).rateGroup).toBe("progressive");
    expect(a.totalTax).toBe(79_849_000);
  }, 60_000);

  it("긍정 짝 — 피상속인 2023-06-01 취득 → 주택 60% · 상가 40%", async () => {
    const { a, card } = await calc({ ...INH, decedentAcquisitionDate: "2023-06-01" });
    expect(card("mu-house-bld").appliedRate).toBe(0.6);
    expect(card("mu-comm-land").appliedRate).toBe(0.4);
    expect(a.totalTax).toBe(85_264_628);
  }, 60_000);

  it("§77⑨ — 사업인정고시 2024-03-01 · 피상속인 2000 → 감면 성립", async () => {
    const { a } = await calc({ ...INH, decedentAcquisitionDate: "2000-01-01" }, true);
    expect(a.reductionAmount).toBe(4_258_726);
    expect(a.totalTax).toBe(76_016_145);
  }, 60_000);

  it("§77 긍정 짝 — 피상속인도 소급 2년 안(2023-06-01) · 매매 2023-09-01 → 불성립", async () => {
    expect((await calc({ ...INH, decedentAcquisitionDate: "2023-06-01" }, true)).a.reductionAmount).toBe(0);
    expect((await calc({ acquisitionDate: "2023-09-01" }, true)).a.reductionAmount).toBe(0);
  }, 60_000);
});
