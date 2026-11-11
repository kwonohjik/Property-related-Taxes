/**
 * 축 B(지분 분할) × 부담부증여 × 재개발 완공 아파트 — 지분별 산정방식(K-4 ↔ K-5 · Q-47 a).
 * 계획서 docs/00-pm/remaining-4-measurements.plan.md §C. 시료 · 오라클은 측정(§C.1)과 같다 — 시가 10억 · 채무 6억 · 청산금 납부 92,781,500.
 * 종전: 지분 카드의 산정방식이 자산 1 값으로 덮여(④ `mergePrimaryBasicAll`) ⑧ 0 · ⑫ 200인 채 자산 1 방식으로 계산됐다(원조합원 60/40 −23,485,040 · 승계 +90,000,000).
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
const pct = (n: number): A => ({ ownershipNumerator: String(Math.round(n * 100)), ownershipDenominator: "100" });
const debtOf = (d: number): A => ({ bgMortgageDebtAmount: String(d), bgMortgageSetAmount: String(d) });
const OWN = (v: string): A => ({ bgShareOwnAcquisition: true, bgActualAcquisitionTotal: v });

// ── 재개발 APT(§19.4 · §23 시료) ──
const SET = 92_781_500;
const COMMON: A = { addressJibun: "서울 강남구 테스트동 1-1", transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgLendingDepositTotal: "0" };
const REDEV = (set: number): A => ({ assetKind: "redevelopment_apt", acquisitionCause: "purchase", acquisitionDate: "2015-01-01", standardPriceAtTransfer: "800000000", standardPriceAtAcq: "400000000",
  redevSubject: "apt", redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2018-06-01", redevRightsValue: "219218500", redevSettlementDirection: "pay", redevSettlementAmount: String(set),
  redevCompletionDate: "2022-09-01", redevPreApprovalExpenses: "0", redevOriginalAssetType: "housing", redevActualAcquisitionPrice: "100000000", bgActualAcquisitionTotal: "250000000", useEstimatedAcquisition: false,
  redevManagementDisposalHousingPrice: "300000000", redevAcquisitionHousingPrice: "150000000" });
const SUCC: A = { redevIsSuccessorMember: "yes", acquisitionDate: "2019-03-01", redevSettlementAmount: "0" };
const SHARE_COMMON = (set: number): A => ({ acquisitionCause: "purchase", redevSubject: "apt", redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2018-06-01", redevRightsValue: "219218500",
  redevPreApprovalExpenses: "0", redevSettlementDirection: "pay", redevSettlementAmount: String(set), redevCompletionDate: "2022-09-01", redevOriginalAssetType: "housing" });
const K4: A = { bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000", bgAcquisitionMethod: "actual" };
const K5: A = { ...K4, bgAcquisitionMethod: "converted" };
const STD: A = { bgValuationMode: "sangjeungbeop_standard", bgMarketValueAtTransfer: "", bgAcquisitionMethod: "" };
type V = "orig" | "succ";
const share2Redev = (v: V, r2: number): A =>
  v === "succ" ? { ...SHARE_COMMON(0), acquisitionDate: "2020-01-01", redevIsSuccessorMember: "yes" } : { ...SHARE_COMMON(SET * r2), acquisitionDate: "2017-01-01", standardPriceAtAcq: "400000000",
      redevManagementDisposalHousingPrice: "300000000", redevAcquisitionHousingPrice: "150000000" };
const redevB = (v: V, mode: A, debt: number, r1: number, own2: A = {}, own1: A = {}) => rosterForDeclaredCount(Object.assign(createDefaultTransferFormData(), BASE, { assetSplitMode: "fractional", contractTotalPrice: "1000000000",
  assets: [mk(1, { assetId: "p" }, COMMON, REDEV(v === "succ" ? 0 : SET * r1), v === "succ" ? SUCC : {}, mode, debtOf(debt), pct(r1), own1), mk(2, { assetId: "s" }, pct(1 - r1), share2Redev(v, 1 - r1), own2)] })) as TransferFormData;
const redevA = (v: V, mode: A, debt: number, r: number, own: A) => rosterForDeclaredCount(Object.assign(createDefaultTransferFormData(), BASE, { contractTotalPrice: String(1_000_000_000 * r),
  assets: [mk(1, COMMON, REDEV(v === "succ" ? 0 : SET * r), v === "succ" ? SUCC : {}, mode, debtOf(debt * r), pct(r), { ownershipRemainderThirdParty: "yes" }, own)] })) as TransferFormData;

// ── 조합원입주권 원조합원(`bg-axis-b-right-share-inputs` 시료) ──
const RV: A = { bgRightMemberRightsValue: "1200000000", bgRightPaidInstallments: "200000000", bgRightPremium: "100000000" };
const ORIG = (set: number): A => ({ isSuccessorRightToMoveIn: false, acquisitionDate: "2009-07-01", acquisitionCause: "purchase", redevOriginalAssetType: "housing", redevRightsValue: "900000000",
  redevSettlementDirection: "pay", redevSettlementAmount: String(set), redevPreApprovalExpenses: "0", redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2018-06-01" });
const RTMI: A = { addressJibun: "서울 강남구 테스트동 9-9", assetKind: "right_to_move_in", redevSubject: "right", transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgLendingDepositTotal: "0", ...RV,
  standardPriceAtAcq: "", standardPriceAtTransfer: "" };
const R_STD: A = { bgValuationMode: "sangjeungbeop_standard", bgAcquisitionMethod: "" };
const R_K4: A = { bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1500000000", bgAcquisitionMethod: "actual" };
const RSET = 100_000_000;
const rtmiB = (mode: A, r1: number, own2: A = {}) => rosterForDeclaredCount(Object.assign(createDefaultTransferFormData(), BASE, { assetSplitMode: "fractional", contractTotalPrice: "1500000000",
  assets: [mk(1, { assetId: "p" }, RTMI, ORIG(RSET * r1), mode, debtOf(600_000_000), pct(r1), { bgActualAcquisitionTotal: "300000000" }),
           mk(2, { assetId: "s" }, pct(1 - r1), ORIG(RSET * (1 - r1)), { acquisitionDate: "2012-01-01" }, own2)] })) as TransferFormData;
const rtmiA = (mode: A, r: number, acq: string, date: string) => rosterForDeclaredCount(Object.assign(createDefaultTransferFormData(), BASE, { contractTotalPrice: String(1_500_000_000 * r),
  assets: [mk(1, RTMI, ORIG(RSET * r), mode, debtOf(600_000_000 * r), pct(r), { ownershipRemainderThirdParty: "yes", bgActualAcquisitionTotal: acq, acquisitionDate: date })] })) as TransferFormData;

async function post(f: TransferFormData) {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(await captureBody(f)) }));
  const j = (await res.json()) as Loose;
  return { status: res.status, err: JSON.stringify(j.error ?? null).slice(0, 300), gain: (j.data?.aggregated?.totalTransferGain ?? j.data?.result?.transferGain) as number };
}
async function gainOk(f: TransferFormData) {
  expect(allIssues(f)).toEqual([]);
  const r = await post(f);
  expect(r.status, r.err).toBe(200);
  return r.gain;
}

/** 지분 2의 자기 재료 — 원조합원 E(취득당시 개별주택가격) 2억 · 승계조합원 취득시 기준시가 5억 */
const OWN2_MAT = (v: V): A => (v === "orig" ? { redevAcquisitionHousingPrice: "200000000" } : { standardPriceAtAcq: "500000000" });

