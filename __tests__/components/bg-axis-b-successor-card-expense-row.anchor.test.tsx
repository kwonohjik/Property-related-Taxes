/**
 * 축 B(지분 분할) × 부담부증여 × 승계조합원 완공 아파트 — 지분 2 환산(K-5) 카드 필요경비 줄 · 취득가액 합계 = 승계 분기 값(계획서 remaining-4-measurements §F.5).
 * 시료는 `transfer.route.bg-axis-b-redev-share-method.anchor.test.ts` RM-1(시가 10억 · 채무 6억 · 60/40 · 지분 2 취득시 기준시가 5억)과 같다.
 * 종전: 카드 필요경비 줄이 「인가 후 분 — 자본적지출·양도비」(개산공제·단서 나목인데) · 단서 시 「취득가액 합계(세액에 쓰인 값)」 240,000,000(엔진 90,000,000).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { BundledAllocationCard } from "@/components/calc/results/BundledAllocationCard";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => "/calc/transfer-tax" }));
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
type V = "orig" | "succ";
const share2Redev = (v: V, r2: number): A =>
  v === "succ" ? { ...SHARE_COMMON(0), acquisitionDate: "2020-01-01", redevIsSuccessorMember: "yes" } : { ...SHARE_COMMON(SET * r2), acquisitionDate: "2017-01-01", standardPriceAtAcq: "400000000",
      redevManagementDisposalHousingPrice: "300000000", redevAcquisitionHousingPrice: "150000000" };
const redevB = (v: V, mode: A, debt: number, r1: number, own2: A = {}, own1: A = {}) => rosterForDeclaredCount(Object.assign(createDefaultTransferFormData(), BASE, { assetSplitMode: "fractional", contractTotalPrice: "1000000000",
  assets: [mk(1, { assetId: "p" }, COMMON, REDEV(v === "succ" ? 0 : SET * r1), v === "succ" ? SUCC : {}, mode, debtOf(debt), pct(r1), own1), mk(2, { assetId: "s" }, pct(1 - r1), share2Redev(v, 1 - r1), own2)] })) as TransferFormData;



afterEach(cleanup);
async function bundle(own2: A) {
  const f = redevB("succ", K4, 600_000_000, 0.6, { bgShareOwnAcquisition: true, bgAcquisitionMethod: "converted", standardPriceAtAcq: "500000000", ...own2 });
  expect(allIssues(f)).toEqual([]);
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(await captureBody(f)) }));
  expect(res.status).toBe(200);
  const d = ((await res.json()) as Loose).data;
  const el = render(<BundledAllocationCard apportionment={d.apportionment} aggregated={d.aggregated} transferBurdenedGiftBreakdown={d.transferBurdenedGiftBreakdown} formData={f} />).container;
  const s = (d.aggregated.properties as Loose[]).find((p) => p.propertyId === "s")!;
  return { el, s, d };
}
const amt = (el: Element | null) => el?.querySelectorAll("td")[1]?.textContent;

describe("AS-1 지분 2 K-5 · 칸 비움 — 개산공제 줄", () => {
  it("개산공제 3,600,000(5억 × 40% × 0.6 × 3%) = 엔진 · 「자본적지출·양도비」 줄 없음", async () => {
    const { el, s } = await bundle({});
    expect(amt(el.querySelector('[data-testid="bg-bundle-card-estimated-deduction"]'))).toBe("3,600,000");
    expect(s.necessaryExpense).toBe(3_600_000);
    expect(el.querySelectorAll('[data-testid="bg-redev-filing-expense-post"]')).toHaveLength(0);
    expect(amt(el.querySelector('[data-testid="bg-bundle-acquisition-total"]'))).toBe("240,000,000");
  });
});

describe("AS-2 지분 2 K-5 · 인가 후 필요경비 9억 — 단서(나목)", () => {
  it("필요경비 216,000,000 · 단서 설명 · 취득가액 합계 90,000,000(종전 240,000,000) = 엔진", async () => {
    const { el, s, d } = await bundle({ redevPostApprovalExpenses: "900000000" });
    const row = el.querySelector('[data-testid="bg-bundle-card-necessary-expense"]');
    expect(amt(row)).toBe("216,000,000");
    expect(row?.textContent).toContain("제97조 제2항 제2호 단서");
    expect(s.necessaryExpense).toBe(216_000_000);
    expect(s.acquisitionPrice).toBe(0);
    const engineAcq = (d.aggregated.properties as Loose[]).reduce((t, p) => t + p.acquisitionPrice, 0);
    expect(engineAcq).toBe(90_000_000);
    expect(amt(el.querySelector('[data-testid="bg-bundle-acquisition-total"]'))).toBe("90,000,000");
    expect(el.querySelectorAll('[data-testid="bg-redev-filing-expense-post"]')).toHaveLength(0);
  });
});
