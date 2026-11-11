/**
 * 축 B(지분 분할) × 부담부증여 × 승계조합원 완공 아파트 — 지분 2 환산(K-5) 카드 필요경비 줄 · 취득가액 합계 = 승계 분기 값
 * (계획서 `docs/00-pm/remaining-4-measurements.plan.md` §F.5 · render anchor `__tests__/components/bg-axis-b-successor-card-expense-row.anchor.test.tsx`).
 *
 *   AS-E1 지분 2 인가 후 필요경비 9억 — 단서(나목): 카드 필요경비 216,000,000 · 「제97조 제2항 제2호 단서」 · 취득가액 합계 90,000,000(종전 240,000,000).
 *   AS-E2 칸 비움 — 개산공제 3,600,000(종전 「인가 후 분 — 자본적지출·양도비」 줄).
 * 사람이 브라우저로 직접 한 수동 확인은 아니다(headless Playwright). 워크트리는 `E2E_PORT=<포트> npx playwright test <spec>`.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { seedWithDeclaredRoster } from "./_helpers/roster-for-declared-count";

type A = Record<string, unknown>;
const REDEV: A = { assetKind: "redevelopment_apt", acquisitionCause: "purchase", acquisitionDate: "2019-03-01", standardPriceAtTransfer: "800000000", standardPriceAtAcq: "400000000",
  redevSubject: "apt", redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2018-06-01", redevRightsValue: "219218500", redevSettlementDirection: "pay", redevSettlementAmount: "0",
  redevCompletionDate: "2022-09-01", redevPreApprovalExpenses: "0", redevOriginalAssetType: "housing", redevActualAcquisitionPrice: "100000000", bgActualAcquisitionTotal: "250000000",
  useEstimatedAcquisition: false, redevManagementDisposalHousingPrice: "300000000", redevAcquisitionHousingPrice: "150000000", redevIsSuccessorMember: "yes" };
const primary: A = { ...makeDefaultAsset(1), assetId: "p", addressJibun: "서울 강남구 테스트동 1-1", transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgLendingDepositTotal: "0",
  ...REDEV, bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000", bgAcquisitionMethod: "actual", bgMortgageDebtAmount: "600000000", bgMortgageSetAmount: "600000000",
  ownershipNumerator: "60", ownershipDenominator: "100" };
const share = (post: string): A => ({ ...makeDefaultAsset(2), assetId: "s", ownershipNumerator: "40", ownershipDenominator: "100", acquisitionCause: "purchase", redevSubject: "apt",
  redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2018-06-01", redevRightsValue: "219218500", redevPreApprovalExpenses: "0", redevSettlementDirection: "pay",
  redevSettlementAmount: "0", redevCompletionDate: "2022-09-01", redevOriginalAssetType: "housing", acquisitionDate: "2020-01-01", redevIsSuccessorMember: "yes",
  bgShareOwnAcquisition: true, bgAcquisitionMethod: "converted", standardPriceAtAcq: "500000000", redevPostApprovalExpenses: post });
const seedForm = (post: string) => ({
  state: {
    formData: {
      assets: [primary, share(post)], assetSplitMode: "fractional", contractTotalPrice: "1000000000", transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0",
      householdHousingCount: "2", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isOneHousehold: false, isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false,
    },
    pendingMigration: false,
  },
  version: 0,
});

async function calc(page: Page, post: string) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate((x) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(x)), seedWithDeclaredRoster(seedForm(post)));
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  const res = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  await page.getByRole("button", { name: /계산하기/ }).last().click();
  const r = await res;
  expect(r.status()).toBe(200);
  return (await r.json())?.data?.aggregated?.totalTransferGain as number;
}

test("AS-E1: 단서(나목) — 카드 필요경비 216,000,000 · 취득가액 합계 90,000,000", async ({ page }) => {
  test.setTimeout(240_000);
  expect(await calc(page, "900000000")).toBe(294_000_000);
  const row = page.getByTestId("bg-bundle-card-necessary-expense");
  await expect(row).toContainText("216,000,000");
  await expect(row).toContainText("제97조 제2항 제2호 단서");
  await expect(page.getByTestId("bg-bundle-acquisition-total")).toContainText("90,000,000");
  await expect(page.getByTestId("bg-redev-filing-expense-post")).toHaveCount(0);
});

test("AS-E2: 칸 비움 — 개산공제 3,600,000 · 「자본적지출·양도비」 줄 없음", async ({ page }) => {
  test.setTimeout(240_000);
  expect(await calc(page, "")).toBe(356_400_000);
  await expect(page.getByTestId("bg-bundle-card-estimated-deduction")).toContainText("3,600,000");
  await expect(page.getByTestId("bg-redev-filing-expense-post")).toHaveCount(0);
});
