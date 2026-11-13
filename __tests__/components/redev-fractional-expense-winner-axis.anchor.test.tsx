/**
 * anchor — 재개발 완공 아파트 부담부증여 × 시가 모드 × 지분 보유: 「인가전 분 필요경비」 칸이 **축으로 확정한 승자**를 따른다 (K-5 전면 개방 Q-3 a).
 * 계획서 `docs/00-pm/bg-redev-fractional-k5-full-open.plan.md` §4 Q-3 · 선행 `bg-redev-fractional-collateral-win.plan.md` §3.4.
 *
 * 종전(V-S1g Q-2 b)에는 축이 없어 지분 자산의 승자를 몰라 칸을 늘 두고 «담보가 이기면 쓰이지 않는다» 안내를 붙였다.
 * 지금은 재개발 블록이 축(`isFractionalSplit`)을 받아 단독 100%와 같은 규칙으로 칸을 숨기거나 보인다 —
 * 담보 승(개산공제 — 0원/2천만 원 값 동일 실측)은 칸 대신 개산공제 안내, 보충 승(실비 −6,000,000 실측)은 칸.
 * 축 B 40% 카드(물건 전체 채무 6억 · 시가 10억)는 축 B로는 보충 승이고 축 A로 읽으면 담보 승이다 — 축이 결과를 바꾸는 칸.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { RedevelopmentBlock } from "@/components/calc/transfer/RedevelopmentBlock";
import { redevPreApprovalExpensesUnused } from "@/lib/calc/redev-pre-approval-acq-mode";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);
const asset = (over: Record<string, unknown>) => ({ ...makeDefaultAsset(1), transferType: "burdened_gift", assetKind: "redevelopment_apt", redevSubject: "apt", acquisitionDate: "2015-01-01", acquisitionCause: "purchase",
  redevOriginalAssetType: "housing", redevSettlementDirection: "pay", redevApprovalDate: "2018-06-01", redevCompletionDate: "2022-09-01",
  bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000", standardPriceAtTransfer: "800000000", standardPriceAtAcq: "400000000",
  bgAcquisitionMethod: "actual", bgMortgageDebtAmount: "300000000", bgMortgageSetAmount: "300000000", ...over }) as AssetForm;
const HALF = { ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "yes" };
const debt = (d: string) => ({ bgMortgageDebtAmount: d, bgMortgageSetAmount: d });
const view = (a: AssetForm, isFractionalSplit: boolean) => {
  const r = render(<RedevelopmentBlock asset={a} onChange={() => {}} isOneHouseSingle={false} judgmentLoaded={false} transferDate="2026-02-16" isFractionalSplit={isFractionalSplit} />);
  return {
    field: !!r.container.querySelector('[data-field="redevPreApprovalExpenses"]'),
    lump: !!r.container.querySelector('[data-testid="redev-pre-expense-lump-notice"]'),
    text: r.container.textContent ?? "",
  };
};

describe("지분 · 시가 모드 — 칸 표시가 축으로 확정한 승자를 따른다", () => {
  it.each([
    ["축 A 50% · K-4 · 담보 승(채무 7억 > 지분 시가 5억)", HALF, debt("700000000"), false, true],
    ["축 A 50% · K-4 · 보충 승(채무 3억)", HALF, debt("300000000"), false, false],
    ["축 B 60% · K-4 · 담보 승(물건 전체 채무 14억)", { ownershipNumerator: "60", ownershipDenominator: "100" }, debt("1400000000"), true, true],
    ["축 B 40% · K-4 · 보충 승(물건 전체 채무 6억 < 시가 10억 — 축 A로 읽으면 담보 승)", { ownershipNumerator: "40", ownershipDenominator: "100" }, debt("600000000"), true, false],
    ["축 A 50% · K-5 · 담보 승 — 개산공제(환산 아님, 취득시 기준시가)", { ...HALF, bgAcquisitionMethod: "converted" }, debt("700000000"), false, true],
  ] as const)("%s", (_n, own, d, axisB, unused) => {
    const a = asset({ ...own, ...d });
    expect(redevPreApprovalExpensesUnused(a, axisB)).toBe(unused);
    const v = view(a, axisB);
    expect(v.field).toBe(!unused);
    expect(v.lump).toBe(unused);
    // 종전 V-S1g Q-2 b 안내 문장은 없다
    expect(v.text).not.toContain("담보평가(「상속세 및 증여세법」 제66조)나 임대평가가 증여재산 평가액으로 정해지면");
  });
  it("축 B 40% 보충 승을 축 A로 읽으면 담보 승 — 축이 결과를 바꾼다(축을 넘기지 않으면 틀리는 칸)", () => {
    const a = asset({ ownershipNumerator: "40", ownershipDenominator: "100", ...debt("600000000") });
    expect(redevPreApprovalExpensesUnused(a, false)).toBe(true);
    expect(redevPreApprovalExpensesUnused(a, true)).toBe(false);
  });
});
