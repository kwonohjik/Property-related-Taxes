/**
 * 컴패니언(함께양도) 겸용주택 — 주택 카드의 세율 보유기간은 **주택분 하나**(토지·건물 중 늦은 취득일)로 판정한다.
 *
 * 「소득세법」 §104①2호 괄호 "주택(이에 딸린 토지로서 대통령령으로 정하는 토지를 포함한다. 이하 이 항에서 같다)" —
 * 주택과 그 부수토지는 한 보유기간으로 세율을 정한다(조심 2024인3140 · 단건 겸용 `rateParts` 주택분 `Math.min`).
 * 파트 카드는 장기보유특별공제를 파트별로 계산하려고 취득일을 카드마다 따로 가지는데, 종전엔 세율도 그 날짜로 판정해
 * 매매에서도 주택 토지·건물 카드가 서로 다른 세율을 받았다(토지 2015·건물 2023-09 → 토지 카드 누진, 정답 70%).
 * 상가 토지·건물은 주택이 아니라 각자 취득일 그대로다.
 * primary = 일반 주택(2015 매매) · companion = 겸용주택(매매) · 양도 2024-06-01. route 경유(⑧ → ④ → ⑫ → ⑭).
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

type Card = { propertyId: string; rateGroup: string; appliedRate: number; longTermHoldingDeduction: number };

/** 토지·건물 취득일이 다를 때 — 실거래가로 파트 취득가액을 직접 넣는다. */
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
  const base = bundledForm();
  const f = {
    ...base,
    assets: [base.assets[0], { ...base.assets[1], ...over }],
    isOneHousehold: false,
    householdNoOtherHousesConfirmed: true,
    householdNoPresaleRightsConfirmed: true,
  } as TransferFormData;
  expect([0, 1, 2, 3].flatMap((s) => collectStepIssues(s, f).map((i) => i.message))).toEqual([]);
  const r = await pipeline(f);
  expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
  const a = (r.json as { data: { aggregated: { totalTax: number; properties: Card[] } } }).data.aggregated;
  const card = (id: string) => a.properties.find((p) => String(p.propertyId).startsWith(id))!;
  return { a, card };
}

describe("컴패니언 겸용주택 — 주택 카드 세율 기산일 = 주택분 늦은 취득일 (매매)", () => {
  it("대조: 토지·건물 같은 날(2023-09-01) → 주택 카드 70% · 상가 카드 50%, 값 불변", async () => {
    const { a, card } = await calc({ acquisitionDate: "2023-09-01", useEstimatedAcquisition: false, fixedAcquisitionPrice: "400000000" });
    expect(card("mu-house-land").appliedRate).toBe(0.7);
    expect(card("mu-house-bld").appliedRate).toBe(0.7);
    expect(card("mu-comm-land").appliedRate).toBe(0.5);
    expect(a.totalTax).toBe(206_942_213);
  }, 60_000);

  it("토지 먼저(2015-03-01)·건물 2023-09-01 → 주택 토지 카드도 70%(종전 누진 · 160,675,214) · 상가 토지는 누진 그대로", async () => {
    const { a, card } = await calc(SEP("2023-09-01", "2015-03-01"));
    expect(card("mu-house-land").appliedRate).toBe(0.7);
    expect(card("mu-house-bld").appliedRate).toBe(0.7);
    expect(card("mu-comm-land").rateGroup).toBe("progressive");
    expect(card("mu-comm-bld").appliedRate).toBe(0.5);
    // 장특은 파트별 — 주택 토지 카드는 자기 취득일(2015) 기준 공제가 남는다(취득일은 바꾸지 않았다).
    expect(card("mu-house-land").longTermHoldingDeduction).toBeGreaterThan(0);
    expect(card("mu-house-bld").longTermHoldingDeduction).toBe(0);
  // §102② 차손 안분 잔액 1원의 자리 — 입력상 마지막 카드가 아니라 소수부가 큰 카드로(최대잉여법, 계획서 `transfer-split-basic-deduction-units-and-order-rounding.plan.md` §6). 종전 167,681,142.
    expect(a.totalTax).toBe(167_681_141);
  }, 60_000);

  it("토지 나중(2023-10-01)·건물 2009-03-01 → 주택 건물 카드도 70%(종전 누진 · 183,971,855) · 상가 건물은 누진 그대로", async () => {
    const { a, card } = await calc(SEP("2009-03-01", "2023-10-01"));
    expect(card("mu-house-land").appliedRate).toBe(0.7);
    expect(card("mu-house-bld").appliedRate).toBe(0.7);
    expect(card("mu-comm-bld").rateGroup).toBe("progressive");
    expect(card("mu-comm-land").appliedRate).toBe(0.5);
    expect(a.totalTax).toBe(199_811_855);
  }, 60_000);

  it("토지 먼저(2015)·건물 2022-09-01(1년 이상 2년 미만) → 주택 카드 둘 다 60%(종전 154,542,355)", async () => {
    const { a, card } = await calc(SEP("2022-09-01", "2015-03-01"));
    expect(card("mu-house-land").appliedRate).toBe(0.6);
    expect(card("mu-house-bld").appliedRate).toBe(0.6);
    expect(card("mu-comm-land").rateGroup).toBe("progressive");
  // §102② 차손 안분 잔액 1원의 자리 — 입력상 마지막 카드가 아니라 소수부가 큰 카드로(최대잉여법, 계획서 `transfer-split-basic-deduction-units-and-order-rounding.plan.md` §6). 종전 159,358,930.
    expect(a.totalTax).toBe(159_358_929);
  }, 60_000);
});
