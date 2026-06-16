/**
 * 재산세 세부담상한 §118 본문 정밀 재산정(recompute 모드) E2E — A-3 P5
 *
 * 1. 건축물 비주택 → Step3에 direct/recompute 모드 토글 노출 + recompute 시 직전 과세표준 입력 → 계산 성공
 * 2. 주택 → recompute 모드 토글 미노출 (§122 단서)
 *
 * 실행: E2E_PORT=3102 npx playwright test e2e/property-tax-cap-recompute.spec.ts
 */

import { test, expect, type Page } from "@playwright/test";

function amountInputByLabel(page: Page, labelText: string | RegExp) {
  return page
    .locator("div")
    .filter({ hasText: labelText })
    .locator('input[inputmode="numeric"]')
    .last();
}

async function calcAndWait(page: Page) {
  const calcResponse = page.waitForResponse(
    (r) => r.url().includes("/api/calc/property") && r.request().method() === "POST",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: /재산세 계산하기/ }).click();
  const resp = await calcResponse;
  expect(resp.ok(), `재산세 계산 API 비정상 ${resp.status()}`).toBe(true);
  await expect(page.getByText("총 납부세액").first()).toBeVisible({ timeout: 30_000 });
}

test.describe("재산세 §118 recompute 모드", () => {
  test("1: 건축물 → recompute 모드 토글 노출 + 직전 과세표준 재산정 계산", async ({ page }) => {
    await page.goto("/calc/property-tax");
    await page.getByText("건축물 (비주거용)").click();
    await amountInputByLabel(page, /^공시가격/).fill("1000000000");
    await page.getByRole("button", { name: /^다음$/ }).click();

    // Step3: recompute 모드 토글 노출 확인
    await expect(page.getByText(/직전연도 과세표준으로 재산정/)).toBeVisible();
    await page.getByText(/직전연도 과세표준으로 재산정/).click();
    await amountInputByLabel(page, /직전연도 과세표준/).fill("100000000");

    await calcAndWait(page);
  });

  test("2: 주택 → recompute 모드 토글 미노출 (§122 단서)", async ({ page }) => {
    await page.goto("/calc/property-tax");
    // 기본 objectType = housing
    await amountInputByLabel(page, /^공시가격/).fill("700000000");
    await page.getByRole("button", { name: /^다음$/ }).click();

    await expect(page.getByText(/직전연도 과세표준으로 재산정/)).toHaveCount(0);
  });
});
