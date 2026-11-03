/**
 * anchor — 재개발 옛 칸(`directExpenses`) ⑤ 안내 · ⑧ 차단 문구는 인가 전 분 필요경비 칸이 있는가로 갈린다
 * (계획서 `docs/02-design/features/redev-legacy-expense-message-lump.plan.md` Q-1 a · Q-2 a).
 *
 * 종전 문구는 늘 「원조합원이 인가 전에 쓴 비용은 「인가전 분 필요경비」」로 보냈다. 그 칸은 개산공제 모드(환산 · 부담부증여 기준시가·K-5)에서
 * ③에 없고, 같은 ④의 보라 안내는 「인가 전 비용은 넣지 마세요」(단독 신고 환산은 「자본적 지출액에」)라서 두 안내가 반대였다.
 * 실측(계획서 V-3): 안내를 따라 인가 전 비용을 「자본적 지출액」에 넣으면 공제된다(완공 APT 환산 7백만 → 결정세액 −2,171,293).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { AssetSectionExpense } from "@/components/calc/transfer/asset-sections/AssetSectionExpense";
import { RedevelopmentBlock } from "@/components/calc/transfer/RedevelopmentBlock";
import { CompanionAssetCard } from "@/components/calc/transfer/CompanionAssetCard";
import { redevLegacyExpenseUnusedMessage } from "@/lib/calc/redev-legacy-expense-unused";
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
const land = (i: number) => ({
  ...makeDefaultAsset(i), addressJibun: `서울 강남구 테스트동 ${i}-2`, assetKind: "land", landNature: "general", acquisitionCause: "purchase",
  acquisitionDate: "2015-02-10", actualSalePrice: "300000000", fixedAcquisitionPrice: "100000000", standardPriceAtTransfer: "300000000",
});
const EST = {
  useEstimatedAcquisition: true, redevAcquisitionMethod: "estimated", redevAcquisitionStdPrice: "200000000", redevManagementDisposalStdPrice: "400000000",
  redevManagementDisposalHousingPrice: "400000000", redevAcquisitionHousingPrice: "200000000", fixedAcquisitionPrice: "", redevActualAcquisitionPrice: "",
};
const RO = { redevSettlementDirection: "receive", redevReceiveOnlyMode: "yes" };
const roEst = (o: Over) =>
  apt(1, {
    ...EST, ...RO, actualSalePrice: "20000000", redevRightsValue: "120000000", redevSettlementAmount: "20000000", redevSettlementSaleDate: "2024-06-01",
    redevAcquisitionHousingPrice: "60000000", redevManagementDisposalHousingPrice: "120000000", ...o,
  });
const roAct = (o: Over) =>
  apt(1, {
    ...RO, actualSalePrice: "114000000", redevSettlementAmount: "114000000", redevSettlementSaleDate: "2024-06-01",
    redevActualAcquisitionPrice: "200000000", fixedAcquisitionPrice: "200000000", ...o,
  });
const CAR = {
  giftRegistryDate: "2023-06-01", donorAcquisitionDate: "2012-01-01", donorAcquisitionCause: "purchase", donorAcquisitionPrice: "100000000",
  useEstimatedAcquisition: false, estimationMode: "", giftTaxAmount: "4000000", donorCapitalExpenditure: "0", giftDateValuation: "300000000",
  exclusionDeclared: {}, donorHouseholdHoldingStartDate: "2012-01-01",
};
const carryApt = (o: Over) =>
  apt(1, {
    redevApprovalDate: "2024-01-10", redevRightsValue: "900000000", redevSettlementAmount: "200000000", redevCompletionDate: "2025-09-01",
    redevManagementDisposalHousingPrice: "600000000", redevAcquisitionHousingPrice: "250000000", acquisitionCause: "carryover_gift",
    acquisitionDate: "2023-06-01", acquisitionPrice: "100000000", carryover: CAR, fixedAcquisitionPrice: "", redevActualAcquisitionPrice: "", ...o,
  });
const CARRY_EST = { carryover: { ...CAR, useEstimatedAcquisition: true, donorAcquisitionPrice: "" }, redevAcquisitionStdPrice: "200000000", redevManagementDisposalStdPrice: "400000000" };
const bgApt = (o: Over) =>
  apt(1, {
    acquisitionDate: "2009-03-01", transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1,500,000,000",
    bgMortgageDebtAmount: "600,000,000", bgDonorRelation: "lineal_descendant", bgAcquisitionMethod: "converted", bgActualAcquisitionTotal: "300,000,000",
    standardPriceAtTransfer: "1,500,000,000", standardPriceAtAcq: "", actualSalePrice: "", redevApprovalDate: "2018-06-01", redevRightsValue: "500,000,000",
    redevSettlementAmount: "200,000,000", redevCompletionDate: "2021-09-01", redevManagementDisposalHousingPrice: "400,000,000",
    redevAcquisitionHousingPrice: "300,000,000", redevActualAcquisitionPrice: "", fixedAcquisitionPrice: "", ...o,
  });
const BG_DATES = { transferDate: "2024-03-01", filingDate: "2024-05-31" };
const CARRY_DATES = { transferDate: "2026-02-16", filingDate: "2026-04-30" };

const HEAD = "「직접 귀속 필요경비 — 이전 입력 형식」은 재개발·재건축 완공 아파트와 조합원입주권에서는 계산에 쓰이지 않습니다(";
const FIELD = "금액을 「자본적 지출액」과 「양도비」 칸에 나눠 입력하고(원조합원이 관리처분계획 인가 전에 쓴 비용은 「인가전 분 필요경비」) 이 칸은 비우세요.";
const LUMP =
  "자본적 지출 중 관리처분계획 인가 후에 쓴 금액은 「자본적 지출액」 칸에, 양도비는 「양도비」 칸에 나눠 입력하고 이 칸은 비우세요. " +
  "인가 전에 쓴 비용은 개산공제로 대신하므로 따로 입력하지 않습니다.";
const RECEIVE_ONLY = "인가 전에 쓴 비용을 포함해 자본적 지출은 「자본적 지출액」 칸에, 양도비는 「양도비」 칸에 나눠 입력하고 이 칸은 비우세요.";
const RECEIVE_ONLY_BG = "필요경비는 개산공제로 계산하므로 이 칸은 비우세요.";

/** [이름, 폼(옛 칸 7백만 포함), ③에 인가전 분 칸이 있는가, 문구 뒷 문장] — 계획서 §1 V-1 표의 경로 */
const CASES: [string, TransferFormData, boolean, string][] = [
  ["완공 APT 실가", form([apt(1, { directExpenses: "7000000" })], "700000000"), true, FIELD],
  ["부담부증여 완공 APT 시가·실지(K-4)", form([bgApt({ bgAcquisitionMethod: "actual", directExpenses: "7000000" })], "1500000000", BG_DATES), true, FIELD],
  ["단독 신고 실가", form([roAct({ directExpenses: "7000000" })], "114000000"), true, FIELD],
  ["이월과세 완공 APT 증여자 기준", form([carryApt({ directExpenses: "7000000" })], "700000000", CARRY_DATES), true, FIELD],
  ["완공 APT 환산", form([apt(1, { ...EST, directExpenses: "7000000" })], "700000000"), false, LUMP],
  ["원조합원 입주권 환산", form([right(1, { ...EST, directExpenses: "7000000" })], "700000000"), false, LUMP],
  ["부담부증여 완공 APT 시가·환산(K-5)", form([bgApt({ directExpenses: "7000000" })], "1500000000", BG_DATES), false, LUMP],
  ["부담부증여 완공 APT 기준시가", form([bgApt({ bgValuationMode: "sangjeungbeop_standard", standardPriceAtAcq: "300,000,000", directExpenses: "7000000" })], "1500000000", BG_DATES), false, LUMP],
  ["함께 양도 둘째 자산 완공 APT 환산", form([land(1), apt(2, { ...EST, directExpenses: "7000000" })], "1000000000"), false, LUMP],
  ["단독 신고 환산", form([roEst({ directExpenses: "7000000" })], "20000000"), false, RECEIVE_ONLY],
  [
    "단독 신고 × 부담부증여 K-5",
    form([bgApt({ ...RO, redevSettlementAmount: "20,000,000", redevSettlementSaleDate: "2024-03-01", bgMarketValueAtTransfer: "20,000,000", bgMortgageDebtAmount: "8,000,000", standardPriceAtTransfer: "20,000,000", directExpenses: "7000000" })], "20000000", BG_DATES),
    false,
    RECEIVE_ONLY_BG,
  ],
  // Q-2 a — B가 채택되면 숨은 칸 값이 쓰여(계획서 V-5) 개산공제 문장이 틀리다. 별건 계획서에서 칸 게이트와 함께 정한다.
  ["이월과세 완공 APT ② 환산 ON(문구 유지)", form([carryApt({ ...CARRY_EST, directExpenses: "7000000" })], "700000000", CARRY_DATES), false, FIELD],
];

