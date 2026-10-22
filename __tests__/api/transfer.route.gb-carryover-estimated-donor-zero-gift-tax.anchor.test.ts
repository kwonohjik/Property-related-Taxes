/**
 * anchor — 일반건물 × 이월과세 × **환산 donor** × 증여세 상당액 0 (PR-0b)
 *
 * 계획서: docs/00-pm/gb-card-built-penalty-114-2.plan.md §14 (Q-15)
 *
 * ## 결함
 * 일반건물 카드는 `useEstimatedAcquisition:false`(aggregate 경로)라, 단건 엔진 `calcCarryoverScenarios`가
 * 환산 donor 시나리오 A 를 만들 때 환산을 `rawInput.useEstimatedAcquisition`에 맡기는 증여세 0 분기에서
 * 취득가액 0 · 필요경비 0 으로 계산했다(echo 의 scenarioA.acquisitionPrice 는 250,000,000 인데 양도차익은 500,000,000).
 * 증여세 1원 이상이면 «실가 전환» 분기를 타서 취득가액은 맞지만 **개산공제가 소실**됐다(양도차익 249,999,999).
 * 일반건물 2-way · 실가 · 증축 3경로 모두 같다.
 *
 * ## 기대값 손계산 (환산 donor: 양도가 − donor 환산취득가액 − 개산공제 − 증여세 상당액)
 * 공통: 총 양도가 1,000,000,000 · 토지 100㎡×2,000,000(양도시 200,000,000) · 건물 양도시 기준시가 200,000,000 · donor 건물 취득시 기준시가 100,000,000
 *  · 2-way·실가: 건물 양도가 = 1e9×200/400 = 500,000,000 → donor 환산 = 500,000,000×100,000,000/200,000,000 = 250,000,000
 *      개산공제(§163⑥, donor 취득시 기준시가×3%) = 3,000,000 → 양도차익 = 500,000,000 − 250,000,000 − 3,000,000 = 247,000,000
 *  · 증축(건물2 기준시가 5천만, 합 4.5억): 건물1 양도가 = floor(1e9×200/450) = 444,444,444 → donor 환산 222,222,222
 *      개산공제 3,000,000 → 양도차익 = 444,444,444 − 222,222,222 − 3,000,000 = 219,222,222
 *  · 증여세 g(원)가 있으면 필요경비에 g 가산 → 양도차익 − g (한도: 증여 가산 전 양도차익)
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

const GB = {
  landArea: 100, buildingArea: 200, buildingFootprintArea: 50,
  transferLandPricePerSqm: 2_000_000, transferBuildingStdPrice: 200_000_000,
  zoneType: "general_residential" as const,
  acquisitionLandPricePerSqm: 1_000_000, acquisitionBuildingStdPrice: 100_000_000,
  buildingAcquisitionCause: "carryover_gift" as const, buildingAcquisitionDate: "2024-05-01",
};
const COMMON = {
  propertyType: "general_building" as const,
  transferDate: "2026-03-01", transferPrice: 1_000_000_000, acquisitionDate: "2024-05-01", acquisitionPrice: 0, expenses: 0,
  useEstimatedAcquisition: true, householdHousingCount: 2, isRegulatedArea: false, wasRegulatedAtAcquisition: false,
  isUnregistered: false, isNonBusinessLand: false, isOneHousehold: false, reductions: [] as unknown[],
  annualBasicDeductionUsed: 0, residencePeriodMonths: 0,
};
const ct = (gift: number) => ({
  giftRegistryDate: "2024-05-01", donorAcquisitionDate: "2015-01-01", donorAcquisitionPrice: 0,
  useEstimatedAcquisition: true, giftTaxAmount: gift, giftDateValuation: 800_000_000, donorStandardPriceAtAcquisition: 100_000_000,
});
const EXT = {
  extensionDate: "2022-06-01", extensionArea: 100, extensionFloorArea85: 100,
  transferExtensionBuildingStdPrice: 50_000_000, acquisitionExtensionBuildingStdPrice: 20_000_000,
  extensionAcquisitionCause: "newConstruction" as const, acquisitionMode: "estimated" as const,
};

type Prop = { propertyId: string; transferGain: number; carryoverTaxationDetail?: { adoptedScenario: string; scenarioA: { acquisitionPrice: number; transferGain: number } } };
async function call(gb: object, gift: number) {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...COMMON, generalBuildingValuation: { ...GB, ...gb, buildingCarryoverTaxation: ct(gift) } }),
  }));
  const json = await res.json();
  expect(res.status, JSON.stringify(json.error)).toBe(200);
  const props = json.data.aggregated.properties as Prop[];
  return { props, determined: json.data.aggregated.determinedTax as number };
}
const bld = (props: Prop[], id: string) => props.find((p) => p.propertyId === id)!;

beforeEach(() => { vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never); });

const PATHS: Array<[string, object, string, number]> = [
  ["2-way(환산 경로)", {}, "building", 247_000_000],
  ["실가 경로", { actualPriceMode: true, landAcquisitionDate: "2015-01-01" }, "building", 247_000_000],
  ["증축(3-way)", { extensionInfo: EXT }, "building1", 219_222_222],
];

describe("PR-0b 환산 donor × 증여세 0 — 건물 양도차익 = 양도가 − donor 환산취득가액 − 개산공제", () => {
  for (const [name, gb, id, gain] of PATHS) {
    it(`${name}: 증여세 0 → 양도차익 ${gain.toLocaleString()} (echo 취득가액과 계산이 일치)`, async () => {
      const r = await call(gb, 0);
      const b = bld(r.props, id);
      expect(b.carryoverTaxationDetail?.adoptedScenario).toBe("A");
      expect(b.carryoverTaxationDetail?.scenarioA.transferGain).toBe(gain);
      expect(b.transferGain).toBe(gain);
    });

    it(`${name}: 증여세 1원 → 증여세 0 셀과 1원 차이(연속성 — 개산공제 소실 금지)`, async () => {
      const r0 = await call(gb, 0);
      const r1 = await call(gb, 1);
      expect(bld(r0.props, id).transferGain - bld(r1.props, id).transferGain).toBe(1);
    });

    it(`${name}: 증여세 1,000,000 → 양도차익 = ${gain.toLocaleString()} − 1,000,000`, async () => {
      const r = await call(gb, 1_000_000);
      expect(bld(r.props, id).transferGain).toBe(gain - 1_000_000);
    });
  }
});
