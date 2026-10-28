/**
 * E2E: 이월과세 × 감정가액 단건 — 결과 카드의 개산공제 줄은 산식 값, 이월과세 증여세 산입분은 별도 줄.
 * 계획서 `docs/02-design/features/bg-single-presumed-card-expense-row.plan.md`(Q-1 a · Q-2 a).
 *
 * 종전: 「토지 개산공제 = 취득시 기준시가 150,000,000 × 채무비율 20.0000% × 개산공제율 3%」 줄이 산입분을 합친 1,700,000을 적고 산입 줄이 없었다.
 * 시료: 토지 · 채무 80,000,000 · 시가 400,000,000(채무비율 0.2) · 당초 증여자 감정가액 250,000,000 · 취득시 기준시가 150,000,000 · 증여세 상당액 4,000,000.
 *
 *   SP-E1. 개산공제 줄 900,000 · 산입 줄 800,000 · 안내 문장에 「산입은 별도」
 *   SP-E2. 증여세 상당액 0이면 산입 줄·덧붙임이 없고 개산공제 900,000
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

const asset = (giftTax: string) => ({
  ...makeDefaultAsset(1),
  addressJibun: "서울 강남구 테스트동 1-1",
  assetKind: "land",
  transferType: "burdened_gift",
  acquisitionCause: "carryover_gift",
  acquisitionDate: "2023-06-01",
  carryover: {
    giftRegistryDate: "2023-06-01", donorAcquisitionDate: "2012-01-01", donorAcquisitionCause: "purchase", donorAcquisitionPrice: "100000000",
    useEstimatedAcquisition: false, estimationMode: "", giftTaxAmount: giftTax, donorCapitalExpenditure: "0", giftDateValuation: "300000000", exclusionDeclared: {},
  },
  bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "400000000", bgMortgageDebtAmount: "80000000", bgDonorRelation: "lineal_descendant",
  bgAcquisitionMethod: "appraisal", standardPriceAtTransfer: "320000000", standardPriceAtAcq: "180000000",
  bgActualAcquisitionLand: "300000000", bgCoDonorPresumedAcquisitionLand: "250000000", bgCoDonorLandStdPriceAtAcq: "150000000", bgCoDonorBuildingStdPriceAtAcq: "0",
});

async function calc(page: Page, giftTax: string) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    {
      state: {
        formData: {
          assets: [asset(giftTax)], transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "1", isOneHousehold: false,
          householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false,
        },
        pendingMigration: false,
      },
      version: 0,
    },
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  const res = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  await page.getByRole("button", { name: /계산하기/ }).last().click();
  const r = await res;
  expect(r.status(), await r.text()).toBe(200);
}

const estRow = (page: Page) => page.locator("tr", { hasText: "토지 개산공제 = 취득시 기준시가 150,000,000 × 채무비율 20.0000% × 개산공제율 3%" });

test("SP-E1: 증여세 상당액 4,000,000 — 개산공제 900,000 · 산입 800,000 · 안내에 산입은 별도", async ({ page }) => {
  test.setTimeout(240_000);
  await calc(page, "4000000");
  await expect(estRow(page)).toHaveCount(1);
  await expect(estRow(page)).toContainText("900,000");
  await expect(estRow(page)).not.toContainText("1,700,000");
  const gift = page.getByTestId("bg-carryover-gift-tax");
  await expect(gift).toHaveCount(1);
  await expect(gift).toContainText("800,000");
  await expect(page.getByText(/산입은 별도 — 소득세법 제97조의2 제1항 제3호/)).toHaveCount(1);
});

test("SP-E2: 증여세 상당액 0 — 산입 줄과 덧붙임이 없다", async ({ page }) => {
  test.setTimeout(240_000);
  await calc(page, "0");
  await expect(estRow(page)).toContainText("900,000");
  await expect(page.getByTestId("bg-carryover-gift-tax")).toHaveCount(0);
  await expect(page.getByText(/산입은 별도/)).toHaveCount(0);
});
