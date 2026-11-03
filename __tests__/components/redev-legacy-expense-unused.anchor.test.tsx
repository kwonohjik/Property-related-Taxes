/**
 * anchor — 재개발·재건축(§166) 자산의 옛 필요경비 칸(`directExpenses`) ⑤ 안내 · ⑧ 차단
 * (계획서 `docs/02-design/features/redev-transfer-expense-residual.plan.md` Q-1 a).
 *
 * §166 산식은 옛 칸을 읽지 않는다 — 아래 9개 경로는 7백만을 넣어도 0 입력과 세액이 같았다(계획서 V-5 · §4 실측).
 * ⑤ 안내와 ⑧ 차단은 같은 술어·같은 문장을 읽는다(`redev-legacy-expense-unused.ts`).
 * 대조군: 승계 입주권과 토지는 옛 칸이 세액에 반영되므로 막지 않는다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { AssetSectionExpense } from "@/components/calc/transfer/asset-sections/AssetSectionExpense";
import { redevLegacyExpenseUnusedMessage } from "@/lib/calc/redev-legacy-expense-unused";
import { redevLegacyExpenseUnused } from "@/lib/calc/redev-legacy-expense-unused";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

type Over = Record<string, unknown>;
const BASE = {
  transferDate: "2024-06-01", filingDate: "2024-08-31", householdHousingCount: "2", isOneHousehold: false,
  householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, bundledSaleMode: "actual",
};
const form = (assets: Over[], contract: string, over: Over = {}) =>
  Object.assign(createDefaultTransferFormData(), BASE, { contractTotalPrice: contract, totalTransferExpense: "", assets, ...over }) as TransferFormData;
const redev = (i: number, kind: string, subject: string, o: Over = {}) => ({
  ...makeDefaultAsset(i), addressJibun: `서울 강남구 테스트동 ${i}-1`, assetKind: kind, acquisitionCause: "purchase", acquisitionDate: "2010-01-01",
  redevSubject: subject, redevOriginalAssetType: "housing", redevApprovalLawBasis: "urban_renovation_art_74", redevExemptionEligibleAtApproval: "no",
  redevApprovalDate: "2018-05-01", redevSettlementDirection: "pay", redevSettlementSaleDate: "2023-05-01",
  redevRightsValue: "500000000", redevSettlementAmount: "80000000", redevPreApprovalExpenses: "0",
  redevActualAcquisitionPrice: "300000000", fixedAcquisitionPrice: "300000000", useEstimatedAcquisition: false,
  standardPriceAtTransfer: "800000000", standardPriceAtAcq: "300000000", actualSalePrice: "700000000", ...o,
});
const apt = (i: number, o: Over = {}) => redev(i, "redevelopment_apt", "apt", o);
const right = (i: number, o: Over = {}) => redev(i, "right_to_move_in", "right", o);
const land = (i: number, o: Over = {}) => ({
  ...makeDefaultAsset(i), addressJibun: `서울 강남구 테스트동 ${i}-2`, assetKind: "land", landNature: "general", acquisitionCause: "purchase",
  acquisitionDate: "2015-02-10", actualSalePrice: "300000000", fixedAcquisitionPrice: "100000000", standardPriceAtTransfer: "300000000", ...o,
});
const RECV = { redevSettlementDirection: "receive" };
const EST = {
  useEstimatedAcquisition: true, redevAcquisitionMethod: "estimated", redevAcquisitionStdPrice: "200000000", redevManagementDisposalStdPrice: "400000000",
  redevManagementDisposalHousingPrice: "400000000", redevAcquisitionHousingPrice: "200000000", fixedAcquisitionPrice: "", redevActualAcquisitionPrice: "",
};
const SUCC = { redevIsSuccessorMember: "yes", redevCompletionDate: "2022-12-01", acquisitionDate: "2019-03-01", redevSettlementAmount: "0" };
const RO = {
  redevSettlementDirection: "receive", redevReceiveOnlyMode: "yes", actualSalePrice: "114000000", redevSettlementAmount: "114000000",
  redevSettlementSaleDate: "2024-06-01", redevActualAcquisitionPrice: "200000000", fixedAcquisitionPrice: "200000000",
};
const CARRYOVER = {
  giftRegistryDate: "2023-06-01", donorAcquisitionDate: "2012-01-01", donorAcquisitionCause: "purchase", donorAcquisitionPrice: "100000000",
  useEstimatedAcquisition: false, estimationMode: "", giftTaxAmount: "4000000", donorCapitalExpenditure: "0", giftDateValuation: "300000000",
  exclusionDeclared: {}, donorHouseholdHoldingStartDate: "2012-01-01",
};
const carryRight = (o: Over) =>
  right(1, {
    redevApprovalDate: "2024-01-10", redevRightsValue: "900000000", redevSettlementAmount: "200000000", acquisitionCause: "carryover_gift",
    acquisitionDate: "2023-06-01", acquisitionPrice: "100000000", carryover: CARRYOVER, fixedAcquisitionPrice: "", redevActualAcquisitionPrice: "", ...o,
  });
const bgRight = (o: Over) =>
  right(1, {
    assetId: "p", transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_standard", bgMortgageDebtAmount: "600,000,000", bgDonorRelation: "lineal_descendant",
    bgRightMemberRightsValue: "1,200,000,000", bgRightPaidInstallments: "200,000,000", bgRightPremium: "100,000,000", bgActualAcquisitionTotal: "300,000,000",
    redevApprovalDate: "2018-06-01", acquisitionDate: "2009-07-01", redevRightsValue: "900,000,000", redevSettlementAmount: "100,000,000",
    standardPriceAtAcq: "", standardPriceAtTransfer: "", ...o,
  });
const CARRY_DATES = { transferDate: "2026-02-16", filingDate: "2026-04-30" };

/** [이름, 옛 칸 값을 넣을 폼] — 실측 세액(0 입력 = 옛 칸 7백만)은 계획서 §1 V-5 · §4 표 */
const BLOCKED: [string, (o: Over) => TransferFormData][] = [
  ["완공 APT 청산금 납부", (o) => form([apt(1, o)], "700000000")],
  ["완공 APT 청산금 수령", (o) => form([apt(1, { ...RECV, ...o })], "700000000")],
  ["완공 APT 환산", (o) => form([apt(1, { ...EST, ...o })], "700000000")],
  ["승계조합원 완공 APT", (o) => form([apt(1, { ...SUCC, ...o })], "700000000")],
  ["청산금 수령 단독 신고", (o) => form([apt(1, { ...RO, ...o })], "114000000")],
  ["입주권 청산금 납부", (o) => form([right(1, o)], "700000000")],
  ["입주권 청산금 수령", (o) => form([right(1, { ...RECV, ...o })], "700000000")],
  ["이월과세 입주권", (o) => form([carryRight(o)], "700000000", CARRY_DATES)],
  ["부담부증여 입주권", (o) => form([bgRight(o)], "1500000000")],
  ["함께 양도 둘째 자산 완공 APT", (o) => form([land(1), apt(2, o)], "1000000000")],
  ["자본적 지출액이 함께 있는 완공 APT", (o) => form([apt(1, { capitalExpenditure: "1000000", ...o })], "700000000")],
];
const CONTROL: [string, (o: Over) => TransferFormData][] = [
  ["승계 입주권", (o) => form([right(1, { isSuccessorRightToMoveIn: true, redevIsSuccessorMember: "yes", ...o })], "700000000")],
  ["토지", (o) => form([land(1, { actualSalePrice: "700000000", standardPriceAtTransfer: "700000000", ...o })], "700000000")],
];

