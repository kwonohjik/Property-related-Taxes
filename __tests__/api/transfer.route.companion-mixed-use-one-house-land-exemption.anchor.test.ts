/**
 * 컴패니언(함께양도) 겸용주택 · 1세대1주택 — 주택 토지 카드의 비과세 보유기간은 **주택(건물) 취득일**부터 센다.
 *
 * 「소득세법 시행령」 §154① — 비과세 보유기간은 「해당 주택」의 보유기간이다. 토지를 먼저 샀어도 주택 취득 전의 토지 보유는
 * 주택부수토지로서의 보유가 아니다. 종전엔 파트 카드가 자기 취득일로 판정해, 토지 2015·건물 2023-09(주택 보유 2년 미만)에서
 * 주택 토지 카드만 비과세됐다. 단건 겸용(건물 취득일로 판정)·분리취득(`split-part-rate.anchor` A-13)은 전액 과세다.
 * 토지를 나중에 샀으면(2년 미만) 토지 카드는 과세·건물 카드는 비과세 — 분리취득 G-3과 같다(A-12b).
 * primary = 토지(독립 나대지) · companion = 겸용주택(매매) · 1세대1주택 · 양도 2024-06-01. route 경유(⑧ → ④ → ⑫ → ⑭).
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

type Card = { propertyId: string; isExempt: boolean; transferGain: number; rateGroup: string };

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

const ONE = {
  householdHousingCount: "1",
  isOneHousehold: true,
  householdNoOtherHousesConfirmed: true,
  householdNoPresaleRightsConfirmed: true,
  residencePeriodMonths: "0",
};

async function calc(over: Record<string, unknown>) {
  const base = bundledForm();
  const land = { ...base.assets[0], assetKind: "land", landType: "building_site", isNonBusinessLand: false, landNature: "standalone" };
  const f = { ...base, ...ONE, assets: [land, { ...base.assets[1], ...over }] } as TransferFormData;
  expect([0, 1, 2, 3].flatMap((s) => collectStepIssues(s, f).map((i) => i.message))).toEqual([]);
  const r = await pipeline(f);
  expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
  const a = (r.json as { data: { aggregated: { totalTax: number; properties: Card[] } } }).data.aggregated;
  const card = (id: string) => a.properties.find((p) => String(p.propertyId).startsWith(id))!;
  return { a, card };
}

describe("컴패니언 겸용주택 1세대1주택 — 주택 토지 카드 비과세 보유 기산일", () => {
  it("대조: 토지·건물 같은 날(2009) → 주택 카드 둘 다 비과세", async () => {
    const { a, card } = await calc({ acquisitionDate: "2009-03-01", useEstimatedAcquisition: false, fixedAcquisitionPrice: "400000000" });
    expect(card("mu-house-land").isExempt).toBe(true);
    expect(card("mu-house-bld").isExempt).toBe(true);
    expect(a.totalTax).toBe(99_834_623);
  }, 60_000);

  it("토지 먼저(2015)·건물 2023-09(주택 보유 2년 미만) → 주택 토지 카드도 과세(종전 비과세 · 151,400,608)", async () => {
    const { a, card } = await calc(SEP("2023-09-01", "2015-03-01"));
    expect(card("mu-house-land").isExempt).toBe(false);
    expect(card("mu-house-land").transferGain).toBe(26_785_714);
    expect(card("mu-house-bld").isExempt).toBe(false);
    expect(a.totalTax).toBe(167_681_142);
  }, 60_000);

  it("토지 나중(2023-10, 보유 2년 미만)·건물 2009 → 토지 카드 과세 · 건물 카드 비과세(분리취득 G-3과 같음, 불변)", async () => {
    const { a, card } = await calc(SEP("2009-03-01", "2023-10-01"));
    expect(card("mu-house-land").isExempt).toBe(false);
    expect(card("mu-house-bld").isExempt).toBe(true);
    expect(a.totalTax).toBe(187_004_712);
  }, 60_000);

  it("토지 먼저(2015)·건물 2021-09(주택 보유 2년 이상) → 주택 카드 둘 다 비과세(불변)", async () => {
    const { a, card } = await calc(SEP("2021-09-01", "2015-03-01"));
    expect(card("mu-house-land").isExempt).toBe(true);
    expect(card("mu-house-bld").isExempt).toBe(true);
    expect(a.totalTax).toBe(126_927_428);
  }, 60_000);
});
