/**
 * E2E: 토지 먼저 + 일반건물 함께 양도 — 일반건물 열 취득일·보유기간이 「-」가 아니라 그 자산 값이다.
 * 의제취득일 전 매수면 취득일 칸 1985-01-01 + 실제 취득일 주석.
 */
import { test, expect } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

const LAND = { ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "land", acquisitionCause: "purchase", transferType: "regular", acquisitionDate: "2015-06-01", actualSalePrice: "500,000,000", fixedSalePrice: "500,000,000", fixedAcquisitionPrice: "300,000,000", acquisitionArea: "100", transferArea: "100", standardPriceAtTransfer: "500000000" };
const second = makeDefaultAsset(2);
const GB = {
  ...second, addressJibun: "서울 강남구 테스트동 3-1", assetKind: "general_building", acquisitionCause: "purchase", gbBuildingAcquisitionCause: "purchase", transferType: "regular",
  acquisitionDate: "1985-01-01", landAcquisitionDate: "1985-01-01", preDeemedOriginalAcquisitionDate: "1984-06-01",
  actualSalePrice: "500,000,000", fixedSalePrice: "500,000,000", fixedAcquisitionPrice: "200,000,000", standardPriceAtTransfer: "500000000",
  gbLandArea: "205", gbBuildingArea: "200", gbBuildingFootprintArea: "100", gbZoneType: "general_residential",
  gbTransferLandPricePerSqm: "2000000", gbTransferBuildingValue: "300000000", gbAcqLandPricePerSqm: "1000000", gbAcqBuildingValue: "150000000",
};

test("CD-1: 토지 + 일반건물 — 신고서 취득일 1985-01-01 · 보유기간 41년 1월", async ({ page }) => {
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
  await expect(form.locator("tr", { hasText: "취득일자" }).first().locator("td")).toContainText(["2015-06-01", "1985-01-01", "1985-01-01"]);
  await expect(form.locator("tr", { hasText: "보유기간" }).first().locator("td")).toContainText(["10년 8월", "41년 1월", "41년 1월"]);
  await expect(form.locator("tr", { hasText: "취득일자" }).first()).toContainText("실제 취득일 1984-06-01");
});
