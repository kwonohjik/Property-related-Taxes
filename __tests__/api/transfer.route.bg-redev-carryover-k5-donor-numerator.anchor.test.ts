/**
 * anchor — 재개발 완공 아파트 원조합원 × 부담부증여 × 이월과세 × 시가 평가 환산(K-5) — 시나리오 A의 「소득세법 시행령」 제166조 제3항 분자
 * 계획서 `docs/02-design/features/bg-redev-carryover-k5-sec166-3.plan.md` (Q-1 a · Q-2′ b′ · Q-3 a · Q-4 a)
 *
 * A(이월과세 적용)의 취득가액은 당초 증여자가 종전 부동산을 취득할 당시 금액(「소득세법」 제97조의2 제1항 제1호)이다.
 * 실지를 모르면 §166③ — 분자는 **당초 증여자 취득일** 기준시가 = 「당초 증여자 취득 당시 토지·건물 기준시가」 두 칸(⑧·⑫ 필수).
 * 수정 前: A·B가 같은 「취득당시 개별주택공시가격」 칸으로 환산해 취득가액이 늘 같았다(190,000,000 · B 채택 57,770,000).
 * B는 2026-11-04 Q-2 a(`bg-carryover-k5-transferor-sec163-9.plan.md`)로 양도인 증여일 평가액(소령 §163⑨) — (평가액 10억 + 납부 청산금 1억) × 0.4 = 440,000,000(§166②).
 *   종전 §166③ 환산(190,000,000 · 「취득당시 개별주택공시가격」 칸)은 B에도 쓰지 않는다.
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
const run = async (f: TransferFormData) => post(await bodyOf(f));
const ok = async (f: TransferFormData) => {
  expect(issues(f)).toEqual([]);
  const r = await run(f);
  expect(r.status, r.message).toBe(200);
  return r;
};


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


const REDEV = { assetKind: "redevelopment_apt", redevSubject: "apt", redevIsSuccessorMember: "no", redevOriginalAssetType: "housing", redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2024-01-10", redevRightsValue: "900000000",
  redevSettlementDirection: "pay", redevSettlementAmount: "100000000", redevCompletionDate: "2025-09-01", redevManagementDisposalHousingPrice: "600000000",
  redevAcquisitionHousingPrice: "250000000", addressJibun: "서울 B 2", bgCoDonorLandStdPriceAtAcq: "100,000,000", bgCoDonorBuildingStdPriceAtAcq: "0" } as Partial<AssetForm>;
/** K-5 · 양도인 증여일 평가액 10억(이월과세 박스 「증여 당시 평가액」과 같은 사실) — 시나리오 B(소령 §163⑨). */
const K5 = { bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1,000,000,000", bgAcquisitionMethod: "converted", bgActualAcquisitionTotal: "1,000,000,000" } as Partial<AssetForm>;
const CO = { ...CARRYOVER_DEFAULTS, giftRegistryDate: "2023-06-01", donorAcquisitionDate: "2000-06-01", donorAcquisitionPrice: "150,000,000", giftDateValuation: "1,000,000,000", giftTaxAmount: "0", donorRelation: "lineal", donorSameHousehold: "no", donorHouseholdHoldingStartDate: "2012-01-01" };
const detail = async (o: Partial<AssetForm>) => {
  const r = await ok(bgForm(stdCarry("0", { ...REDEV, ...o, carryover: CO as never })));
  const c = (r.data as Body).carryoverTaxationDetail;
  return { det: r.det, adopted: c.adoptedScenario, a: c.scenarioA, b: c.scenarioB };
};

describe("K5-1 종전 주택 — A의 §166③ 분자 = 당초 증여자 기준시가", () => {
  it("A 취득가액 (900M × 1억/6억 + 청산금 1억) × 0.4 = 100,000,000 · A 58,590,800 · B (10억 + 1억) × 0.4 = 440,000,000 → A 채택 (수정 前 A=B 190,000,000 · B 채택 57,770,000)", async () => {
    const d = await detail(K5);
    expect(d.a.acquisitionPrice).toBe(100_000_000);
    expect(d.a.determinedTax).toBe(58_590_800);
    expect(d.b.acquisitionPrice).toBe(440_000_000); // B = 양도인 증여일 평가액(소령 §163⑨ · §166②) — 2026-11-04 Q-2 a
    expect(d.adopted).toBe("A");
    expect(d.det).toBe(58_590_800);
  });

  it("당초 증여자 기준시가가 A에 닿는다 — 토지·건물 두 칸 합계(1억·0 = 0·1억) · 2억이면 (900M × 2억/6억 + 1억) × 0.4 = 160,000,000", async () => {
    expect((await detail({ ...K5, bgCoDonorLandStdPriceAtAcq: "0", bgCoDonorBuildingStdPriceAtAcq: "100,000,000" })).a.acquisitionPrice).toBe(100_000_000);
    expect((await detail({ ...K5, bgCoDonorLandStdPriceAtAcq: "200,000,000" })).a.acquisitionPrice).toBe(160_000_000);
  });

  it("「취득당시 개별주택공시가격」(양도인 증여일 기준)은 A에도 B에도 닿지 않는다 — B는 증여일 평가액(종전 B만 115,000,000으로 움직였다)", async () => {
    const d = await detail({ ...K5, redevAcquisitionHousingPrice: "125000000" });
    expect(d.a.acquisitionPrice).toBe(100_000_000);
    expect(d.b.acquisitionPrice).toBe(440_000_000);
  });
});

describe("K5-3 종전 토지 — 분자는 토지 기준시가(§166③ 토지 출자)", () => {
  const LAND = { ...K5, redevOriginalAssetType: "land", redevLandArea: "100", redevLandPricePerSqmAtAcq: "500,000", redevLandPricePerSqmAtApproval: "3,000,000" } as Partial<AssetForm>;
  it("A (900M × 당초 증여자 1억 / 인가일 3억 + 1억) × 0.4 = 160,000,000 · B (평가액 10억 + 1억) × 0.4 = 440,000,000(종전 §166③ 100,000,000)", async () => {
    const d = await detail(LAND);
    expect(d.b.acquisitionPrice).toBe(440_000_000);
    expect(d.a.acquisitionPrice).toBe(160_000_000);
  });
});

describe("K5-2 회귀 0 — K-5 밖은 그대로", () => {
  it("기준시가 평가 11,112,000 · K-4 실지 70,310,000", async () => {
    expect((await detail({})).det).toBe(11_112_000);
    expect((await detail({ bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1,000,000,000", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "300,000,000", bgCoDonorActualAcquisitionTotal: "100,000,000" })).det).toBe(70_310_000);
  });
});
