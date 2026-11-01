/**
 * E2E: 함께 양도 — 환산 자산의 계산 후 사이드바 취득가액이 신고서와 같다(종전 「-」).
 * 시료: 토지 2필지 · 둘째 환산(1990.8.30. 전 등급가액) · 양도가액 안분 333,333,333 → 환산 133,333,333 · 개산공제 3,000,000.
 */
import { test, expect } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

const LAND = (i: number, o: Record<string, unknown> = {}) => ({
  ...makeDefaultAsset(i), addressJibun: `서울 강남구 테스트동 ${i}-1`, assetKind: "land", acquisitionCause: "purchase", transferType: "regular", acquisitionDate: "2015-06-01",
  actualSalePrice: "500,000,000", fixedSalePrice: "500,000,000", fixedAcquisitionPrice: "300,000,000", acquisitionArea: "100", transferArea: "100", standardPriceAtTransfer: "500000000", ...o,
});
const EST = { useEstimatedAcquisition: true, fixedAcquisitionPrice: "", acquisitionDate: "2000-06-01", acquisitionArea: "200", transferArea: "200", standardPriceAtTransfer: "250000000", standardPriceAtAcq: "100000000" };

test("SB-1: 둘째 자산 환산 — 사이드바 취득가액 = 신고서 133,333,333", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), {
    state: { formData: { assets: [LAND(1), LAND(2, EST)], contractTotalPrice: "1000000000", transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "0", isOneHousehold: false, householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true }, pendingMigration: false },
    version: 0,
  });
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  const res = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  await page.getByRole("button", { name: /계산하기/ }).last().click();
  expect((await res).status()).toBe(200);
  await expect(page.locator('[data-print-section="form-table"]').locator("tr", { hasText: "취득가액" }).first()).toContainText("133,333,333");
  // 입력 단계로 돌아오면 사이드바에 계산 결과가 남아 있다
  await page.getByRole("button", { name: "이전" }).first().click();
  const side = page.locator("div", { has: page.getByText(/^자산 2 —/) }).last();
  await expect(side).toContainText("133,333,333");
  await expect(side).toContainText("3,000,000");
});
