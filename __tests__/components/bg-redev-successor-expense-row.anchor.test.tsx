/**
 * 승계조합원 완공 아파트 × 부담부증여 × 환산(K-5)·기준시가 — 부담부증여 카드 필요경비 줄 = 재개발 승계 분기가 고른 값(계획서 remaining-4-measurements §F.4).
 * 종전: 카드는 §159 명세의 택일(재개발 전용 칸 인가 후 필요경비를 모른다)을 그려, 단서 나목 채택 시 「개산공제 7,200,000」을 적고
 * 재개발 카드는 필요경비 360,000,000을 적었다. 시료는 `transfer.route.redev-successor-bg-k5-estimated.anchor.test.ts`와 같다.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
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
const COMMON: A = { addressJibun: "서울 강남구 테스트동 1-1", transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgLendingDepositTotal: "0" };
const REDEV = (set: number): A => ({ assetKind: "redevelopment_apt", acquisitionCause: "purchase", acquisitionDate: "2015-01-01", standardPriceAtTransfer: "800000000", standardPriceAtAcq: "400000000",
  redevSubject: "apt", redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2018-06-01", redevRightsValue: "219218500", redevSettlementDirection: "pay", redevSettlementAmount: String(set),
  redevCompletionDate: "2022-09-01", redevPreApprovalExpenses: "0", redevOriginalAssetType: "housing", redevActualAcquisitionPrice: "100000000", bgActualAcquisitionTotal: "250000000", useEstimatedAcquisition: false,
  redevManagementDisposalHousingPrice: "300000000", redevAcquisitionHousingPrice: "150000000" });
const SUCC: A = { redevIsSuccessorMember: "yes", acquisitionDate: "2019-03-01", redevSettlementAmount: "0" };
const K4: A = { bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000", bgAcquisitionMethod: "actual" };
const K5: A = { ...K4, bgAcquisitionMethod: "converted" };
const STD: A = { bgValuationMode: "sangjeungbeop_standard", bgMarketValueAtTransfer: "", bgAcquisitionMethod: "" };



import { BurdenedGiftDetailCard } from "@/components/calc/results/transfer/BurdenedGiftDetailCard";
import { SingleDetailCards } from "@/components/calc/results/transfer/SingleDetailCards";
import { PropertyBreakdownAccordion } from "@/components/calc/results/MultiTransferPropertyBreakdown";

afterEach(cleanup);
async function result(f: TransferFormData) {
  expect(allIssues(f)).toEqual([]);
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(await captureBody(f)) }));
  expect(res.status).toBe(200);
  return ((await res.json()) as Loose).data.result;
}
async function card(f: TransferFormData) {
  const r = await result(f);
  render(<BurdenedGiftDetailCard breakdown={r.transferBurdenedGiftBreakdown} propertyType="redevelopment_apt" redevSuccessorExpense={r.redevelopmentDetail?.successorMemberDetail?.burdenedGiftExpense} />);
  return r;
}
const single = (...o: A[]) => rosterForDeclaredCount(Object.assign(createDefaultTransferFormData(), BASE, { contractTotalPrice: "1000000000", assets: [mk(1, COMMON, ...o, debtOf(600_000_000))] })) as TransferFormData;
const S = (...o: A[]) => single(REDEV(0), SUCC, ...o);
const amountOf = (id: string) => screen.getByTestId(id).querySelectorAll("td")[1].textContent;

describe("SE-1 본문(개산공제) — 카드 = 엔진", () => {
  it("K-5 · 칸 비움: 개산공제 7,200,000 = 재개발 필요경비", async () => {
    const r = await card(S(K5));
    expect(amountOf("bg-estimated-deduction")).toBe("7,200,000");
    expect(r.redevelopmentDetail.postApprovalExistingHouse.expenses).toBe(7_200_000);
  });
  it("기준시가 · 인가 후 필요경비 5천만: 실제 필요경비 줄 없이 개산공제 9,000,000", async () => {
    const r = await card(S(STD, { redevPostApprovalExpenses: "50000000" }));
    expect(amountOf("bg-estimated-deduction")).toBe("9,000,000");
    expect(screen.queryByTestId("bg-necessary-expense")).toBeNull();
    expect(r.redevelopmentDetail.postApprovalExistingHouse.expenses).toBe(9_000_000);
  });
});

describe("SE-2 단서(나목) — 카드 = 엔진", () => {
  it("K-5 · 인가 후 필요경비 6억: 카드 필요경비 360,000,000(종전 개산공제 7,200,000)", async () => {
    const r = await card(S(K5, { redevPostApprovalExpenses: "600000000" }));
    expect(amountOf("bg-necessary-expense")).toBe("360,000,000");
    expect(screen.getByTestId("bg-necessary-expense").textContent).toContain("제97조 제2항 제2호 단서");
    expect(screen.queryByTestId("bg-estimated-deduction")).toBeNull();
    expect(r.redevelopmentDetail.postApprovalExistingHouse.expenses).toBe(360_000_000);
  });
});

describe("SE-3 양도비만 큰 경우 — 재개발 나목도 양도비를 담아 §159 명세와 같은 쪽(단서)을 고른다", () => {
  it("양도비 6억: 카드 필요경비 360,000,000 = 재개발 필요경비 · 양도차익 240,000,000", async () => {
    const r = await card(S(K5, { transferExpense: "600000000" }));
    expect(r.transferBurdenedGiftBreakdown.necessaryExpenseSwap?.chosen).toBe("direct");
    expect(amountOf("bg-necessary-expense")).toBe("360,000,000");
    expect(r.redevelopmentDetail.postApprovalExistingHouse.expenses).toBe(360_000_000);
    expect(r.transferGain).toBe(240_000_000);
  });
});

describe("SE-4 단건 결과 화면(`SingleDetailCards`) — 신고서 필요경비 줄 대신 승계 필요경비 줄(값 = 엔진 · 이름 = 개산공제·단서)", () => {
  it("K-5 · 칸 비움: 개산공제 7,200,000 · 「자본적지출·양도비」 줄 없음", async () => {
    const f = S(K5);
    const r = await result(f);
    render(<SingleDetailCards result={r} formData={f} asset={f.assets[0]} />);
    expect(amountOf("bg-estimated-deduction")).toBe("7,200,000");
    expect(screen.queryByTestId("bg-redev-filing-expense")).toBeNull();
    expect(screen.queryByTestId("bg-redev-filing-expense-post")).toBeNull();
  });
  it("K-5 · 인가 후 필요경비 6억: 필요경비 360,000,000 · 단서 설명", async () => {
    const f = S(K5, { redevPostApprovalExpenses: "600000000" });
    const r = await result(f);
    render(<SingleDetailCards result={r} formData={f} asset={f.assets[0]} />);
    expect(amountOf("bg-necessary-expense")).toBe("360,000,000");
    expect(screen.getByTestId("bg-necessary-expense").textContent).toContain("제97조 제2항 제2호 단서");
  });
  it("실지(K-4) · 인가 후 필요경비 5천만: 종전 신고서 필요경비 줄 30,000,000 그대로", async () => {
    const f = S(K4, { redevPostApprovalExpenses: "50000000" });
    const r = await result(f);
    render(<SingleDetailCards result={r} formData={f} asset={f.assets[0]} />);
    expect(amountOf("bg-redev-filing-expense")).toBe("30,000,000");
    expect(screen.queryByTestId("bg-estimated-deduction")).toBeNull();
  });
});

describe("SE-5 다건 자산별 아코디언 배선 — 신고서 필요경비 줄이 없어 §159 명세 택일(개산공제 7,200,000)을 그리던 자리", () => {
  it("K-5 · 인가 후 필요경비 6억: 필요경비 360,000,000", async () => {
    const f = S(K5, { redevPostApprovalExpenses: "600000000" });
    const r = await result(f);
    const breakdown = { propertyId: "p1", propertyLabel: "p1", steps: [], transferBurdenedGiftBreakdown: r.transferBurdenedGiftBreakdown, redevelopmentDetail: r.redevelopmentDetail };
    const { container } = render(<PropertyBreakdownAccordion breakdown={breakdown as never} property={{ propertyId: "p1", form: f } as never} />);
    fireEvent.click(container.querySelector(".cursor-pointer")!);
    expect(amountOf("bg-necessary-expense")).toBe("360,000,000");
    expect(screen.queryByTestId("bg-estimated-deduction")).toBeNull();
  });
});
