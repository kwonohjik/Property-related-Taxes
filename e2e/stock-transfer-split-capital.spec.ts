/**
 * E2E: 분할/다건 모드 + 자본조정(무상증자) 활성화 (A-2)
 *
 * 설계: docs/02-design/features/stock-transfer-split-capital-adjustments-a2.ui.design.md §5
 * 엔진: lib/tax-engine/stock-transfer/lot-capital-adjustments.ts (lot별 희석)
 *
 * E-1: 다건(lots-only)·fifo + 무상증자 100% + 계산 → acquisitionPrice 1,000,000 (희석 200@5,000)
 *      (CA-ENGINE-1 동일 입력)
 *
 * 실행: E2E_PORT=3200 npx playwright test e2e/stock-transfer-split-capital.spec.ts
 * 정책: [[feedback_browser_verify_with_playwright]] · [[feedback_e2e_worktree_port_isolation]]
 */

import { test, expect, type Page } from "@playwright/test";

async function gotoStockTransferTax(page: Page) {
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => sessionStorage.clear());
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  await page.getByPlaceholder("종목명을 입력하세요").waitFor({ state: "visible", timeout: 30_000 });
}

async function fillStep1(page: Page) {
  await page.getByPlaceholder("종목명을 입력하세요").fill("예제자본조정주식");
  await page.getByRole("radio", { name: "코스닥" }).first().click();
  const year = page.locator('input[type="text"][aria-label="연도"]');
  const month = page.locator('input[type="text"][aria-label="월"]');
  const day = page.locator('input[type="text"][aria-label="일"]');
  await year.nth(0).fill("2020");
  await month.nth(0).fill("01");
  await day.nth(0).fill("01");
  await year.nth(1).fill("2025");
  await month.nth(1).fill("07");
  await day.nth(1).fill("01");
  await page.locator('[data-slot="field-card"]').filter({ hasText: "양도 주식수" }).locator("input").first().fill("200");
  await page.locator('[data-slot="field-card"]').filter({ hasText: "발행주식 총수" }).locator("input").first().fill("10000000");
}

test.describe("A-2 분할/다건 + 자본조정", () => {
  test("E-1: 다건·fifo + 무상증자 100% → acquisitionPrice 1,000,000", async ({ page }) => {
    test.setTimeout(120_000);
    await gotoStockTransferTax(page);
    await fillStep1(page);

    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByText("양도·취득가액").first()).toBeVisible({ timeout: 10_000 });

    // 양도가액 합계 = 200 × 8,000 = 1,600,000
    await page.locator(`div:has(> label:has-text('양도가액 합계')) input[type="text"]`).first().fill("1600000");

    // 취득 입력방식 → 일자별 다건 (실가 기본)
    await page.getByText("일자별 다건", { exact: true }).click();

    // 매수 lot 1 (자동 1행): 2020-01-01, 100주 @ 10,000
    const mYear = page.locator('input[type="text"][aria-label="연도"]');
    const mMonth = page.locator('input[type="text"][aria-label="월"]');
    const mDay = page.locator('input[type="text"][aria-label="일"]');
    await mYear.nth(0).fill("2020");
    await mMonth.nth(0).fill("01");
    await mDay.nth(0).fill("01");
    await page.locator(`div:has(> label:has-text('주식수')) input[type="text"]`).nth(0).fill("100");
    await page.locator(`div:has(> label:has-text('1주당 단가')) input[type="text"]`).nth(0).fill("10000");

    // 자본조정: + 행 추가 → 무상증자(자본준비금, 기본 선택) 발생일 2022-01-01 비율 1.0
    await page.getByRole("button", { name: "+ 행 추가", exact: true }).click();
    // 발생일 — 매트릭스 lot date(nth 0) 다음이 자본조정 발생일(nth 1)
    await mYear.nth(1).fill("2022");
    await mMonth.nth(1).fill("01");
    await mDay.nth(1).fill("01");
    await page.locator(`div:has(> label:has-text('비율')) input[type="text"]`).first().fill("1.0");

    // Step2 → Step3
    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByText("필요경비·신고").first()).toBeVisible({ timeout: 10_000 });

    await page.locator('input[type="text"][aria-label="연도"]').nth(0).fill("2025");
    await page.locator('input[type="text"][aria-label="월"]').nth(0).fill("08");
    await page.locator('input[type="text"][aria-label="일"]').nth(0).fill("31");

    const calcResponse = page.waitForResponse(
      (r) => r.url().includes("/api/calc/stock-transfer") && r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: "결과 보기" }).click();
    const resp = await calcResponse;
    expect(resp.ok()).toBeTruthy();
    const json = await resp.json();
    // 무상증자 100% → lot 100@10,000 희석 200@5,000. 양도 200 fifo 매칭 → 취득가 1,000,000
    expect(json.result.acquisitionPrice).toBe(1_000_000);
    expect(json.result.transferPrice).toBe(1_600_000);
    expect(json.result.lotCapitalAdjustmentsDetail).toBeDefined();
  });
});
