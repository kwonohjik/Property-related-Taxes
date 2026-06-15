/**
 * 재산세 화재위험 건축물 소방분 중과 (§146③2호·2의2호) E2E
 *
 * 1. 건축물 1억 + 대형 화재위험 → "화재위험 중과 ×3" + 지역자원시설세 276,900
 * 2. 건축물 1억 + 일반 → 중과 표기 없음
 * 3. 주택 선택 → 화재위험 등급 라디오 미노출
 *
 * 실행: E2E_PORT=3101 npx playwright test e2e/property-fire-hazard-surcharge.spec.ts
 */

import { test, expect, type Page } from "@playwright/test";

function amountInputByLabel(page: Page, labelText: string | RegExp) {
  return page
    .locator("div")
    .filter({ hasText: labelText })
    .locator('input[inputmode="numeric"]')
    .last();
}

/** RadioCardGroup 카드를 라벨 텍스트로 클릭 */
function radioCard(page: Page, labelText: string | RegExp) {
  return page.locator("label").filter({ hasText: labelText }).first();
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

test.describe("재산세 화재위험 건축물 소방분 중과 §146③2호·2의2호", () => {
  test("1: 건축물 1억 + 대형 화재위험 → 중과 ×3, 276,900", async ({ page }) => {
    await page.goto("/calc/property-tax");
    await radioCard(page, "건축물 (비주거용)").click();
    await amountInputByLabel(page, /^공시가격/).fill("100000000");
    await radioCard(page, /대형 화재위험 건축물/).click();

    await page.getByRole("button", { name: /^다음$/ }).click();
    await calcAndWait(page);

    await expect(page.getByText(/화재위험 중과 ×3/)).toBeVisible();
    await expect(page.getByText("276,900").first()).toBeVisible();
  });

  test("2: 건축물 1억 + 일반 → 중과 표기 없음", async ({ page }) => {
    await page.goto("/calc/property-tax");
    await radioCard(page, "건축물 (비주거용)").click();
    await amountInputByLabel(page, /^공시가격/).fill("100000000");

    await page.getByRole("button", { name: /^다음$/ }).click();
    await calcAndWait(page);

    await expect(page.getByText(/화재위험 중과/)).toHaveCount(0);
  });

  test("3: 주택 선택 → 화재위험 등급 라디오 미노출", async ({ page }) => {
    await page.goto("/calc/property-tax");
    // 기본 objectType=housing
    await expect(page.getByText(/화재위험 등급/)).toHaveCount(0);
  });
});
