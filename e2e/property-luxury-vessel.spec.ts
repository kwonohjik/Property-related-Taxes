/**
 * 재산세 고급선박 5% (§111①4호 가목) E2E — Track C
 *
 * 1. 선박 → 고급선박 선택 → 적용 세율 5%
 * 2. 선박 → 일반선박(기본) → 적용 세율 0.3%
 *
 * 실행: E2E_PORT=3101 npx playwright test e2e/property-luxury-vessel.spec.ts
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

test.describe("재산세 고급선박 5%", () => {
  test("1: 선박 → 고급선박 → 적용 세율 5%", async ({ page }) => {
    await page.goto("/calc/property-tax");
    await page.getByText("선박", { exact: true }).click();
    // vesselType 위젯 노출 → 고급선박 선택 (radio role로 hint 텍스트와 구분)
    await expect(page.getByRole("radio", { name: /고급선박/ })).toBeVisible();
    await page.getByRole("radio", { name: /고급선박/ }).click();
    await amountInputByLabel(page, /^공시가격/).fill("1000000000");
    await page.getByRole("button", { name: /^다음$/ }).click();

    await calcAndWait(page);
    // 고급선박 §111①4호 가목 — 적용 세율 5%
    await expect(page.getByText(/적용 세율 \(5%\)/).first()).toBeVisible();
  });

  test("2: 선박 → 일반선박(기본) → 적용 세율 0.3%", async ({ page }) => {
    await page.goto("/calc/property-tax");
    await page.getByText("선박", { exact: true }).click();
    await amountInputByLabel(page, /^공시가격/).fill("1000000000");
    await page.getByRole("button", { name: /^다음$/ }).click();

    await calcAndWait(page);
    // 일반선박 §111①4호 나목 — 적용 세율 0.3%
    await expect(page.getByText(/적용 세율 \(0\.3%\)/).first()).toBeVisible();
  });
});