const issues = (f: TransferFormData) => [0, 1, 2, 3, 4, 5].flatMap((s) => collectStepIssues(s, f));
const lastAsset = (f: TransferFormData) => f.assets[f.assets.length - 1];
const renderExpense = (a: AssetForm) =>
  render(<AssetSectionExpense asset={a} onChange={() => {}} totalTransferExpense="" isSingleAsset isNonPrimaryAsset={false} />);

describe("RL-1 ⑧ — §166 자산은 옛 칸 값이 있으면 막고, 비우면 통과한다", () => {
  it.each(BLOCKED)("%s", (_n, mk) => {
    const withLegacy = mk({ directExpenses: "7000000" });
    expect(redevLegacyExpenseUnused(lastAsset(withLegacy))).toBe(true);
    const hit = issues(withLegacy).filter((i) => i.field === "directExpenses");
    expect(hit).toHaveLength(1);
    expect(hit[0].message).toContain(redevLegacyExpenseUnusedMessage(lastAsset(withLegacy)));
    expect(issues(mk({}))).toEqual([]);
  });
});

describe("RL-2 대조군 — 옛 칸이 세액에 반영되는 자산은 막지 않는다", () => {
  it.each(CONTROL)("%s", (_n, mk) => {
    const f = mk({ directExpenses: "7000000" });
    expect(redevLegacyExpenseUnused(lastAsset(f))).toBe(false);
    expect(issues(f).filter((i) => i.field === "directExpenses")).toEqual([]);
  });
});

describe("RL-3 ⑤ — 안내는 차단 문장과 같고 옛 칸 위에 뜬다", () => {
  it("완공 APT — 안내 + 칸", () => {
    const a = apt(1, { directExpenses: "7000000" }) as AssetForm;
    renderExpense(a);
    expect(screen.getByTestId("redev-legacy-expense-unused-notice").textContent).toBe(redevLegacyExpenseUnusedMessage(a));
    expect(document.querySelector('[data-field="directExpenses"]')).not.toBeNull();
  });

  it("자본적 지출액·양도비가 있어도 칸이 보인다 — ⑧이 지목하는 칸을 숨기지 않는다", () => {
    renderExpense(apt(1, { directExpenses: "7000000", capitalExpenditure: "1000000", transferExpense: "2000000" }) as AssetForm);
    expect(screen.getByTestId("redev-legacy-expense-unused-notice")).not.toBeNull();
    expect(document.querySelector('[data-field="directExpenses"]')).not.toBeNull();
  });

  it("옛 칸이 0이면 칸도 안내도 없다", () => {
    renderExpense(apt(1, { directExpenses: "0" }) as AssetForm);
    expect(screen.queryByTestId("redev-legacy-expense-unused-notice")).toBeNull();
    expect(document.querySelector('[data-field="directExpenses"]')).toBeNull();
  });

  it("승계 입주권은 안내가 없다(옛 칸이 반영된다)", () => {
    renderExpense(right(1, { isSuccessorRightToMoveIn: true, redevIsSuccessorMember: "yes", directExpenses: "7000000" }) as AssetForm);
    expect(screen.queryByTestId("redev-legacy-expense-unused-notice")).toBeNull();
    expect(document.querySelector('[data-field="directExpenses"]')).not.toBeNull();
  });
});
