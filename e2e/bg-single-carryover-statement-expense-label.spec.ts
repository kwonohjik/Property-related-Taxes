/**
 * E2E: 이월과세 × 감정가액 단건 — 상세 계산 명세서 「필요경비」 줄은 개산공제를 「양도비 등」으로 적지 않는다.
 * 계획서 `docs/02-design/features/bg-single-carryover-statement-expense-label.plan.md`(Q-1 a · Q-2 a · Q-3 a).
 *
 * 시료: 토지 · 채무 80,000,000 · 시가 400,000,000(채무비율 0.2) · 당초 증여자 감정가액 250,000,000 · 취득시 기준시가 150,000,000.
 * 접힌 영역은 자동 펼침이 안정적이지 않아(#2682) 인쇄 영역의 텍스트(`textContent`)로 확인한다.
 *
 *   SL-E1. 증여세 상당액 2,000,000(A 채택) — 개산공제 산식 + 산입 줄 = 1,300,000 · 「양도비 등」 없음
 *   SL-E2. 증여세 상당액 0(A 채택) — 개산공제 900,000 · 산입 줄 없음
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


const statementText = (page: Page) => page.locator('[data-print-id="detailed-statement"]').first().evaluate((el) => (el.textContent ?? "").replace(/\s+/g, " "));

test("SL-E1: 증여세 상당액 2,000,000 — 개산공제 산식 + 산입 줄 = 1,300,000 · 「양도비 등」 없음", async ({ page }) => {
  test.setTimeout(240_000);
  await calc(page, "2000000");
  const text = await statementText(page);
  expect(text).toContain("필요경비 = 취득시 기준시가 × 채무액 / 증여재산 평가액 × 3% (개산공제, 소령 §163⑥)");
  // 분수는 분자·분모가 따로 렌더되어 textContent에서 「80,000,000400,000,000」로 이어진다.
  expect(text).toContain("= 150,000,000 × 80,000,000400,000,000 × 0.03 = 900,000 + 증여세 상당액 400,000 — 이월과세 §97의2①3호·시행령 §163의2② = 1,300,000");
  expect(text).not.toContain("양도비 등 900,000");
});

test("SL-E2: 증여세 상당액 0 — 개산공제 900,000 · 산입 줄이 없다", async ({ page }) => {
  test.setTimeout(240_000);
  await calc(page, "0");
  const text = await statementText(page);
  expect(text).toContain("= 150,000,000 × 80,000,000400,000,000 × 0.03 = 900,000");
  expect(text).not.toContain("양도비 등 900,000");
  expect(text).not.toContain("= 900,000 + 증여세 상당액");
});
