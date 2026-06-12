/**
 * E2E: 취득 다건 + 양도 단건 개별법(specific) 활성화 (A-1)
 *
 * 설계: docs/02-design/features/stock-transfer-lots-specific-a1.ui.design.md §5
 * 엔진: lib/tax-engine/stock-transfer/lot-allocation.ts (matchSpecific — 합성 단일 매도)
 * UI:   AcquisitionLotsMatrix (산정방법 개별법 + 매수 lot별 배정 수량)
 *
 * E-1: 실가·다건·개별법 + 매수 2 lot 배정(a 1000 + b 200) + 계산 → acquisitionPrice 14,000,000
 *      (A1-ENGINE-1 동일 입력)
 *
 * 실행: E2E_PORT=3200 npx playwright test e2e/stock-transfer-lots-specific.spec.ts
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

/** Step1 — kosdaq (취득 2020-01-01 / 양도 2025-07-01 / 양도 1200주) */
async function fillStep1(page: Page) {
  await page.getByPlaceholder("종목명을 입력하세요").fill("예제개별법주식");
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

  await page.locator('[data-slot="field-card"]').filter({ hasText: "양도 주식수" }).locator("input").first().fill("1200");
  await page.locator('[data-slot="field-card"]').filter({ hasText: "발행주식 총수" }).locator("input").first().fill("10000000");
}

test.describe("A-1 lots-only 개별법(specific)", () => {
  test("E-1: 실가·다건·개별법 + 배정 a1000·b200 → acquisitionPrice 14,000,000", async ({ page }) => {
    test.setTimeout(120_000);
    await gotoStockTransferTax(page);
    await fillStep1(page);

    // Step1 → Step2
    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByText("양도·취득가액").first()).toBeVisible({ timeout: 10_000 });

    // 양도가액 합계 (실가·total 기본값) = 1200 × 18000 = 21,600,000
    await page
      .locator(`div:has(> label:has-text('양도가액 합계')) input[type="text"]`)
      .first()
      .fill("21600000");

    // 취득가액 입력방식 → 일자별 다건 (실가 기본값 actual)
    await page.getByText("일자별 다건", { exact: true }).click();
    // 산정방법 → 개별법
    await page.getByText("개별법", { exact: true }).click();

    // 매수 #1 (자동 1행) — a: 2020-01-01, 1000주 @ 10,000, 배정 1000
    // 매수 행 추가 → 매수 #2 (b)
    await page.getByRole("button", { name: /매수 행 추가/ }).click();

    // 매트릭스 날짜 (Step2 — lot 2개 × 연/월/일)
    const year = page.locator('input[type="text"][aria-label="연도"]');
    const month = page.locator('input[type="text"][aria-label="월"]');
    const day = page.locator('input[type="text"][aria-label="일"]');
    await year.nth(0).fill("2020");
    await month.nth(0).fill("01");
    await day.nth(0).fill("01");
    await year.nth(1).fill("2023");
    await month.nth(1).fill("01");
    await day.nth(1).fill("01");

    // 주식수 (lot별) — nth(0)=매수1, nth(1)=매수2
    const shareInputs = page.locator(`div:has(> label:has-text('주식수')) input[type="text"]`);
    await shareInputs.nth(0).fill("1000");
    await shareInputs.nth(1).fill("500");

    // 1주당 단가 (lot별)
    const priceInputs = page.locator(`div:has(> label:has-text('1주당 단가')) input[type="text"]`);
    await priceInputs.nth(0).fill("10000");
    await priceInputs.nth(1).fill("20000");

    // 이 양도에 배정 수량 (lot별) — a 1000 + b 200 = 1200
    const allocInputs = page.locator(`div:has(> label:has-text('이 양도에 배정 수량')) input[type="text"]`);
    await allocInputs.nth(0).fill("1000");
    await allocInputs.nth(1).fill("200");

    // Step2 → Step3
    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByText("필요경비·신고").first()).toBeVisible({ timeout: 10_000 });

    // 신고일 (Step3 유일 DateInput)
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
    expect(json.result.acquisitionPrice).toBe(14_000_000);
    expect(json.result.transferPrice).toBe(21_600_000);
    expect(json.result.appliedRules).toContain("로트개별법");
  });
});
