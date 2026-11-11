/**
 * 승계조합원 완공 아파트 × 부담부증여 × 환산(K-5)·기준시가 — 필요경비(Q-52 a · 계획서 docs/00-pm/remaining-4-measurements.plan.md §F).
 * 시료: 시가 10억 · 채무 6억(채무비율 0.6 · 기준시가 모드 0.75) · 취득시 기준시가 4억 · 양도시 기준시가 8억.
 * 종전: §159 명세의 개산공제가 승계 분기에 닿지 않아 0원이었고, 인가 후 필요경비(실제)를 환산 취득가액과 함께 뺐다
 *       (필요경비 6억이면 −60,000,000). 일반 주택 부담부증여와 같은 규칙으로 맞춘다 — 기준시가는 개산공제만, 환산은 §97②2호 단서 택일.
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { allIssues, captureBody } from "../calc/_one-house-pr3a-calc-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { rosterForDeclaredCount } from "@/__tests__/calc/_helpers/roster-for-declared-count";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type A = Record<string, unknown>;
type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const BASE = { transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "2", isOneHousehold: false, householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true };
const mk = (n: number, ...o: A[]) => Object.assign({ ...makeDefaultAsset(n) }, ...o) as unknown as AssetForm;
const debtOf = (d: number): A => ({ bgMortgageDebtAmount: String(d), bgMortgageSetAmount: String(d) });

// ── 재개발 APT(§19.4 · §23 시료) ──
const SET = 92_781_500;
const COMMON: A = { addressJibun: "서울 강남구 테스트동 1-1", transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgLendingDepositTotal: "0" };
const REDEV = (set: number): A => ({ assetKind: "redevelopment_apt", acquisitionCause: "purchase", acquisitionDate: "2015-01-01", standardPriceAtTransfer: "800000000", standardPriceAtAcq: "400000000",
  redevSubject: "apt", redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2018-06-01", redevRightsValue: "219218500", redevSettlementDirection: "pay", redevSettlementAmount: String(set),
  redevCompletionDate: "2022-09-01", redevPreApprovalExpenses: "0", redevOriginalAssetType: "housing", redevActualAcquisitionPrice: "100000000", bgActualAcquisitionTotal: "250000000", useEstimatedAcquisition: false,
  redevManagementDisposalHousingPrice: "300000000", redevAcquisitionHousingPrice: "150000000" });
const SUCC: A = { redevIsSuccessorMember: "yes", acquisitionDate: "2019-03-01", redevSettlementAmount: "0" };
const K4: A = { bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000", bgAcquisitionMethod: "actual" };
const K5: A = { ...K4, bgAcquisitionMethod: "converted" };
const STD: A = { bgValuationMode: "sangjeungbeop_standard", bgMarketValueAtTransfer: "", bgAcquisitionMethod: "" };



async function gain(f: TransferFormData) {
  expect(allIssues(f)).toEqual([]);
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(await captureBody(f)) }));
  const j = (await res.json()) as Loose;
  expect(res.status, JSON.stringify(j.error ?? null).slice(0, 300)).toBe(200);
  return j.data.result.transferGain as number;
}
const single = (...o: A[]) => rosterForDeclaredCount(Object.assign(createDefaultTransferFormData(), BASE, { contractTotalPrice: "1000000000", assets: [mk(1, COMMON, ...o, debtOf(600_000_000))] })) as TransferFormData;
const HOUSE: A = { assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2019-03-01", standardPriceAtTransfer: "800000000", standardPriceAtAcq: "400000000", useEstimatedAcquisition: false };
const S = (...o: A[]) => single(REDEV(0), SUCC, ...o);

describe("SK-1 필요경비 칸 비움 — 개산공제를 뺀다(일반 주택과 같은 값)", () => {
  it("K-5: 600,000,000 − 환산 300,000,000 − 개산공제 7,200,000(4억 × 0.6 × 3%) = 292,800,000", async () => {
    expect(await gain(S(K5))).toBe(292_800_000);
    expect(await gain(single(HOUSE, K5))).toBe(292_800_000);
  });
  it("기준시가: 600,000,000 − 300,000,000 − 개산공제 9,000,000(4억 × 0.75 × 3%) = 291,000,000", async () => {
    expect(await gain(S(STD))).toBe(291_000_000);
    expect(await gain(single(HOUSE, STD))).toBe(291_000_000);
  });
});

describe("SK-2 인가 후 필요경비 입력 — 환산은 §97②2호 단서 택일 · 기준시가는 개산공제만", () => {
  it("K-5 · 5천만(× 0.6 = 30,000,000 < 307,200,000) → 본문(개산공제) 292,800,000", async () => {
    expect(await gain(S(K5, { redevPostApprovalExpenses: "50000000" }))).toBe(292_800_000);
  });
  it("기준시가 · 5천만 → 실제 필요경비를 쓰지 않는다 291,000,000", async () => {
    expect(await gain(S(STD, { redevPostApprovalExpenses: "50000000" }))).toBe(291_000_000);
  });
  it("K-5 · 6억(× 0.6 = 360,000,000 > 307,200,000) → 단서(그 금액만) 240,000,000 · 종전 −60,000,000", async () => {
    expect(await gain(S(K5, { redevPostApprovalExpenses: "600000000" }))).toBe(240_000_000);
  });
  it("K-5 · 자본적지출 6억 — §159 명세가 먼저 단서로 바꿔도 택일 전 값으로 다시 고른다 240,000,000", async () => {
    expect(await gain(S(K5, { capitalExpenditure: "600000000" }))).toBe(240_000_000);
  });
});

describe("SK-3 범위 밖은 종전 그대로", () => {
  it("실지(K-4): 600,000,000 − 250,000,000 × 0.6 = 450,000,000", async () => {
    expect(await gain(S(K4))).toBe(450_000_000);
  });
  it("원조합원 K-5(§166③ 경로): 475,865,550", async () => {
    expect(await gain(single(REDEV(SET), K5))).toBe(475_865_550);
  });
});
