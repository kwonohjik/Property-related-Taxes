/**
 * anchor — 부담부증여 × 이월과세 × 시가 평가 환산(K-5) 시나리오 B: 양도인 증여일 평가액(「소득세법 시행령」 제163조 제9항)
 * (2026-11-04 사용자 결정 Q-2 a)
 *
 * 계획서: `docs/02-design/features/bg-carryover-k5-transferor-sec163-9.plan.md` §1.2
 *
 * 양도인은 자산을 증여받았으므로 증여일 상증법 평가액이 취득 당시 실지거래가액이다 — 환산(나목)으로 가지 않는다.
 * 수정 前: B 취득가액 = 환산(양도인 취득시 기준시가 ÷ 양도시 기준시가) — 주택 등 240,000,000 · B 결정세액 38,542,000.
 * 수정 後: B 취득가액 = 평가액 × 채무비율 0.4 — K-6/K-7 B와 같은 칸(`bgActual*`).
 *
 * 시료: 시가 10억 · 채무 4억 · 양도시 기준시가 5억 · 양도인 취득시 기준시가 3억 · 당초 증여자 기준시가 합계 1억 · 양도인 증여일 평가액 8억 · 증여세 0.
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
import { sameDayBuildingDonorDate } from "./_helpers/gb-bg-building-donor-date";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => { vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never); });
afterEach(() => vi.unstubAllGlobals());

type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
async function post(body: Body) {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, annualBasicDeductionUsed: 0, ...body, isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0 }),
  }));
  const json = (await res.json()) as Body;
  const message = [json.error?.message, ...Object.values(json.error?.fieldErrors ?? {}).flat()].filter(Boolean).join(" | ");
  return { status: res.status, message, data: (json.data?.result ?? json.data?.aggregated) as Body };
}
const form = (a: AssetForm) => { const f = bgForm(a); f.contractTotalPrice = "1,000,000,000"; return f; };
const issues = (f: TransferFormData) =>
  [0, 1, 2, 3, 4].flatMap((s) => collectStepIssues(s, f)).filter((i) => !String(i.field).startsWith("household")) as { field?: string; message?: string }[];
async function run(a: AssetForm) {
  const f = form(a);
  expect(issues(f)).toEqual([]);
  const r = await post(await bodyOf(f));
  expect(r.status, r.message).toBe(200);
  return r.data;
}

const CO = { ...CARRYOVER_DEFAULTS, giftRegistryDate: "2023-06-01", donorAcquisitionDate: "2000-06-01", donorAcquisitionPrice: "150,000,000", giftDateValuation: "800,000,000", giftTaxAmount: "0", donorRelation: "lineal", donorSameHousehold: "no", donorHouseholdHoldingStartDate: "2012-01-01" };
const base = (over: Partial<AssetForm> = {}) =>
  bgAsset("converted", { donorBuilt: false }, {
    bgMarketValueAtTransfer: "1,000,000,000", bgLendingDepositTotal: "0", bgMortgageDebtAmount: "400,000,000",
    standardPriceAtTransfer: "500,000,000", standardPriceAtAcq: "300,000,000",
    landStandardPriceAtTransfer: "0", buildingStandardPriceAtTransfer: "500,000,000",
    bgAcquisitionMethod: "converted",
    bgCoDonorLandStdPriceAtAcq: "50,000,000", bgCoDonorBuildingStdPriceAtAcq: "50,000,000",
    bgActualAcquisitionTotal: "800,000,000",
    carryover: CO as never,
    ...over,
  } as Partial<AssetForm>);
const LAND = { assetKind: "land", acquisitionArea: "100", transferArea: "100", landStandardPriceAtTransfer: "500,000,000", buildingStandardPriceAtTransfer: "0", bgActualAcquisitionTotal: "", bgActualAcquisitionLand: "800,000,000" } as Partial<AssetForm>;
const gb = (over: Partial<AssetForm> = {}) => sameDayBuildingDonorDate({
  ...base(), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "general_building", gbBuildingAcquisitionCause: "carryover_gift",
  gbLandArea: "100", gbBuildingArea: "200", gbBuildingFootprintArea: "50", gbZoneType: "general_residential",
  gbTransferLandPricePerSqm: "3,000,000", gbTransferBuildingValue: "200,000,000",
  gbAcqLandPricePerSqm: "2,000,000", gbAcqBuildingValue: "100,000,000",
  bgMortgageSetAmount: "400,000,000", bgActualAcquisitionTotal: "", bgActualAcquisitionLand: "500,000,000", bgActualAcquisitionBuilding: "300,000,000",
  ...over,
} as AssetForm);
const REDEV = { assetKind: "redevelopment_apt", redevSubject: "apt", redevIsSuccessorMember: "no", redevOriginalAssetType: "housing", redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2024-01-10", redevRightsValue: "900000000",
  redevSettlementDirection: "pay", redevSettlementAmount: "100000000", redevCompletionDate: "2025-09-01", redevManagementDisposalHousingPrice: "600000000",
  redevAcquisitionHousingPrice: "250000000", addressJibun: "서울 B 2", bgCoDonorLandStdPriceAtAcq: "100,000,000", bgCoDonorBuildingStdPriceAtAcq: "0" } as Partial<AssetForm>;

const scenarioB = (d: Body) => (d.carryoverTaxationDetail ?? d.burdenedGiftCarryoverDetail).scenarioB as Body;

describe("B-1 단일 기준시가 자산 — B 취득가액 = 평가액 8억 × 0.4", () => {
  for (const [kind, over] of [["housing", {}], ["building", { assetKind: "building" }], ["commercial_building", { assetKind: "commercial_building" }], ["land", LAND]] as const) {
    it(`${kind}: B 취득가액 320,000,000 · B 결정세액 12,840,000 (수정 前 240,000,000 · 38,542,000) · A 채택`, async () => {
      const d = await run(base(over as Partial<AssetForm>));
      const c = d.carryoverTaxationDetail as Body;
      expect({ acqB: c.scenarioB.acquisitionPrice, taxB: c.scenarioB.determinedTax, adopted: c.adoptedScenario }).toEqual({ acqB: 320_000_000, taxB: 12_840_000, adopted: "A" });
    });
  }
});

describe("B-2 B 채택 시료 — 주택 · 당초 증여자 건물 4.5억 · 평가액 5억", () => {
  it("B 채택 · B 취득가액 200,000,000 · 결정세액 55,110,000 (수정 前 환산 240,000,000 · 38,542,000)", async () => {
    const d = await run(base({ bgCoDonorLandStdPriceAtAcq: "0", bgCoDonorBuildingStdPriceAtAcq: "450,000,000", bgActualAcquisitionTotal: "500,000,000" }));
    const c = d.carryoverTaxationDetail as Body;
    expect({ adopted: c.adoptedScenario, acqB: c.scenarioB.acquisitionPrice, det: d.determinedTax }).toEqual({ adopted: "B", acqB: 200_000_000, det: 55_110_000 });
  });

  it("양도인 취득시 기준시가는 B에 닿지 않는다 — 1억으로 바꿔도 같은 세액", async () => {
    const d = await run(base({ standardPriceAtAcq: "100,000,000", bgCoDonorLandStdPriceAtAcq: "0", bgCoDonorBuildingStdPriceAtAcq: "450,000,000", bgActualAcquisitionTotal: "500,000,000" }));
    expect(d.determinedTax).toBe(55_110_000);
  });
});

describe("B-3 일반건물 — 토지·건물 평가액 각각 × 0.4", () => {
  it("B 토지 200,000,000 · 건물 120,000,000 (수정 前 환산 160,000,000 · 80,000,000)", async () => {
    const parts = scenarioB(await run(gb())).parts as Body[];
    expect(parts.map((p) => p.acquisitionPrice)).toEqual([200_000_000, 120_000_000]);
  });
});

describe("B-4 재개발 완공 아파트 원조합원 — (평가액 8억 + 납부 청산금 1억) × 0.4", () => {
  it("B 취득가액 360,000,000 · B 결정세액 4,365,000 (수정 前 §166③ 190,000,000 · 57,770,000)", async () => {
    const d = await run(base(REDEV));
    const c = d.carryoverTaxationDetail as Body;
    expect({ acqB: c.scenarioB.acquisitionPrice, taxB: c.scenarioB.determinedTax }).toEqual({ acqB: 360_000_000, taxB: 4_365_000 });
  });
});

describe("B-5 평가액 미입력 — ⑧ 그 칸 · ⑫ 400", () => {
  for (const [kind, over, field] of [
    ["housing", { bgActualAcquisitionTotal: "" }, "bgActualAcquisitionTotal"],
    ["land", { ...LAND, bgActualAcquisitionLand: "" }, "bgActualAcquisitionLand"],
  ] as const) {
    it(`${kind}: ⑧ ${field} · 본문 actual 제거 → 400`, async () => {
      const f = form(base(over as Partial<AssetForm>));
      expect(issues(f)[0]?.field).toBe(field);
      const ok = (await bodyOf(form(base(kind === "land" ? LAND : {})))) as Body;
      delete ok.burdenedGiftInfo.actualAcquisitionTotal;
      delete ok.burdenedGiftInfo.actualLandAcquisitionPrice;
      const r = await post(ok);
      expect(r.status).toBe(400);
      expect(r.message).toContain("§163⑨");
    });
  }

  it("일반건물: ⑧ 건물 칸 비면 그 칸", () => {
    expect(issues(form(gb({ bgActualAcquisitionBuilding: "" })))[0]?.field).toBe("bgActualAcquisitionBuilding");
  });
});

describe("B-6 ④ — K-5 이월과세에서 평가액 칸을 싣는다", () => {
  it("주택 actualAcquisitionTotal 800,000,000", async () => {
    const body = (await bodyOf(form(base()))) as Body;
    expect(body.burdenedGiftInfo.actualAcquisitionTotal).toBe(800_000_000);
  });
  it("이월과세가 아닌 K-5(매매)는 싣지 않는다", async () => {
    const body = (await bodyOf(form(base({ acquisitionCause: "purchase" } as Partial<AssetForm>)))) as Body;
    expect(body.burdenedGiftInfo.actualAcquisitionTotal).toBeUndefined();
  });
});

describe("B-7 양도인 취득시 기준시가(② 양도정보) — K-5 이월과세에서는 묻지 않는다(Q-3 a · K-6/K-7과 같음)", () => {
  const CAPEX = { capitalExpenditure: "30,000,000", transferExpense: "5,000,000" } as Partial<AssetForm>;
  for (const [kind, over] of [["housing", {}], ["building", { assetKind: "building" }], ["land", { ...LAND, standardPricePerSqmAtAcq: "", acquisitionArea: "100" }]] as const) {
    it(`${kind}: 비워도 ⑧ 통과 · 채운 값과 같은 세액(자본적지출·양도비 있음)`, async () => {
      const filled = await run(base({ ...(over as Partial<AssetForm>), ...CAPEX }));
      const empty = await run(base({ ...(over as Partial<AssetForm>), ...CAPEX, standardPriceAtAcq: "" }));
      expect(empty.determinedTax).toBe(filled.determinedTax);
      expect(empty.carryoverTaxationDetail.scenarioB.determinedTax).toBe(filled.carryoverTaxationDetail.scenarioB.determinedTax);
      // 자본적지출·양도비가 실제로 B에 닿는 시료다(공허한 비교 방지)
      expect(filled.carryoverTaxationDetail.scenarioB.determinedTax).not.toBe((await run(base(over as Partial<AssetForm>))).carryoverTaxationDetail.scenarioB.determinedTax);
    });
  }
});

describe("B-8 방어선 각각 — ⑫를 우회한 엔진 직접 호출 · 일반건물 ⑫", () => {
  it("엔진: K-5 이월과세 · 양도인 평가액 없음 → 던진다(소득세법 시행령 제163조 제9항)", async () => {
    const { calculateTransferTax } = await import("@/lib/tax-engine/transfer-tax");
    const { baseTransferInput, makeMockRates: rates } = await import("../tax-engine/_helpers/mock-rates");
    const d = (s: string) => new Date(s);
    const input = baseTransferInput({
      propertyType: "housing", transferType: "burdened_gift", acquisitionCause: "carryover_gift",
      carryoverTaxation: { giftRegistryDate: d("2023-06-01"), donorAcquisitionDate: d("2000-06-01"), donorAcquisitionPrice: 0, useEstimatedAcquisition: false, giftTaxAmount: 0, giftDateValuation: 800_000_000 },
      burdenedGiftInfo: {
        valuationMode: "sangjeungbeop_market", marketValueAtTransfer: 1_000_000_000, acquisitionMethod: "converted",
        lendingDepositTotal: 0, mortgageDebtAmount: 400_000_000, annualRentTotal: 0,
        landStdPriceAtTransfer: 0, buildingStdPriceAtTransfer: 500_000_000, landStdPriceAtAcquisition: 0, buildingStdPriceAtAcquisition: 300_000_000,
        carryoverDonorBasis: { landStdPriceAtAcquisition: 0, buildingStdPriceAtAcquisition: 100_000_000 },
      },
      transferDate: d("2026-02-16"), acquisitionDate: d("2023-06-01"), transferPrice: 0, acquisitionPrice: 0, expenses: 0,
      useEstimatedAcquisition: false, isOneHousehold: false, householdHousingCount: 2,
    } as never);
    expect(() => calculateTransferTax(input, rates())).toThrow(/제163조 제9항/);
    expect(() => calculateTransferTax({ ...input, burdenedGiftInfo: { ...input.burdenedGiftInfo!, actualAcquisitionTotal: 800_000_000 } }, rates())).not.toThrow();
  });

  it("일반건물 ⑫: 본문 양도인 평가액 제거 → 400 · 토지·건물 칸 경로", async () => {
    const body = (await bodyOf(form(gb()))) as Body;
    const info = body.burdenedGiftInfo ?? body.generalBuildingValuation?.burdenedGiftInfo;
    delete info.actualLandAcquisitionPrice;
    delete info.actualBuildingAcquisitionPrice;
    delete info.actualAcquisitionTotal;
    const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, annualBasicDeductionUsed: 0, ...body, isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0 }),
    }));
    const json = (await res.json()) as Body;
    expect(res.status).toBe(400);
    expect(Object.keys(json.error?.fieldErrors ?? {}).join(" ")).toMatch(/actualLandAcquisitionPrice/);
  });
});
