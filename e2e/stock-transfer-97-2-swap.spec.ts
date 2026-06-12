/**
 * E2E: [B-2] §97②2호 단서 swap — 환산 모드 실제 필요경비 비교
 *
 * 설계: docs/02-design/features/stock-transfer-97-2-swap-b2.ui.design.md §6
 * 엔진: lib/tax-engine/stock-transfer/stock-transfer-tax.ts (§97②단서swap 분기)
 *
 * E-1: 환산모드 → 실제 필요경비 31,000,000(> 가목 30,300,000) → swap
 *      → transferIncome 19,000,000 + body strip 해제(④). 장내 default(비과세) 유지 —
 *        swap은 finalTax 0이어도 정보성 echo로 반영(SW-9). 결과 카드 표시는 anchor로 커버.
 *
 * 실행: E2E_PORT=3200 npx playwright test e2e/stock-transfer-97-2-swap.spec.ts
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

/** Step1 — kospi 1,000주 (장외·취득 2018 / 양도 2024) */
async function fillStep1(page: Page) {
  await page.getByPlaceholder("종목명을 입력하세요").fill("예제단서주식");
  await page.getByRole("radio", { name: "코스피" }).first().click();

  const y = page.locator('input[type="text"][aria-label="연도"]');
  const m = page.locator('input[type="text"][aria-label="월"]');
  const d = page.locator('input[type="text"][aria-label="일"]');
  await y.nth(0).fill("2018");
  await m.nth(0).fill("01");
  await d.nth(0).fill("01");
  await y.nth(1).fill("2024");
  await m.nth(1).fill("06");
  await d.nth(1).fill("01");

  await page.locator('[data-slot="field-card"]').filter({ hasText: "양도 주식수" }).locator("input").first().fill("1000");
  await page.locator('[data-slot="field-card"]').filter({ hasText: "발행주식 총수" }).locator("input").first().fill("10000000");
}

async function fillByLabel(page: Page, label: string, value: string) {
  await page.locator(`div:has(> label:has-text('${label}')) input[type="text"]`).first().fill(value);
}

test.describe("B-2 §97②2호 단서 swap", () => {
  test("E-1: 환산 + 실제 필요경비 31M → swap · transferIncome 19,000,000", async ({ page }) => {
    test.setTimeout(120_000);
    await gotoStockTransferTax(page);
    await fillStep1(page);

    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByText("양도·취득가액").first()).toBeVisible({ timeout: 10_000 });
    await fillByLabel(page, "양도가액 합계", "50000000");
    await page.getByRole("radio", { name: "환산취득가" }).first().click();
    // 분모/분자 (가목 30,300,000 = 환산 30,000,000 + 개산 300,000)
    await fillByLabel(page, "양도시 1주당 기준시가", "50000");
    await fillByLabel(page, "취득시 1주당 기준시가", "30000");

    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByText("필요경비·신고").first()).toBeVisible({ timeout: 10_000 });

    // [B-2] 환산 모드 비교용 실비 입력 (라벨 '실제 필요경비 합계'로 시작 — 유일)
    await fillByLabel(page, "실제 필요경비 합계", "31000000");

    // 신고일
    await page.locator('input[type="text"][aria-label="연도"]').nth(0).fill("2024");
    await page.locator('input[type="text"][aria-label="월"]').nth(0).fill("08");
    await page.locator('input[type="text"][aria-label="일"]').nth(0).fill("31");

    const calcResponse = page.waitForResponse(
      (r) => r.url().includes("/api/calc/stock-transfer") && r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: "결과 보기" }).click();
    const resp = await calcResponse;
    expect(resp.ok()).toBeTruthy();

    // ④ strip 해제 증명 — 환산 모드(expenseMode estimated)에서도 actualExpenses 전송
    const reqBody = JSON.parse(resp.request().postData() ?? "{}");
    expect(reqBody.actualExpenses).toBe(31000000);
    expect(reqBody.expenseMode).toBe("estimated");

    const json = await resp.json();
    expect(json.result.swapApplied).toBe(true);
    expect(json.result.transferIncome).toBe(19_000_000);
    expect(json.result.appliedRules).toContain("§97②단서swap");
    expect(json.result.swapComparison.directSide).toBe(31_000_000);
    expect(json.result.swapComparison.chosen).toBe("direct");
  });
});
