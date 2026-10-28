/**
 * anchor — 이월과세 A 일반건물 카드: 명세서 취득가액 산식은 **증여자 자본적지출을 「포함」이라 적지 않는다** (값은 필요경비 칸 — 단건 `carryover-a-donor-capex-display.anchor.test.ts` 와 같은 분류).
 *
 * 종전 산식: 「증여자 취득 당시 취득가액 50,000,000 (증여자 자본적지출 20,000,000 포함 §97의2①2호)」인데 값(취득가액 칸)은 50,000,000 이었다.
 * 픽스처: 환산 경로 · 증여자 실가 50,000,000 · 증여자 자본적지출 20,000,000 · 본인 지출 0 → 토지 필요경비 70,000,000(= 증여세 50,000,000 + 증여자 자본적지출 20,000,000).
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
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { buildGbAcquisitionFormula } from "@/components/calc/results/transfer/DetailedStatementGbFormulas";
import { capExInAcquisitionColumnOfProperty } from "@/components/calc/results/transfer/exempt-gross-gain";

const BUILDING_ACQ_STD = 16_997_190;
const ct = (o: object = {}) => ({
  giftRegistryDate: "2020-03-17", donorAcquisitionDate: "1995-06-15", donorAcquisitionPrice: 50_000_000, useEstimatedAcquisition: false,
  giftTaxAmount: 50_000_000, giftDateValuation: 200_000_000, ...o,
});

/** 환산 경로(2-way) 일반건물 payload. */
const estimatedGbv = (o: object = {}) => ({
  landArea: 57, buildingArea: 100, buildingFootprintArea: 50, transferLandPricePerSqm: 5_956_000, transferBuildingStdPrice: 12_308_310,
  zoneType: "general_residential", acquisitionLandPricePerSqm: 1_400_000, acquisitionBuildingStdPrice: BUILDING_ACQ_STD,
  buildingAcquisitionCause: "purchase", buildingAcquisitionDate: "2020-03-17",
  landAcquisitionCause: "carryover_gift", landCarryoverTaxation: ct(), ...o,
});
const COMMON = {
  propertyType: "general_building", transferDate: "2024-10-11", transferPrice: 330_000_000, acquisitionDate: "2020-03-17", acquisitionPrice: 0, expenses: 0,
  useEstimatedAcquisition: true, householdHousingCount: 2, isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false,
  isNonBusinessLand: false, isOneHousehold: false, reductions: [] as unknown[], annualBasicDeductionUsed: 0, residencePeriodMonths: 0,
};


describe("GB 카드 — 증여자 자본적지출 20,000,000", () => {
  beforeEach(() => { vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates()); });
  it("값: 취득가액 칸 50,000,000 · 필요경비 칸 70,000,000 / 산식은 「포함」 없이 증여자 취득가액만 적는다", async () => {
    const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...COMMON, generalBuildingValuation: estimatedGbv({ landCarryoverTaxation: ct({ donorCapitalExpenditure: 20_000_000 }) }) }),
    }));
    const json = await res.json();
    expect(res.status, JSON.stringify(json.error)).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = json.data.aggregated.properties.find((x: any) => x.propertyId === "land");
    const shift = capExInAcquisitionColumnOfProperty(p);
    expect(p.carryoverTaxationDetail.scenarioA.donorCapexAddedToExpense).toBe(20_000_000);
    expect(p.acquisitionPrice + shift).toBe(50_000_000);
    expect(p.necessaryExpense - shift).toBe(70_000_000);
    const text = buildGbAcquisitionFormula(p, undefined, undefined, undefined) ?? "";
    expect(text).toContain("증여자 취득 당시 취득가액 50,000,000");
    expect(text).not.toContain("증여자 자본적지출");
    expect(text).not.toContain("포함");
  });
});