const lastAsset = (f: TransferFormData) => f.assets[f.assets.length - 1];
const legacyIssues = (f: TransferFormData) =>
  [0, 1, 2, 3, 4, 5].flatMap((s) => collectStepIssues(s, f)).filter((i) => i.field === "directExpenses");
const expenseSection = (a: AssetForm, transferDate: string) => {
  const { container } = render(<AssetSectionExpense asset={a} onChange={() => {}} totalTransferExpense="" isSingleAsset isNonPrimaryAsset={false} transferDate={transferDate} />);
  const text = (id: string) => container.querySelector(`[data-testid="${id}"]`)?.textContent ?? null;
  const out = { legacy: text("redev-legacy-expense-unused-notice"), postApproval: text("redev-expense-post-approval-notice") };
  cleanup();
  return out;
};
const hasPreApprovalField = (a: AssetForm, transferDate: string) => {
  const { container } = render(<RedevelopmentBlock asset={a} onChange={() => {}} transferDate={transferDate} />);
  const has = Array.from(container.querySelectorAll("label")).some((l) => l.textContent?.trim() === "인가전 분 필요경비");
  cleanup();
  return has;
};

describe("LM-1 문구는 ③ 인가전 분 칸 유무로 갈리고 ⑧·⑤가 같은 문장을 쓴다", () => {
  it.each(CASES)("%s", (_n, f, preField, tail) => {
    const a = lastAsset(f);
    const message = redevLegacyExpenseUnusedMessage(a);
    expect(message.startsWith(HEAD)).toBe(true);
    expect(message.endsWith(tail)).toBe(true);
    expect(hasPreApprovalField(a, f.transferDate)).toBe(preField);
    const hit = legacyIssues(f);
    expect(hit).toHaveLength(1);
    expect(hit[0].message.endsWith(message)).toBe(true);
    expect(expenseSection(a, f.transferDate).legacy).toBe(message);
    // 옛 칸을 비우면 다른 차단 없이 통과한다(시료 유효성)
    expect([0, 1, 2, 3, 4, 5].flatMap((s) => collectStepIssues(s, { ...f, assets: f.assets.map((x, i) => (i === f.assets.length - 1 ? { ...x, directExpenses: "" } : x)) }))).toEqual([]);
  });
});

