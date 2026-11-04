/**
 * anchor — 부담부증여 × 이월과세 「당초 증여자 취득 당시 건물 기준시가」 0 (2026-11-04, 사용자 결정 A안)
 *
 * 주택·상가는 기준시가가 토지를 포함한 한 값이라(「소득세법」 제99조 제1항 제1호 라목·다목) 엔진은 두 칸 **합계**만 쓴다 —
 * 「합계를 한 칸에, 다른 칸 0」은 정상 입력이므로 막지 않는다(Z-1). 토글 C(당초 증여자가 토지·건물을 다른 날 취득)는
 * 토지·건물을 따로 계산하므로 건물 0을 ⑧이 막고, ⑫도 같은 조건으로 400을 낸다(Z-2 · 수정 前 200 — 80,630,800 / 82,457,333).
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
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => { vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never); });
afterEach(() => vi.unstubAllGlobals());

type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
async function post(body: Body): Promise<{ status: number; det?: number; message?: string; data?: Body }> {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, annualBasicDeductionUsed: 0, ...body, isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0 }),
  }));
  const json = (await res.json()) as { data?: { result?: Body; aggregated?: Body }; error?: { message?: string; fieldErrors?: Record<string, string[]> } };
  const message = [json.error?.message, ...Object.values(json.error?.fieldErrors ?? {}).flat()].filter(Boolean).join(" | ");
  const data = json.data?.result ?? json.data?.aggregated;
  return { status: res.status, det: data?.determinedTax, message, data };
}
const issues = (f: TransferFormData) =>
  [0, 1, 2, 3, 4].flatMap((s) => collectStepIssues(s, f)).filter((i) => !String(i.field).startsWith("household")) as { field?: string; message?: string }[];
const bodyAny = async (f: TransferFormData) => (await bodyOf(f)) as Body;
const run = async (f: TransferFormData) => post(await bodyOf(f));
const ok = async (f: TransferFormData) => {
  expect(issues(f)).toEqual([]);
  const r = await run(f);
  expect(r.status, r.message).toBe(200);
  return r;
};

import { BG_HOUSE_SPLIT_BUILDING_STD_ZERO_MESSAGE } from "@/lib/api/transfer-tax-schema-donor-built";

/** 기준시가 평가 · 이월과세 — 당초 증여자 토지 5천만 · 건물 bStd. carryoverDonorSplit = 토글 C. */
const stdCarry = (bStd: string, over: Partial<AssetForm> = {}) =>
  bgAsset("converted", { donorBuilt: false }, {
    bgValuationMode: "sangjeungbeop_standard", bgMarketValueAtTransfer: "", bgAcquisitionMethod: "",
    bgLendingDepositTotal: "0", bgMortgageDebtAmount: "400,000,000",
    standardPriceAtTransfer: "500,000,000", standardPriceAtAcq: "300,000,000",
    bgCoDonorLandStdPriceAtAcq: "50,000,000", bgCoDonorBuildingStdPriceAtAcq: bStd,
    carryover: { ...CARRYOVER_DEFAULTS, giftRegistryDate: "2023-06-01", donorAcquisitionDate: "2000-06-01", donorAcquisitionPrice: "150,000,000", giftDateValuation: "1,000,000,000", giftTaxAmount: "0", donorRelation: "lineal", donorSameHousehold: "no" },
    ...over,
  } as Partial<AssetForm>);
const SPLIT_C = {
  carryoverDonorSplit: true,
  standardPricePerSqmAtTransfer: "3,000,000", transferArea: "100", buildingStandardPriceAtTransfer: "300,000,000",
  standardPricePerSqmAtAcq: "1,000,000", acquisitionArea: "100", buildingStandardPriceAtAcq: "150,000,000",
  buildingCarryover: { ...CARRYOVER_DEFAULTS, donorAcquisitionDate: "2015-01-01" },
} as Partial<AssetForm>;

describe("Z-1 주택·상가(토글 C OFF) — 합계만 쓰므로 0은 정상 입력이다", () => {
  for (const kind of ["housing", "commercial_building"] as const) {
    it(`${kind}: 토지 1.5억·건물 0 = 토지 0·건물 1.5억 = 1억·5천만 — ⑧ 통과 · 같은 세액`, async () => {
      const dets = [];
      for (const [l, b] of [["150,000,000", "0"], ["0", "150,000,000"], ["100,000,000", "50,000,000"]]) {
        const f = bgForm(stdCarry(b, { assetKind: kind, bgCoDonorLandStdPriceAtAcq: l }));
        dets.push((await ok(f)).det);
      }
      expect(new Set(dets).size).toBe(1);
    });
  }
});

