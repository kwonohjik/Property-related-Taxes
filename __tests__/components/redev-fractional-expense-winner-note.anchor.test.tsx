/**
 * anchor — 재개발 완공 아파트 부담부증여 × 시가 모드 × 실지취득가액(K-4) × 지분 보유: 「인가전 분 필요경비」 칸 안내 (V-S1g Q-2 b).
 * 계획서 `docs/00-pm/bg-redev-fractional-collateral-win.plan.md` §3.4 — 지분 자산은 증여재산 평가의 승자(보충 ↔ 담보·임대)를 축 없이 알 수 없어 칸을 숨기지 못한다.
 * 보충 승이면 실비를 공제하고(−6,000,000 실측) 담보·임대 승이면 개산공제라 쓰이지 않는다 — 칸을 두고 어느 쪽이든 참인 문장을 붙인다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { RedevelopmentBlock } from "@/components/calc/transfer/RedevelopmentBlock";
import { redevPreApprovalExpensesWinnerDependent, REDEV_PRE_APPROVAL_WINNER_DEPENDENT_NOTE } from "@/lib/calc/redev-pre-approval-acq-mode";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);
const asset = (over: Record<string, unknown>) => ({ ...makeDefaultAsset(1), transferType: "burdened_gift", assetKind: "redevelopment_apt", redevSubject: "apt", acquisitionDate: "2015-01-01", acquisitionCause: "purchase",
  redevOriginalAssetType: "housing", redevSettlementDirection: "pay", redevApprovalDate: "2018-06-01", redevCompletionDate: "2022-09-01",
  bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000", bgAcquisitionMethod: "actual", bgMortgageDebtAmount: "300000000", bgMortgageSetAmount: "300000000", ...over }) as AssetForm;
const HALF = { ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "yes" };
const NOTE = REDEV_PRE_APPROVAL_WINNER_DEPENDENT_NOTE.slice(0, 30);
const view = (a: AssetForm) => {
  const r = render(<RedevelopmentBlock asset={a} onChange={() => {}} isOneHouseSingle={false} judgmentLoaded={false} transferDate="2026-02-16" />);
  return { text: r.container.textContent ?? "", hasExpenseField: !!r.container.querySelector('[data-field="redevPreApprovalExpenses"]') };
};

describe("재개발 필요경비 칸 — 승자에 따라 쓰이는지가 갈리는 경우의 안내", () => {
  it("지분 50% · 시가 · K-4: 칸이 있고 안내가 붙는다", () => {
    const a = asset(HALF);
    expect(redevPreApprovalExpensesWinnerDependent(a)).toBe(true);
    const v = view(a);
    expect(v.hasExpenseField).toBe(true);
    expect(v.text).toContain(NOTE);
  });
  it.each([
    ["단독 100%(승자를 아는 경우 — 칸이 이미 맞게 숨는다·보인다)", {}],
    ["기준시가 모드(칸 숨김)", { ...HALF, bgValuationMode: "sangjeungbeop_standard", bgMarketValueAtTransfer: "" }],
    ["환산(K-5)(칸 숨김)", { ...HALF, bgAcquisitionMethod: "converted" }],
    ["승계조합원(실비를 쓴다)", { ...HALF, redevIsSuccessorMember: "yes" }],
  ] as const)("%s: 안내 없음", (_n, over) => {
    const a = asset(over);
    expect(redevPreApprovalExpensesWinnerDependent(a)).toBe(false);
    expect(view(a).text).not.toContain(NOTE);
  });
});
