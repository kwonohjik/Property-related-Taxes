/**
 * 재산세 주택 건축물분 소방분 (§146④ 단서) E2E
 *
 * 1. 주택 + 건물분 1.5억 → 결과 "주택 건물분, §146④ 단서" 행 표시
 * 2. 주택 + 건물분 미입력 → 소방분 행 미표시
 * 3. 건축물 선택 → "주택 건축물 부분" 입력란 미노출
 *
 * 실행: E2E_PORT=3101 npx playwright test e2e/property-housing-building-fire.spec.ts
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

test.describe("재산세 주택 건축물분 소방분 §146④ 단서", () => {
  test("1: 주택 + 건물분 1.5억 → 주택 건물분 소방분 행 표시", async ({ page }) => {
    await page.goto("/calc/property-tax");
    await amountInputByLabel(page, /^공시가격/).fill("300000000");
    await amountInputByLabel(page, /주택 건축물 부분 시가표준액/).fill("150000000");

    await page.getByRole("button", { name: /^다음$/ }).click();
    await calcAndWait(page);

    await expect(page.getByText(/주택 건물분, §146④ 단서/)).toBeVisible();
  });

  test("2: 주택 + 건물분 미입력 → 소방분 행 미표시", async ({ page }) => {
    await page.goto("/calc/property-tax");
    await amountInputByLabel(page, /^공시가격/).fill("300000000");

    await page.getByRole("button", { name: /^다음$/ }).click();
    await calcAndWait(page);

    await expect(page.getByText(/§146④ 단서/)).toHaveCount(0);
  });

  test("3: 건축물 선택 → 주택 건축물 부분 입력란 미노출", async ({ page }) => {
    await page.goto("/calc/property-tax");
    await page.locator("label").filter({ hasText: "건축물 (비주거용)" }).first().click();

    await expect(page.getByText(/주택 건축물 부분 시가표준액/)).toHaveCount(0);
  });
});