describe("RM-1 지분 1 K-4 + 지분 2 K-5 — 축 B = 지분별 재료 축 A 단건 합(Q-47 a)", () => {
  for (const [v, fixed] of [["orig", [417_816_140, 435_429_921]], ["succ", [360_000_000, 292_500_000]]] as const) {
    for (const [i, r1] of [0.6, 0.3].entries()) {
      it(`재개발 ${v === "orig" ? "원조합원" : "승계조합원"} · ${r1 * 100}/${100 - r1 * 100}`, async () => {
        const b = await gainOk(redevB(v, K4, 600_000_000, r1, { bgShareOwnAcquisition: true, bgAcquisitionMethod: "converted", ...OWN2_MAT(v) }));
        expect(b).toBe(fixed[i]);
      });
    }
  }
});

describe("RM-2 지분 1 K-5 + 지분 2 K-4 실지 3억 — 오라클과 같다(종전에는 지분 2에 실지 칸이 없어 전부 K-5)", () => {
  for (const [v, fixed] of [["orig", [431_251_770, 397_791_436]], ["succ", [348_000_000, 384_000_000]]] as const) {
    for (const [i, r1] of [0.6, 0.3].entries()) {
      it(`재개발 ${v === "orig" ? "원조합원" : "승계조합원"} · ${r1 * 100}/${100 - r1 * 100}`, async () => {
        const b = await gainOk(redevB(v, K5, 600_000_000, r1, { bgShareOwnAcquisition: true, bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "300000000" }));
        expect(b).toBe(fixed[i]);
      });
    }
  }
});
