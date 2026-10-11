/**
 * C8 — 상속·증여 겸용, 취득시 개별주택가격 없음 + 공통 자본적지출 → 주택분·상가분 신고가액 비율 (2026-10-11).
 *
 * 종전(master f8cc5f170): 주택 분자 `acquisitionStandardPrice.housingPrice ?? 0` = 0 → 자본적지출 1억 **전액 상가분**
 * (1세대1주택 고가주택 축 결정세액 337,045,345 — H_A 입력 시 355,665,345보다 18,620,000 과소).
 * 지금: 주택 신고가액 4.5억 : 상가 신고가액 1억 → 81,818,181 / 18,181,819 + 「확인 필요」 고지.
 * 개별주택가격을 입력했으면 종전 기준시가 비율(66,666,666 / 33,333,334) 그대로.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRatesWithHouseEngine } from "../tax-engine/_helpers/mock-rates";
import { inheritedCapexUsesReportedRatio } from "@/lib/tax-engine/transfer-tax-mixed-use-inheritance";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";

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
beforeEach(() => { vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRatesWithHouseEngine()); });

function body(mu: Record<string, unknown>) {
  return {
    transferPrice: 3_000_000_000, acquisitionPrice: 900_000_000, acquisitionDate: "2010-03-15", transferDate: "2024-08-20",
    expenses: 0, useEstimatedAcquisition: true, householdHousingCount: 1, isRegulatedArea: false,
    wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, isOneHousehold: false,
    reductions: [], annualBasicDeductionUsed: 0, residencePeriodMonths: 0, propertyType: "mixed-use-house",
    mixedUse: {
      isMixedUseHouse: true, residentialFloorArea: 100, nonResidentialFloorArea: 100, buildingFootprintArea: 100,
      totalLandArea: 200, landAcquisitionDate: "2010-03-15", buildingAcquisitionDate: "2010-03-15",
      transferStandardPrice: { housingPrice: 1_600_000_000, commercialBuildingPrice: 100_000_000, landPricePerSqm: 12_000_000, housingBuildingPrice: 800_000_000 },
      residencePeriodYears: 0, isOneHouseExempt: false, isMetropolitanArea: true, zoneType: "general_residential",
      acquisitionByInheritance: true, housingInheritedValue: 450_000_000, commercialInheritedValue: 100_000_000,
      capitalExpenditure: 100_000_000,
      ...mu,
    },
  };
}
const ACQ_NO_H = { commercialBuildingPrice: 80_000_000, landPricePerSqm: 1_200_000, housingBuildingPrice: 380_000_000 };
const ACQ_H = { ...ACQ_NO_H, housingPrice: 400_000_000 };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function run(mu: Record<string, unknown>): Promise<any> {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body(mu)),
  }));
  expect(res.status).toBe(200);
  return (await res.json()).data.result;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ded = (p: any) => p.landAppraisalDed + p.buildingAppraisalDed;
const NOTICE = /공통 자본적지출을 주택분·상가분 (상속|증여) 신고가액 비율로 나누었습니다/;

describe("C8 상속·증여 겸용 공통 자본적지출 안분", () => {
  it("상속 · H_A 없음 → 신고가액 4.5억 : 1억 = 81,818,181 / 18,181,819 · 합 = 자본적지출 · 고지", async () => {
    const r = await run({ acquisitionStandardPrice: ACQ_NO_H });
    expect(ded(r.housingPart)).toBe(81_818_181);
    expect(ded(r.commercialPart)).toBe(18_181_819);
    expect(r.warnings.some((w: string) => NOTICE.test(w) && w.includes("상속"))).toBe(true);
  }, 60_000);

  it("증여 · H_A 없음 → 같은 비율 · 고지 문구 「증여」", async () => {
    const r = await run({ acquisitionStandardPrice: ACQ_NO_H, acquisitionByInheritance: false, acquisitionByGift: true });
    expect(ded(r.housingPart)).toBe(81_818_181);
    expect(ded(r.commercialPart)).toBe(18_181_819);
    expect(r.warnings.some((w: string) => NOTICE.test(w) && w.includes("증여"))).toBe(true);
  }, 60_000);

  it("상가 신고가액 없음 → 상가분은 보충적 평가 합계(1,200,000 × 100㎡ + 80,000,000 = 200,000,000) — 4.5억 : 2억", async () => {
    const r = await run({ acquisitionStandardPrice: ACQ_NO_H, commercialInheritedValue: undefined });
    expect(ded(r.housingPart)).toBe(69_230_769);
    expect(ded(r.commercialPart)).toBe(30_769_231);
  }, 60_000);

  it("부정형 짝 — H_A 입력 시 종전 기준시가 비율(66,666,666 / 33,333,334) · 고지 없음", async () => {
    const r = await run({ acquisitionStandardPrice: ACQ_H });
    expect(ded(r.housingPart)).toBe(66_666_666);
    expect(ded(r.commercialPart)).toBe(33_333_334);
    expect(r.warnings.some((w: string) => NOTICE.test(w))).toBe(false);
  }, 60_000);

  it("부정형 짝 — 자본적지출 0이면 고지 없음", async () => {
    const r = await run({ acquisitionStandardPrice: ACQ_NO_H, capitalExpenditure: 0 });
    expect(r.warnings.some((w: string) => NOTICE.test(w))).toBe(false);
  }, 60_000);

  it("1세대1주택 고가주택 축 — 337,045,345 → 359,897,163 (주택 몫이 H_A 입력 때보다 커 결정세액도 그보다 크다)", async () => {
    const one = { capitalExpenditure: 100_000_000, isOneHouseExempt: true, residencePeriodYears: 14 };
    const noH = await run({ acquisitionStandardPrice: ACQ_NO_H, ...one });
    const withH = await run({ acquisitionStandardPrice: ACQ_H, ...one });
    expect(withH.total.transferTax).toBe(355_665_345); // 종전 값 그대로(H_A 경로 불변)
    expect(noH.total.transferTax).toBe(359_897_163); // 종전 337,045,345(전액 상가) → 주택 몫 81,818,181(대부분 비과세)
    expect(noH.total.transferTax).toBeGreaterThan(withH.total.transferTax);
  }, 60_000);
});

describe("C8 술어 `inheritedCapexUsesReportedRatio`", () => {
  const base = {
    acquisitionByInheritance: true, housingInheritedValue: 450_000_000,
    acquisitionStandardPrice: { commercialBuildingPrice: 1, landPricePerSqm: 1 },
  } as unknown as MixedUseAssetInput;
  it("상속·증여 + H_A 없음 + 주택 신고가액 → true", () => {
    expect(inheritedCapexUsesReportedRatio(base)).toBe(true);
    expect(inheritedCapexUsesReportedRatio({ ...base, acquisitionByInheritance: false, acquisitionByGift: true })).toBe(true);
  });
  it("매매실가·H_A 입력·PHD·주택 신고가액 없음 → false", () => {
    expect(inheritedCapexUsesReportedRatio({ ...base, acquisitionByInheritance: false, useActualAcquisition: true })).toBe(false);
    expect(inheritedCapexUsesReportedRatio({ ...base, acquisitionStandardPrice: { ...base.acquisitionStandardPrice, housingPrice: 1 } })).toBe(false);
    expect(inheritedCapexUsesReportedRatio({ ...base, usePreHousingDisclosure: true })).toBe(false);
    expect(inheritedCapexUsesReportedRatio({ ...base, housingInheritedValue: undefined })).toBe(false);
  });
});