describe("Z-2 토글 C(주택·건물) — 토지·건물을 따로 계산하므로 건물 0을 막는다", () => {
  for (const kind of ["housing", "building"] as const) {
    it(`${kind}: ⑧ 건물 0 → 그 칸 · ⑫ 본문 건물 0 → 400 · 1억은 200`, async () => {
      expect(issues(bgForm(stdCarry("0", { assetKind: kind, ...SPLIT_C })))[0]?.field).toBe("bgCoDonorBuildingStdPriceAtAcq");
      const f = bgForm(stdCarry("100,000,000", { assetKind: kind, ...SPLIT_C }));
      expect((await ok(f)).status).toBe(200);
      const body = await bodyAny(f);
      expect(body.burdenedGiftInfo.carryoverDonorBasis.buildingDonorAcquisitionDate).toBe("2015-01-01");
      body.burdenedGiftInfo.carryoverDonorBasis.buildingStdPriceAtAcquisition = 0;
      const r = await post(body);
      expect(r.status).toBe(400);
      expect(r.message).toContain(BG_HOUSE_SPLIT_BUILDING_STD_ZERO_MESSAGE);
    });
  }

  it("⑫는 기준시가를 쓰지 않는 방식(시가·실지 K-4)에 남은 0을 거부하지 않는다 — ⑧과 같은 조건", async () => {
    const f = bgForm(stdCarry("100,000,000", { ...SPLIT_C }));
    const body = await bodyAny(f);
    body.burdenedGiftInfo = { ...body.burdenedGiftInfo, valuationMode: "sangjeungbeop_market", acquisitionMethod: "actual" };
    body.burdenedGiftInfo.carryoverDonorBasis.buildingStdPriceAtAcquisition = 0;
    const r = await post(body);
    expect(r.message ?? "").not.toContain(BG_HOUSE_SPLIT_BUILDING_STD_ZERO_MESSAGE);
  });

  it("토글 C가 아니면(건물분 증여자 취득일 없음) ⑫는 0을 받는다 — 합계 계산", async () => {
    const body = await bodyAny(bgForm(stdCarry("0", { bgCoDonorLandStdPriceAtAcq: "150,000,000" })));
    expect(body.burdenedGiftInfo.carryoverDonorBasis.buildingDonorAcquisitionDate).toBeUndefined();
    expect((await post(body)).status).toBe(200);
  });
});

describe("Z-3 재개발 완공 아파트 원조합원 · 기준시가 평가 — 종전 부동산 기준시가 두 칸도 합계로 계산한다", () => {
  const REDEV = { assetKind: "redevelopment_apt", redevSubject: "apt", redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2024-01-10", redevRightsValue: "900000000",
    redevSettlementDirection: "pay", redevSettlementAmount: "100000000", redevCompletionDate: "2025-09-01", redevManagementDisposalHousingPrice: "600000000",
    redevAcquisitionHousingPrice: "250000000", addressJibun: "서울 B 2" } as Partial<AssetForm>;
  const CO = { ...CARRYOVER_DEFAULTS, giftRegistryDate: "2023-06-01", donorAcquisitionDate: "2000-06-01", donorAcquisitionPrice: "150,000,000", giftDateValuation: "1,000,000,000", giftTaxAmount: "0", donorRelation: "lineal", donorSameHousehold: "no", donorHouseholdHoldingStartDate: "2012-01-01" };
  const gainA = async (l: string, b: string) => {
    const r = await ok(bgForm(stdCarry(b, { ...REDEV, bgCoDonorLandStdPriceAtAcq: l, carryover: CO as never })));
    return (r.data as Body).carryoverTaxationDetail?.scenarioA?.transferGain as number;
  };
  it("1천만·0 = 0·1천만 = 5백만·5백만 (시나리오 A 양도차익 같음) · 합계가 다르면 다르다", async () => {
    const same = [await gainA("10,000,000", "0"), await gainA("0", "10,000,000"), await gainA("5,000,000", "5,000,000")];
    expect(new Set(same).size).toBe(1);
    expect(await gainA("20,000,000", "0")).not.toBe(same[0]);
  });
});

