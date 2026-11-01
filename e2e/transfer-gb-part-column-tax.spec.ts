/**
 * E2E: 토지 먼저 + 일반건물 함께 양도 — 일반건물 열의 세율·산출세액은 비고 합계만 남는다.
 */
import { test, expect } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

const LAND = { ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "land", acquisitionCause: "purchase", transferType: "regular", acquisitionDate: "2015-06-01", actualSalePrice: "500,000,000", fixedSalePrice: "500,000,000", fixedAcquisitionPrice: "300,000,000", acquisitionArea: "100", transferArea: "100", standardPriceAtTransfer: "500000000" };
const GB = {
  ...makeDefaultAsset(2), addressJibun: "서울 강남구 테스트동 3-1", assetKind: "general_building", acquisitionCause: "purchase", gbBuildingAcquisitionCause: "purchase", transferType: "regular",
  acquisitionDate: "2000-06-01", landAcquisitionDate: "2000-06-01",
  actualSalePrice: "500,000,000", fixedSalePrice: "500,000,000", fixedAcquisitionPrice: "200,000,000", standardPriceAtTransfer: "500000000",
  gbLandArea: "205", gbBuildingArea: "200", gbBuildingFootprintArea: "100", gbZoneType: "general_residential",
  gbTransferLandPricePerSqm: "2000000", gbTransferBuildingValue: "300000000", gbAcqLandPricePerSqm: "1000000", gbAcqBuildingValue: "150000000",
};

test("GPC-1: 토지 + 일반건물 — 세율·산출세액은 토지 열과 합계만", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), {
    state: { formData: { assets: [LAND, GB], contractTotalPrice: "1000000000", transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "0", isOneHousehold: false, householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true }, pendingMigration: false },
    version: 0,
  });
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  const res = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  await page.getByRole("button", { name: /계산하기/ }).last().click();
  expect((await res).status()).toBe(200);
  const form = page.locator('[data-print-section="form-table"]');
  for (const label of ["산출세액", "결정세액"]) {
    const cells = form.locator("tr", { hasText: new RegExp(`^${label}`) }).first().locator("td");
    await expect(cells).toHaveCount(5);
    await expect(cells.nth(1)).toHaveText(/^[\d,]+$/); // 합계
    await expect(cells.nth(2)).toHaveText(/^[\d,]+$/); // 토지
    await expect(cells.nth(3)).toHaveText("-");
    await expect(cells.nth(4)).toHaveText("-");
  }
  await expect(form.locator("tr", { hasText: /^세율\s*/ }).filter({ hasNotText: "구분" }).first().locator("td").nth(3)).toHaveText("-");
  await expect(form.locator("tr", { hasText: "양도가액" }).first().locator("td").nth(3)).toHaveText(/^[\d,]+$/);
  // 상세명세서 — 산출세액 펼침에는 토지 행만, 가산세액 펼침에는 파트 행까지 남는다.
  for (const [label, count] of [["산출세액", 1], ["가산세액", 3]] as const) {
    const row = page.locator(`[data-statement-row="${label}"]`).first();
    await row.getByRole("button", { name: "자산별 펼치기" }).click();
    await expect(row.getByText("├─")).toHaveCount(count);
  }
});
