/**
 * anchor — 부담부증여 × 이월과세 × 시가 평가 환산(K-5) 시나리오 A: 당초 증여자 기준시가 두 칸 **합계**(V-6 · 2026-11-04 사용자 결정 Q-1 a)
 *
 * 계획서: `docs/02-design/features/bg-carryover-k5-transferor-sec163-9.plan.md` §1.1
 *
 * 주택·건물·상가는 양도시 기준시가를 건물 자리 하나에, 토지는 토지 자리 하나에 싣는다. K-5 환산은 파트별이라
 * (양도시 기준시가 0인 파트 = 취득가액 0) 당초 증여자 값이 「다른」 칸에 있으면 버려졌다 — #2886 안내(「합계를 한 칸에」)대로
 * 토지 1억 · 건물 0을 넣으면 A 취득가액 0 · 결정세액 85,190,800(수정 前). K-1·K-7·담보 승처럼 합계로 계산한다.
 *
 * 시료: 시가 10억 · 채무 4억 · 양도시 기준시가 5억 · 양도인 취득시 기준시가 3억 · 당초 증여자 기준시가 합계 1억 · 증여세 0.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { bgAsset, bgForm, bodyOf } from "@/__tests__/calc/_helpers/carryover-donor-built-bg-form";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

beforeEach(() => { vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never); });
afterEach(() => vi.unstubAllGlobals());

type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
async function run(asset: AssetForm) {
  const f = bgForm(asset);
  f.contractTotalPrice = "1,000,000,000";
  expect([0, 1, 2, 3, 4].flatMap((s) => collectStepIssues(s, f)).filter((i) => !String(i.field).startsWith("household"))).toEqual([]);
  const body = (await bodyOf(f)) as Body;
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, annualBasicDeductionUsed: 0, ...body, isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0 }),
  }));
  const json = (await res.json()) as Body;
  expect(res.status, JSON.stringify(json.error)).toBe(200);
  const data = json.data.result as Body;
  const c = data.carryoverTaxationDetail as Body;
  return { det: data.determinedTax as number, adopted: c.adoptedScenario as string, acqA: c.scenarioA.acquisitionPrice as number };
}

const CO = { ...CARRYOVER_DEFAULTS, giftRegistryDate: "2023-06-01", donorAcquisitionDate: "2000-06-01", donorAcquisitionPrice: "150,000,000", giftDateValuation: "600,000,000", giftTaxAmount: "0", donorRelation: "lineal", donorSameHousehold: "no", donorHouseholdHoldingStartDate: "2012-01-01" };
const k5 = (land: string, building: string, over: Partial<AssetForm> = {}) =>
  bgAsset("converted", { donorBuilt: false }, {
    bgMarketValueAtTransfer: "1,000,000,000", bgLendingDepositTotal: "0", bgMortgageDebtAmount: "400,000,000",
    standardPriceAtTransfer: "500,000,000", standardPriceAtAcq: "300,000,000",
    landStandardPriceAtTransfer: "0", buildingStandardPriceAtTransfer: "500,000,000",
    bgAcquisitionMethod: "converted",
    bgCoDonorLandStdPriceAtAcq: land, bgCoDonorBuildingStdPriceAtAcq: building,
    carryover: CO as never,
    ...over,
  } as Partial<AssetForm>);
const LAND = { assetKind: "land", acquisitionArea: "100", transferArea: "100", landStandardPriceAtTransfer: "500,000,000", buildingStandardPriceAtTransfer: "0" } as Partial<AssetForm>;

/** 합계 1억 → A 취득가액 = 4억(채무 안분 양도가액) × 1억 ÷ 5억 = 80,000,000 (계획서 §1.1 「0 · 1억」 행). */
const SUM_ACQ_A = 80_000_000;
const SUM_DET = 63_910_800;

describe("K5-1 주택·건물·상가 — 당초 증여자 기준시가를 어느 칸에 넣어도 합계로 환산한다", () => {
  for (const kind of ["housing", "building", "commercial_building"] as const) {
    it(`${kind}: 1억·0 = 0·1억 = 5천만·5천만 — A 취득가액 ${SUM_ACQ_A} · 결정세액 ${SUM_DET}`, async () => {
      for (const [l, b] of [["100,000,000", "0"], ["0", "100,000,000"], ["50,000,000", "50,000,000"]]) {
        const r = await run(k5(l, b, { assetKind: kind }));
        expect({ l, b, ...r }).toEqual({ l, b, det: SUM_DET, adopted: "A", acqA: SUM_ACQ_A });
      }
    });
  }
});

describe("K5-2 토지 — 건물 칸에 넣은 값도 토지 자리 합계로 환산한다", () => {
  it("0·1억 = 1억·0", async () => {
    for (const [l, b] of [["0", "100,000,000"], ["100,000,000", "0"]]) {
      const r = await run(k5(l, b, LAND));
      expect({ l, b, ...r }).toEqual({ l, b, det: SUM_DET, adopted: "A", acqA: SUM_ACQ_A });
    }
  });
});

describe("K5-3 합계가 다르면 다르다 — 합계만 쓴다", () => {
  it("주택 2억·0 ≠ 1억·0", async () => {
    const r = await run(k5("200,000,000", "0"));
    expect(r.acqA).toBe(160_000_000);
  });
});
