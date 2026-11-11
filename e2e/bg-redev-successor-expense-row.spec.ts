/**
 * 승계조합원 완공 아파트 × 부담부증여 × 환산(K-5) — 결과 명세 카드 필요경비 줄 = 재개발 승계 분기가 고른 값
 * (계획서 `docs/00-pm/remaining-4-measurements.plan.md` §F.4 · route·render anchor `__tests__/components/bg-redev-successor-expense-row.anchor.test.tsx`).
 *
 *   RS-E1 인가 후 필요경비 6억 — 단서(나목): 필요경비 360,000,000 · 「제97조 제2항 제2호 단서」 · 양도차익 240,000,000.
 *   RS-E2 칸 비움 — 개산공제 7,200,000(종전 「인가 후 분 — 자본적지출·양도비」 줄 이름).
 * 사람이 브라우저로 직접 한 수동 확인은 아니다(headless Playwright). 워크트리는 `E2E_PORT=<포트> npx playwright test <spec>`.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { seedWithDeclaredRoster } from "./_helpers/roster-for-declared-count";

const asset = (post: string) => ({
  ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgLendingDepositTotal: "0",
  assetKind: "redevelopment_apt", acquisitionCause: "purchase", acquisitionDate: "2019-03-01", standardPriceAtTransfer: "800000000", standardPriceAtAcq: "400000000",
  redevSubject: "apt", redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2018-06-01", redevRightsValue: "219218500", redevSettlementDirection: "pay",
  redevSettlementAmount: "0", redevCompletionDate: "2022-09-01", redevPreApprovalExpenses: "0", redevOriginalAssetType: "housing", redevActualAcquisitionPrice: "100000000",
  bgActualAcquisitionTotal: "250000000", useEstimatedAcquisition: false, redevManagementDisposalHousingPrice: "300000000", redevAcquisitionHousingPrice: "150000000",
  redevIsSuccessorMember: "yes", redevPostApprovalExpenses: post,
  bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000", bgAcquisitionMethod: "converted", bgMortgageDebtAmount: "600000000", bgMortgageSetAmount: "600000000",
});
const seedForm = (post: string) => ({
  state: {
    formData: {
      assets: [asset(post)], contractTotalPrice: "1000000000", transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "2",
      householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isOneHousehold: false, isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false,
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
  return (await r.json())?.data?.result?.transferGain as number;
}

test("RS-E1: 단서(나목) — 카드 필요경비 360,000,000 · 단서 설명", async ({ page }) => {
  test.setTimeout(240_000);
  expect(await calc(page, "600000000")).toBe(240_000_000);
  const row = page.getByTestId("bg-necessary-expense");
  await expect(row).toContainText("360,000,000");
  await expect(row).toContainText("제97조 제2항 제2호 단서");
  await expect(page.getByTestId("bg-estimated-deduction")).toHaveCount(0);
  await expect(page.getByTestId("bg-redev-filing-expense-post")).toHaveCount(0);
});

test("RS-E2: 칸 비움 — 개산공제 7,200,000 · 「자본적지출·양도비」 줄 없음", async ({ page }) => {
  test.setTimeout(240_000);
  expect(await calc(page, "")).toBe(292_800_000);
  await expect(page.getByTestId("bg-estimated-deduction")).toContainText("7,200,000");
  await expect(page.getByTestId("bg-redev-filing-expense-post")).toHaveCount(0);
});
