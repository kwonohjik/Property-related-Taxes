/**
 * 승계조합원 신축주택(§166 밖) × 부담부증여 — 결과 명세 카드에 §166 문구를 쓰지 않는다(계획서 docs/00-pm/remaining-4-measurements.plan.md §J).
 * 종전: 단건 · 축 B 카드 모두 「종전 부동산 취득가(인가 전 분)」 · 「시행령 제166조 제1항 제1호에 따라 … 따로 계산」 · 「인가 전 분은 개산공제와 실제 필요경비 중 택일 — §166①1호」
 *   · 「인가 후 분 — 자본적지출·양도비」를 그렸다(값은 맞았다). 원조합원(§166 자산)은 종전 그대로다.
 * 시료는 `transfer.route.bg-axis-b-redev-share-method.anchor.test.ts`(시가 10억 · 채무 6억 · 승계 실지 2.5억)와 같다.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { BundledAllocationCard } from "@/components/calc/results/BundledAllocationCard";
import { SingleDetailCards } from "@/components/calc/results/transfer/SingleDetailCards";
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
async function call(f: TransferFormData) {
  expect(allIssues(f)).toEqual([]);
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(await captureBody(f)) }));
  expect(res.status).toBe(200);
  return ((await res.json()) as Loose).data;
}
const single = (...o: A[]) => rosterForDeclaredCount(Object.assign(createDefaultTransferFormData(), BASE, { contractTotalPrice: "1000000000", assets: [mk(1, COMMON, ...o, debtOf(600_000_000))] })) as TransferFormData;
const SEC166 = "제166조 제1항 제1호";
const amt = (el: Element | null) => el?.querySelectorAll("td")[1]?.textContent;
const K5: A = { ...K4, bgAcquisitionMethod: "converted" };

describe("SW-1 단건 승계 K-4 · 인가 후 필요경비 5천만", () => {
  it("§166 문구 없음 · 「건물 취득가」 · 신고서 필요경비 30,000,000 = 자본적지출·양도비 한 줄", async () => {
    const f = single(REDEV(0), SUCC, K4, { redevPostApprovalExpenses: "50000000" });
    const d = await call(f);
    const { container } = render(<SingleDetailCards result={d.result} formData={f} asset={f.assets[0]} />);
    const card = container.querySelector('[data-testid="bg-redev-filing-acquisition"]')!.closest("table")!;
    expect(card.textContent).not.toContain(SEC166);
    expect(card.textContent).not.toContain("종전 부동산");
    expect(card.textContent).toContain("제166조 대상이 아닙니다");
    const exp = container.querySelector('[data-testid="bg-redev-filing-expense"]');
    expect(amt(exp)).toBe("30,000,000");
    expect(exp?.textContent).toContain("자본적지출·양도비");
    expect(container.querySelectorAll('[data-testid^="bg-redev-filing-expense-"]')).toHaveLength(0);
  });
  it("K-5 단건도 §166 문구 없음(필요경비 줄은 승계 줄 · #3204)", async () => {
    const f = single(REDEV(0), SUCC, K5);
    const d = await call(f);
    const { container } = render(<SingleDetailCards result={d.result} formData={f} asset={f.assets[0]} />);
    expect(container.querySelector('[data-testid="bg-redev-filing-acquisition"]')!.closest("table")!.textContent).not.toContain(SEC166);
  });
});

describe("SW-2 축 B 승계 두 지분(K-4 · K-5)", () => {
  it("카드 · 합계 줄에 §166 · 「종전 부동산」 · 「원조합원 지분은 인가 전 분」 없음 · 값 그대로", async () => {
    const f = redevB("succ", K4, 600_000_000, 0.6, { bgShareOwnAcquisition: true, bgAcquisitionMethod: "converted", standardPriceAtAcq: "500000000" });
    const d = await call(f);
    const el = render(<BundledAllocationCard apportionment={d.apportionment} aggregated={d.aggregated} transferBurdenedGiftBreakdown={d.transferBurdenedGiftBreakdown} formData={f} />).container;
    const table = el.querySelector('[data-testid="bg-bundle-acquisition-total"]')!.closest("table")!;
    expect(table.textContent).not.toContain(SEC166);
    expect(table.textContent).not.toContain("종전 부동산");
    expect(table.textContent).not.toContain("원조합원 지분은 인가 전 분");
    expect(amt(el.querySelector('[data-testid="bg-bundle-acquisition-total"]'))).toBe("240,000,000");
  });
});

describe("SW-3 원조합원은 종전 문구 그대로(대조)", () => {
  it("단건 원조합원 K-4 — §166 문구 · 「종전 부동산」 유지", async () => {
    const f = single(REDEV(92_781_500), K4);
    const d = await call(f);
    const { container } = render(<SingleDetailCards result={d.result} formData={f} asset={f.assets[0]} />);
    const card = container.querySelector('[data-testid="bg-redev-filing-acquisition"]')!.closest("table")!;
    expect(card.textContent).toContain(SEC166);
    expect(card.textContent).toContain("종전 부동산");
  });
});
