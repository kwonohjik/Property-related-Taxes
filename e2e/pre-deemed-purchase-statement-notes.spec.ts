/**
 * E2E: 의제취득일(1985.1.1.) 전 매수 — 신고서 양식·상세명세서 표시 (V-6)
 * 계획서 `docs/02-design/features/realestate-pre-deemed-purchase-176-2-4.plan.md` §14.
 *
 *   PD-V1. 단건 토지 — 신고서 취득일 의제일 + 실제 취득일 주석 · 취득가액 ② + 산식 주석
 *   PD-V2. 함께 양도 둘째 자산 — 신고서 취득가액이 입력 1억이 아니라 ② · 필요경비에 차액이 없다
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

const LAND = (i: number, o: Record<string, unknown> = {}) => ({
  ...makeDefaultAsset(i), addressJibun: `서울 강남구 테스트동 ${i}-1`, assetKind: "land", acquisitionCause: "purchase", transferType: "regular", acquisitionDate: "1985-01-01", preDeemedOriginalAcquisitionDate: "1984-06-01",
  actualSalePrice: "500,000,000", fixedSalePrice: "500,000,000", fixedAcquisitionPrice: "100,000,000", acquisitionArea: "100", transferArea: "100", standardPriceAtTransfer: "500000000", ...o,
});
async function calc(page: Page, assets: unknown[], total: string) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), {
    state: { formData: { assets, contractTotalPrice: total, transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "0", isOneHousehold: false, householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true }, pendingMigration: false },
    version: 0,
  });
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  const res = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  await page.getByRole("button", { name: /계산하기/ }).last().click();
  expect((await res).status()).toBe(200);
}
const form = (page: Page) => page.locator('[data-print-section="form-table"]');

test("PD-V1: 단건 토지 — 신고서 주석", async ({ page }) => {
  test.setTimeout(240_000);
  await calc(page, [LAND(1)], "500000000");
  await expect(form(page)).toContainText("실제 취득일 1984-06-01");
  await expect(form(page)).toContainText("101,411,574");
  await expect(form(page)).toContainText("실지거래가액 100,000,000 + 생산자물가상승분 1,411,574");
});

test("PD-V2: 함께 양도 둘째 자산 — 신고서 취득가액 ②", async ({ page }) => {
  test.setTimeout(240_000);
  await calc(page, [LAND(1, { acquisitionDate: "2015-06-01", preDeemedOriginalAcquisitionDate: "", fixedAcquisitionPrice: "300,000,000" }), LAND(2)], "1000000000");
  await expect(form(page)).toContainText("101,411,574");
  await expect(form(page)).toContainText("실제 취득일 1984-06-01");
  const expenseRow = form(page).locator("tr", { hasText: "필요경비" }).first();
  await expect(expenseRow).not.toContainText("1,411,574");
});
