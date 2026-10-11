/**
 * anchor(route ⑫⑭) — 주택 부수토지 축 (재검증 S02-5 · S08-8 · G5-6, PR5b).
 * 엔진 anchor(`one-house-appurtenant-land-pr5b.anchor.test.ts`)가 못 보는 Zod(⑫)·Route 매핑(⑭) 통과를 고정한다.
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

beforeEach(() => vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates()));

const BASE = {
  propertyType: "housing",
  useEstimatedAcquisition: false,
  transferPrice: 600_000_000,
  transferDate: "2010-06-15",
  acquisitionDate: "2004-01-01",
  landAcquisitionDate: "2007-12-15",
  acquisitionPrice: 0,
  expenses: 0,
  isOneHousehold: true,
  householdHousingCount: 1,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  residencePeriodMonths: 60,
  annualBasicDeductionUsed: 0,
  isSeparateAcquisition: true,
  landAcqMode: "actual",
  buildingAcqMode: "actual",
  saleSplitMode: "actual",
  landTransferPrice: 350_000_000,
  buildingTransferPrice: 250_000_000,
  landStandardPriceAtTransfer: 350_000_000,
  buildingStandardPriceAtTransfer: 250_000_000,
  landAcquisitionPrice: 100_000_000,
  buildingAcquisitionPrice: 100_000_000,
};

async function post(over: Record<string, unknown>) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...BASE, ...over }),
    }),
  );
  const body = await res.json();
  expect(res.status, JSON.stringify(body).slice(0, 300)).toBe(200);
  return body.data.result as {
    isExempt: boolean;
    taxableGain: number;
    totalTax: number;
    steps: { label: string }[];
    warnings?: string[];
  };
}

describe("S02-5 route — 2010 양도 · 토지 2년 6개월", () => {
  it("토지분(250,000,000) 과세", async () => {
    const r = await post({});
    expect(r.isExempt).toBe(false);
    expect(r.taxableGain).toBe(250_000_000);
  });
  it("대조 · 2013 양도 · 토지 2년 6개월 → 비과세", async () => {
    const r = await post({ transferDate: "2013-06-15", landAcquisitionDate: "2010-12-15" });
    expect(r.isExempt).toBe(true);
  });
});

describe("S08-8 route — 1/2 지분 · 물건 전체 10억 · 토지 2025-06-01 취득", () => {
  const SHARE = {
    transferDate: "2026-07-01",
    acquisitionDate: "2010-06-01",
    landAcquisitionDate: "2025-06-01",
    transferPrice: 500_000_000,
    totalPropertyTransferPrice: 1_000_000_000,
    ownershipRatio: 0.5,
    landTransferPrice: 350_000_000,
    buildingTransferPrice: 150_000_000,
    landStandardPriceAtTransfer: 400_000_000,
    buildingStandardPriceAtTransfer: 150_000_000,
    landAcquisitionPrice: 150_000_000,
    buildingAcquisitionPrice: 100_000_000,
    residencePeriodMonths: 120,
  };
  it("부수토지 비과세 제외 — 토지분 지분 몫(200,000,000) 과세", async () => {
    const r = await post(SHARE);
    expect(r.isExempt).toBe(false);
    expect(r.steps.map((s) => s.label)).toContain("부수토지 비과세 제외");
    expect(r.taxableGain).toBe(200_000_000);
  });
  it("대조 · 지분이어도 토지 2년 이상이면 비과세", async () => {
    const r = await post({ ...SHARE, landAcquisitionDate: "2023-06-01" });
    expect(r.isExempt).toBe(true);
  });
});

describe("G5-6 route — 수용 양도의 용도지역 기준일 고지", () => {
  const EXPRO = {
    transferDate: "2026-01-15",
    acquisitionDate: "2014-09-01",
    landAcquisitionDate: "2008-07-01",
    transferPrice: 2_000_000_000,
    landTransferPrice: 1_600_000_000,
    buildingTransferPrice: 400_000_000,
    landStandardPriceAtTransfer: 1_600_000_000,
    buildingStandardPriceAtTransfer: 400_000_000,
    landAcquisitionPrice: 200_000_000,
    buildingAcquisitionPrice: 100_000_000,
    buildingFootprintArea: 100,
    acquisitionArea: 900,
    appurtenantLandZone: "metropolitan_residential",
  };
  const has = (r: { warnings?: string[] }) => (r.warnings ?? []).some((w) => w.includes("사업인정 고시일 전날"));
  it("수용 → 고지", async () => {
    expect(has(await post({ ...EXPRO, transferCause: "public_expropriation" }))).toBe(true);
  });
  it("대조 · 일반 양도 → 고지 없음", async () => {
    expect(has(await post({ ...EXPRO, transferCause: "general" }))).toBe(false);
  });
});
