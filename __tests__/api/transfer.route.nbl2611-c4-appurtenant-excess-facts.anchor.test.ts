/**
 * anchor(route ⑫⑭) — 배율 초과분 수용 의제·유예 사실 `appurtenantExcessFacts` (NBL2611-C4 · R16).
 *
 * ⑫ Zod가 새 키를 모르면 값이 **조용히 떼어져**(strip) 엔진에 닿지 않는다(200 + 의제 미적용) — 이 파일은 «보냈더니 세액이 움직인다»를 입구별로 고정한다.
 * 엔진 anchor(`nbl2611-c4-appurtenant-excess-deeming.anchor.test.ts`)가 못 보는 ⑫ 통과 · ⑭ Date 변환 · 입구 배선(GB 3경로·CB)을 본다.
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
import { NBL_EXPROPRIATION_NOTICE_DATE_MISSING_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";

beforeEach(() => vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates()));

async function post(body: Record<string, unknown>, expectStatus = 200) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  );
  const json = await res.json();
  expect(res.status, JSON.stringify(json).slice(0, 300)).toBe(expectStatus);
  return json;
}

const FACTS = { expropriationNoticeDate: "2021-03-01" };

// ── 주택 (G-2 별개취득) ─────────────────────────────────────────────
const HOUSE = {
  propertyType: "housing", useEstimatedAcquisition: false, transferPrice: 1_000_000_000, transferDate: "2024-09-01", acquisitionDate: "2015-01-01",
  landAcquisitionDate: "2014-01-01", acquisitionPrice: 0, expenses: 0, isOneHousehold: false, householdHousingCount: 2, isRegulatedArea: false,
  wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, residencePeriodMonths: 0, annualBasicDeductionUsed: 0,
  isSeparateAcquisition: true, landAcqMode: "actual", buildingAcqMode: "actual", saleSplitMode: "actual",
  landTransferPrice: 700_000_000, buildingTransferPrice: 300_000_000, landStandardPriceAtTransfer: 700_000_000, buildingStandardPriceAtTransfer: 300_000_000,
  landAcquisitionPrice: 200_000_000, buildingAcquisitionPrice: 250_000_000,
  appurtenantLandZone: "metropolitan_residential", buildingFootprintArea: 100, acquisitionArea: 1000,
};
const calcTax = async (b: Record<string, unknown>) => (await post(b)).data.result as { calculatedTax: number; warnings?: string[] };

describe("C4 route ⑫⑭ — 주택 배율 초과분", () => {
  it("수용 + 고시일(⑫ 통과 · ⑭ Date 변환) → 의제 성립 149,460,000 (수정 전 154,500,000 — 보내지 않으면 그대로)", async () => {
    expect((await calcTax({ ...HOUSE, transferCause: "public_expropriation" })).calculatedTax).toBe(154_500_000);
    expect((await calcTax({ ...HOUSE, transferCause: "public_expropriation", appurtenantExcessFacts: FACTS })).calculatedTax).toBe(149_460_000);
  });
  it("고시일 미입력 → 200 + 확인 필요 고지(차단하지 않는다)", async () => {
    const r = await calcTax({ ...HOUSE, transferCause: "public_expropriation" });
    expect(r.warnings).toContain(NBL_EXPROPRIATION_NOTICE_DATE_MISSING_NOTICE);
  });
  it("유예 구간(⑫ 스키마) → 의제 성립", async () => {
    const r = await calcTax({ ...HOUSE, appurtenantExcessFacts: { graceIntervals: [{ startDate: "2014-01-01", endDate: "2023-12-31" }] } });
    expect(r.calculatedTax).toBe(149_460_000);
  });
  it("유예 구간 시작일이 종료일보다 늦으면 ⑫가 400으로 막는다", async () => {
    await post({ ...HOUSE, appurtenantExcessFacts: { graceIntervals: [{ startDate: "2024-01-01", endDate: "2023-12-31" }] } }, 400);
  });
  it("고시일 형식 오류도 400", async () => {
    await post({ ...HOUSE, transferCause: "public_expropriation", appurtenantExcessFacts: { expropriationNoticeDate: "2021/03/01" } }, 400);
  });
});

// ── 일반건물 3경로 ──────────────────────────────────────────────────
const GB_COMMON = {
  propertyType: "general_building", transferDate: "2024-10-11", transferPrice: 1_000_000_000, acquisitionDate: "2003-03-17", acquisitionPrice: 0, expenses: 0,
  useEstimatedAcquisition: true, householdHousingCount: 0, isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false,
  isNonBusinessLand: false, isOneHousehold: false, reductions: [] as unknown[], annualBasicDeductionUsed: 0, residencePeriodMonths: 0,
};
const gbBase = (o: object) => ({
  transferLandPricePerSqm: 3_000_000, transferBuildingStdPrice: 100_000_000, landArea: 200, buildingArea: 100, buildingFootprintArea: 20,
  zoneType: "commercial", isMetropolitan: false, acquisitionLandPricePerSqm: 1_000_000, acquisitionBuildingStdPrice: 50_000_000,
  buildingAcquisitionCause: "purchase", buildingAcquisitionDate: "2003-03-17", landAcquisitionDate: "2003-03-17", landAcquisitionCause: "purchase",
  unapprovedBuilding: false, unregisteredLand: false, unregisteredBuilding: false, ...o,
});
const gbExt = { extensionInfo: { extensionDate: "2018-06-01", extensionAcquisitionCause: "purchase", acquisitionMode: "estimated", transferExtensionBuildingStdPrice: 20_000_000, acquisitionExtensionBuildingStdPrice: 10_000_000 } };
const gbActual = { actualPriceMode: true, landAcqMode: "actual", buildingAcqMode: "actual", landAcquisitionPrice: 300_000_000, buildingAcquisitionPrice: 100_000_000, isSelfBuilt: false };
const actualTop = { acquisitionPrice: 400_000_000, useEstimatedAcquisition: false, totalPropertyTransferPrice: 1_000_000_000 };

async function gbTax(gbv: object, top: object = {}) {
  const j = await post({ ...GB_COMMON, ...top, generalBuildingValuation: gbv });
  return { tax: j.data.aggregated.determinedTax as number, warnings: j.data.aggregated.warnings as string[] };
}

describe("C4 route ⑫⑭ — 일반건물 3경로 (초과 140㎡ · 한도 이내 대조 세액과 같아진다)", () => {
  // [경로, gbv 조립, top, 수정 전 = C1 anchor의 «split» 실측, 수정 후 = 한도 이내 «within» 실측]
  const cases: [string, (w: object) => object, object, number, number][] = [
    ["환산", (w) => gbBase(w), {}, 155_631_000, 150_960_000],
    ["증축", (w) => gbBase({ ...w, ...gbExt }), {}, 265_025_235, 253_865_787],
    ["실거래가", (w) => gbBase({ ...w, ...gbActual }), actualTop, 145_910_000, 141_060_000],
  ];
  for (const [name, gbv, top, before, after] of cases) {
    it(`${name}: 수용 + 고시일 → ${after.toLocaleString()} (보내지 않으면 ${before.toLocaleString()})`, async () => {
      // 환산 경로의 수용은 §164⑨1호 보상 후보 2칸이 필수다(⑫) — 양도시 기준시가(3,000,000)보다 큰 값을 줘 min[]이 움직이지 않게 한다.
      const expro = { transferCause: "public_expropriation", compensationPerSqm: 9_000_000, compensationBasisStdPrice: 9_000_000, ...top };
      expect((await gbTax(gbv({}), expro)).tax).toBe(before);
      expect((await gbTax(gbv({}), { ...expro, appurtenantExcessFacts: FACTS })).tax).toBe(after);
      expect((await gbTax(gbv({ buildingFootprintArea: 100 }), top)).tax).toBe(after); // 독립 대조 — 한도 이내
    });
  }
});

// ── 상업용건물 ──────────────────────────────────────────────────────
describe("C4 route ⑫⑭ — 상업용건물 부수토지 초과분", () => {
  const CB = {
    propertyType: "commercial_building", useEstimatedAcquisition: false, transferPrice: 1_200_000_000, acquisitionPrice: 600_000_000, transferDate: "2024-06-01",
    acquisitionDate: "2014-06-01", expenses: 0, isOneHousehold: false, householdHousingCount: 0, isRegulatedArea: false, wasRegulatedAtAcquisition: false,
    isUnregistered: false, isNonBusinessLand: false, residencePeriodMonths: 0, annualBasicDeductionUsed: 0,
    commercialAppurtenantLand: {
      totalLandArea: 2400, totalBuildingFootprintArea: 200, zoneType: "commercial",
      partBasis: { acquisitionLandStd: 800_000_000, acquisitionBuildingStd: 200_000_000, transferLandStd: 800_000_000, transferBuildingStd: 200_000_000 },
    },
  };
  it("수용 + 고시일 → 165,060,000 (수정 전 170,120,000)", async () => {
    expect((await calcTax({ ...CB, transferCause: "public_expropriation" })).calculatedTax).toBe(170_120_000);
    expect((await calcTax({ ...CB, transferCause: "public_expropriation", appurtenantExcessFacts: FACTS })).calculatedTax).toBe(165_060_000);
  });
});
