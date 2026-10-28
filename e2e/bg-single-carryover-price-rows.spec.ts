/**
 * E2E: 부담부증여 단건 × 이월과세 — 상세 명세서·신고서 양식의 양도가액·취득가액은 §159 슬롯 값이다.
 * 계획서 `docs/02-design/features/bg-single-carryover-statement-price-rows.plan.md`(Q-1 a · Q-2 a · Q-3 a).
 *
 * 시료: 토지 · 채무 80,000,000 · 시가 400,000,000(채무비율 0.2) · 당초 증여자 감정가액 250,000,000 · 취득시 기준시가 150,000,000.
 * 종전: 명세서 양도가액 0 · 취득가액 −30,000,000(A) / −35,000,000(B), 신고서 양식 두 칸 값 없음.
 *
 *   PR-E1. 감정가액 · 증여세 2,000,000(A 채택) — 양도 80,000,000 · 취득 50,000,000 · 필요경비 1,300,000
 *   PR-E2. 환산 · 증여세 2,000,000(B 채택) — 양도 80,000,000 · 취득 45,000,000 · 필요경비 1,080,000
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

const asset = (giftTax: string, method: string) => ({
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
  bgAcquisitionMethod: method, standardPriceAtTransfer: "320000000", standardPriceAtAcq: "180000000",
  bgActualAcquisitionLand: "300000000", bgCoDonorPresumedAcquisitionLand: "250000000", bgCoDonorLandStdPriceAtAcq: "150000000", bgCoDonorBuildingStdPriceAtAcq: "0",
});

async function calc(page: Page, giftTax: string, method: string) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    {
      state: {
        formData: {
          assets: [asset(giftTax, method)], transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "1", isOneHousehold: false,
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



const sectionText = (page: Page, id: string) => page.locator(`[data-print-id="${id}"]`).first().evaluate((el) => (el.textContent ?? "").replace(/\s+/g, " "));
/** 신고서 양식 본표(채택 시나리오 열)의 행 — 라벨로 시작하는 첫 행. */
const filingRow = (page: Page, label: string) => page.locator('[data-print-id="form-table"] tr').filter({ hasText: new RegExp(`^\\s*${label}\\s*[0-9-]`) }).first();

async function check(page: Page, vals: { transfer: string; acq: string; exp: string }) {
  // 상세 명세서 항목은 「… 법령 근거 ↗값」 순으로 렌더된다.
  const stmt = await sectionText(page, "detailed-statement");
  expect(stmt).toContain(`소득세법 시행령 §159·§166 ↗${vals.transfer}`);
  expect(stmt).toContain(`소득세법 §97 / 시행령 §163·§176의2 ↗${vals.acq}`);
  expect(stmt).toContain(`소득세법 §97 / 시행령 §163⑥ ↗${vals.exp}`);
  expect(stmt).not.toMatch(/↗-[0-9]/);
  await expect(filingRow(page, "양도가액")).toContainText(vals.transfer);
  await expect(filingRow(page, "취득가액")).toContainText(vals.acq);
  await expect(filingRow(page, "필요경비")).toContainText(vals.exp);
}

test("PR-E1: 감정가액 · 증여세 2M (A 채택) — 양도 80,000,000 · 취득 50,000,000 · 필요경비 1,300,000", async ({ page }) => {
  test.setTimeout(240_000);
  await calc(page, "2000000", "appraisal");
  await check(page, { transfer: "80,000,000", acq: "50,000,000", exp: "1,300,000" });
});

test("PR-E2: 환산 · 증여세 2M (B 채택) — 양도 80,000,000 · 취득 45,000,000 · 필요경비 1,080,000", async ({ page }) => {
  test.setTimeout(240_000);
  await calc(page, "2000000", "converted");
  await check(page, { transfer: "80,000,000", acq: "45,000,000", exp: "1,080,000" });
});
