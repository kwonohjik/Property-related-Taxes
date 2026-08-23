/**
 * anchor — **GB 파트별 취득가액 산식이 이월과세에서 거짓 등식을 인쇄한다** N-4.
 *
 * 계획서: `docs/00-pm/transfer-f16-spinoff-items.plan.md` §N-4
 *
 * ## 결함 (수정 전 실측)
 *
 * `buildGbAcquisitionFormula`는 환산 분기에서
 * `buildAllocationFormula(p.transferPrice, acqStd, [std], p.acquisitionPrice)`로
 * `A × B / C = D`를 인쇄하는데, **좌변과 우변이 독립 인자**다(`:102-113`).
 * A-9(`ceafe4b1`) 이후 `p.acquisitionPrice`는 **채택된 시나리오의 취득가액**이라,
 * 이월과세 자산에서는 좌변이 우변을 유도하지 않는다.
 *
 * 실측: `500,000,000 × 100,000,000 / 200,000,000 = 150,000,000`
 *       — 좌변 실계산 **250,000,000**, 차이 **100,000,000**.
 *       환산·실가 **두 모드 모두** 어긋났다(이월과세면 항상).
 *
 * ## 왜 GB에만 있었나
 *
 * 단건 경로(`buildAcquisitionPriceFormula`)는 `carryoverTaxationDetail.adoptedScenario === "A"`
 * 분기를 **이미 갖고 있었다**. GB 파트별 경로에만 없어서 같은 사실을 두 화면이 다르게 그렸다.
 *
 * ⚠️ 세액에는 영향이 없다 — **표시 전용**이다. 다만 신고서 성격상 검산 가능한 등식이
 *    거짓인 것은 무겁다.
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
import { buildGbAcquisitionFormula } from "@/components/calc/results/transfer/DetailedStatementFormulaBuilders";

const TRANSFER_DATE = "2024-06-01";
const GIFT_DATE = "2021-03-01";
const DONOR_ACQ = "2005-06-15";
const TOTAL = 1_000_000_000;

/** 토지 100㎡ × 2,000,000 = 200,000,000 · 건물 200,000,000 ⇒ §166⑥ 안분 50:50. */
const GB = {
  landArea: 100,
  buildingArea: 200,
  buildingFootprintArea: 50,
  transferLandPricePerSqm: 2_000_000,
  transferBuildingStdPrice: 200_000_000,
  zoneType: "general_residential" as const,
  acquisitionLandPricePerSqm: 1_000_000,
  acquisitionBuildingStdPrice: 100_000_000,
  buildingAcquisitionCause: "purchase" as const,
};

const COMMON = {
  propertyType: "general_building" as const,
  transferDate: TRANSFER_DATE,
  acquisitionDate: GIFT_DATE,
  acquisitionPrice: 0,
  expenses: 0,
  useEstimatedAcquisition: true,
  householdHousingCount: 2,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: false,
  reductions: [] as unknown[],
  annualBasicDeductionUsed: 0,
  residencePeriodMonths: 0,
};

const carryoverActual = {
  giftRegistryDate: GIFT_DATE,
  donorAcquisitionDate: DONOR_ACQ,
  donorAcquisitionPrice: 150_000_000,
  useEstimatedAcquisition: false,
  giftTaxAmount: 30_000_000,
  giftDateValuation: 400_000_000,
};

const carryoverEstimated = {
  giftRegistryDate: GIFT_DATE,
  donorAcquisitionDate: DONOR_ACQ,
  useEstimatedAcquisition: true,
  giftTaxAmount: 30_000_000,
  giftDateValuation: 400_000_000,
  donorStandardPriceAtAcquisition: 60_000_000,
};

type Prop = { propertyId: string; acquisitionPrice: number; transferPrice: number };

async function run(gbOver: object) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...COMMON,
        transferPrice: TOTAL,
        generalBuildingValuation: { ...GB, ...gbOver },
      }),
    }),
  );
  expect(res.status).toBe(200);
  const json = (await res.json()) as {
    data?: {
      aggregated?: { properties: Prop[]; generalBuildingValuationDetail?: unknown };
    };
  };
  const agg = json.data?.aggregated;
  expect(agg).toBeDefined();
  return {
    land: agg!.properties.find((p) => p.propertyId === "land")!,
    building: agg!.properties.find((p) => p.propertyId === "building")!,
    gb: (agg as unknown as Record<string, unknown>).generalBuildingValuationDetail,
  };
}

const formulaOf = (p: Prop, gb: unknown) =>
  buildGbAcquisitionFormula(p as never, gb as never, undefined, undefined);

/** "A × B / C = D" 이면 좌변을 재계산해 우변과 대조. 그 모양이 아니면 null. */
function allocationMismatch(f: string | undefined): number | null {
  if (!f) return null;
  const m = /^([\d,]+) × ([\d,]+) \/ ([\d,]+) = ([\d,]+)$/.exec(f.trim());
  if (!m) return null;
  const n = (s: string) => Number(s.replace(/,/g, ""));
  return Math.floor((n(m[1]) * n(m[2])) / n(m[3])) - n(m[4]);
}

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

describe("N4 — GB 이월과세 취득가액 산식", () => {
  it("N4-01: 대조군(이월과세 없음) — 환산 산식의 좌변이 우변을 정확히 유도한다", async () => {
    const { land, building, gb } = await run({});
    expect(land.acquisitionPrice).toBe(250_000_000);
    expect(allocationMismatch(formulaOf(land, gb))).toBe(0);
    expect(allocationMismatch(formulaOf(building, gb))).toBe(0);
  });

  it("N4-02: 🔴 이월과세(실가) 파트는 환산 산식을 그리지 않는다", async () => {
    const { land, gb } = await run({
      landAcquisitionCause: "carryover_gift",
      landCarryoverTaxation: carryoverActual,
    });
    expect(land.acquisitionPrice).toBe(150_000_000);
    const f = formulaOf(land, gb);
    // 수정 전에는 `500,000,000 × 100,000,000 / 200,000,000 = 150,000,000`(좌변 250,000,000).
    expect(allocationMismatch(f)).toBeNull();
    expect(f).toContain("증여자 취득 당시 취득가액");
    expect(f).toContain("이월과세 §97의2①");
    expect(f).toContain("150,000,000");
  });

  it("N4-03: 🔴 이월과세(환산) 파트도 같다", async () => {
    const { land, gb } = await run({
      landAcquisitionCause: "carryover_gift",
      landCarryoverTaxation: carryoverEstimated,
    });
    const f = formulaOf(land, gb);
    expect(allocationMismatch(f)).toBeNull();
    expect(f).toContain("증여자 취득 당시 환산취득가");
    expect(f).toContain("이월과세 §97의2①");
  });

  it("N4-04: 같은 요청의 **비**이월과세 파트(건물)는 종전 환산 산식을 그대로 쓴다", async () => {
    const { building, gb } = await run({
      landAcquisitionCause: "carryover_gift",
      landCarryoverTaxation: carryoverActual,
    });
    const f = formulaOf(building, gb);
    // 건물은 매매 취득이므로 환산 산식이 정답이고, 좌변이 우변을 유도해야 한다.
    expect(allocationMismatch(f)).toBe(0);
    expect(f).not.toContain("이월과세");
  });
});
