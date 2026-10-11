/**
 * 5A — 나중에 취득한 부수토지(보유요건 미달)에 「소득세법 시행령」 제154조 제1항 단서 제2호 가목(수용)을 적용하는가.
 *
 * 가목의 대상은 「주택 및 그 부수토지(사업인정 고시일 전에 취득한 주택 및 그 부수토지에 한한다)」이고, 단서는
 * 「그 보유기간 및 거주기간의 제한을 받지 않」는다. 종전에는 G-3(나중 취득 부수토지 보유요건)이 단서를 보지 않아
 * 고시일 전에 취득한 토지분도 전액 과세됐다(재실측 B-5 A1: 130,350,000). 2026-10-11 사용자 결정 — 문언대로 + 확인 필요 고지.
 * route 경유(④ → ⑫ → ⑭ → 엔진).
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

const house = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2018-03-02",
    landAcquisitionCause: "purchase",
    landCauseHost: "purchase",
    landAcquisitionDate: "2025-01-10",
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

const form = (a: AssetForm, transferDate = "2026-06-30"): TransferFormData =>
  ({
    transferDate, filingDate: "2026-08-31", assets: [a], houses: [], presaleRights: [],
    contractTotalPrice: "800000000", bundledSaleMode: "actual",
    totalTransferExpense: "0", householdHousingCount: "1", isOneHousehold: true,
  }) as unknown as TransferFormData;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function run(f: TransferFormData, extra: Record<string, unknown>): Promise<any> {
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

const proviso = (businessApprovalDate: string, expropriationDate = "2026-06-30") => ({
  oneHouseExemptionProviso: { reason: "expropriation", businessApprovalDate, expropriationDate },
  isOneHousehold: true, householdHousingCount: 1,
});
const NOTICE = "나중에 취득한 부수토지에 이 단서를 적용한 정면 해석례는 확인하지 못했습니다";
const hasNotice = (r: { warnings?: string[] }) => (r.warnings ?? []).some((w) => w.includes(NOTICE));

describe("5A — 나중 취득 부수토지 × 수용 단서(영 §154① 단서 2호 가목)", () => {
  it("토지를 고시일 전에 취득(보유 1년 5개월) → 단서가 덮어 전액 비과세 + 확인 필요 고지", async () => {
    const r = await run(form(house()), proviso("2025-06-01"));
    expect(r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
    expect(hasNotice(r)).toBe(true);
  }, 60_000);

  it("대조: 단서 없음 → 토지분 보유요건 미달로 과세(종전 값 그대로), 고지 없음", async () => {
    const r = await run(form(house()), { isOneHousehold: true, householdHousingCount: 1 });
    expect(r.isExempt).toBe(false);
    expect(r.taxableGain).toBe(200_000_000);
    expect(r.totalTax).toBe(130_350_000);
    expect(hasNotice(r)).toBe(false);
  }, 60_000);

  it("토지를 고시일 이후에 취득 → 괄호 밖이라 보유요건 그대로(과세), 고지 없음", async () => {
    const r = await run(form(house({ landAcquisitionDate: "2025-08-01" })), proviso("2025-06-01"));
    expect(r.isExempt).toBe(false);
    expect(r.taxableGain).toBe(200_000_000);
    expect(r.totalTax).toBe(152_075_000);
    expect(hasNotice(r)).toBe(false);
  }, 60_000);

  it("경계: 토지를 고시일 당일 취득 → 「고시일 전」이 아니다(과세)", async () => {
    const r = await run(form(house({ landAcquisitionDate: "2025-06-01" })), proviso("2025-06-01"));
    expect(r.isExempt).toBe(false);
    expect(r.taxableGain).toBe(200_000_000);
    expect(hasNotice(r)).toBe(false);
  }, 60_000);

  it("대조: 토지 보유 2년 이상 → 단서와 무관하게 비과세, 5A 고지 없음", async () => {
    const r = await run(form(house({ landAcquisitionDate: "2023-01-10" })), proviso("2025-06-01"));
    expect(r.isExempt).toBe(true);
    expect(hasNotice(r)).toBe(false);
  }, 60_000);

  it("수용일 5년 초과 → 단서 불성립이라 토지분 과세(5A 예외도 열리지 않는다)", async () => {
    const r = await run(form(house()), proviso("2025-06-01", "2020-06-01"));
    expect(r.isExempt).toBe(false);
    expect(r.taxableGain).toBe(200_000_000);
    expect(hasNotice(r)).toBe(false);
  }, 60_000);

  it("대조: 단서 정보가 있어도 2주택이면 비과세 자체가 없다 → 5A 고지 없음", async () => {
    const r = await run(form(house()), { ...proviso("2025-06-01"), isOneHousehold: false, householdHousingCount: 2 });
    expect(r.isExempt).toBe(false);
    expect(r.isPartialExempt ?? false).toBe(false);
    expect(hasNotice(r)).toBe(false);
  }, 60_000);

  it("연혁: 2006.2.9. 전 양도는 괄호(「사업인정 고시일 전 취득」)가 없다 → 고시일 이후 취득 토지도 단서가 덮는다(고가주택 안분)", async () => {
    const r = await run(
      form(house({ acquisitionDate: "2000-03-02", landAcquisitionDate: "2005-03-01" }), "2005-12-01"),
      proviso("2005-01-01", "2005-12-01"),
    );
    // 양도가액 8억 > 당시 고가주택 기준 6억 → 부분 비과세. 토지분이 G-3(전액 과세 200,000,000)이 아니라 안분(× 2억/8억)된다.
    expect(r.isPartialExempt).toBe(true);
    expect(r.splitDetail.land.taxableGainAfterProration).toBe(50_000_000);
    expect(hasNotice(r)).toBe(true);
  }, 60_000);
});