describe("LM-2 같은 ④의 보라 안내와 방향이 같다", () => {
  it.each(CASES.filter(([n]) => !n.includes("이월과세")))("%s", (_n, f, preField, tail) => {
    const a = lastAsset(f);
    const { legacy, postApproval } = expenseSection(a, f.transferDate);
    if (preField) {
      expect(legacy).toContain("「인가전 분 필요경비」");
      return;
    }
    // 칸이 없는 경로 — 화면에 없는 칸을 지목하지 않는다
    expect(legacy).not.toContain("인가전 분 필요경비");
    if (tail === LUMP) expect(postApproval).toContain("인가 전 비용은 이 칸에 넣지 마세요");
    if (tail === RECEIVE_ONLY) expect(postApproval).toContain("인가 전 지출을 포함한 자본적지출·양도비 합계를 이 칸에 넣으면");
    if (tail === RECEIVE_ONLY_BG) expect(postApproval).toContain("단서 비교가 계산에 반영되지 않으므로");
  });
});

describe("LM-3 축 B 둘째 지분 카드 — ⑤ 안내 = ⑧ 문장", () => {
  it.each([
    ["실가 지분", {}, FIELD],
    ["환산 지분", EST, LUMP],
  ])("%s", (_n, mode, tail) => {
    const share = (i: number, n: string, o: Over = {}) =>
      apt(i, { ...mode, actualSalePrice: "", redevSettlementAmount: i === 1 ? "48000000" : "32000000", ownershipNumerator: n, ownershipDenominator: "100", ...o });
    const primary = share(1, "60") as AssetForm;
    const second = { ...share(2, "40", { directExpenses: "7000000" }), assetKind: "housing", redevSubject: "" } as AssetForm;
    const f = form([primary, second] as unknown as Over[], "1000000000", { assetSplitMode: "fractional", bundledSaleMode: "apportioned" });
    const hit = [0, 1, 2, 3, 4, 5].flatMap((s) => collectStepIssues(s, f)).filter((i) => i.assetIndex === 1 && i.field === "directExpenses");
    expect(hit).toHaveLength(1);
    const { container } = render(
      <CompanionAssetCard index={1} asset={second} primaryAsset={primary} bundledSaleMode="apportioned" onChange={() => {}} transferDate="2024-06-01"
        splitMode="fractional" onFractionalToggle={() => {}} hasSiblings />,
    );
    const notice = container.querySelector('[data-asset-section="4"] [data-testid="redev-legacy-expense-unused-notice"]')?.textContent ?? "";
    expect(notice.endsWith(tail)).toBe(true);
    expect(hit[0].message.endsWith(notice)).toBe(true);
  });
});
