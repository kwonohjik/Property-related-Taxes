/**
 * E2E: [B-5] §165⑤ 종가평균 증자·합병 기간 조정 (상증령 §52의2②) UI 통합
 *
 * 설계: docs/02-design/features/stock-transfer-165-5-capital-event-b5.ui.design.md §5
 * 엔진: lib/tax-engine/stock-transfer/stock-valuation-post-listing.ts (calcClosingAvgWithEvent)
 *
 * E-1: 취득 후 상장 환산 full 모드 → 증자·합병 토글 노출 → ON 시 발생일 + §52의2② 안내 노출
 *      (절단 산식 자체는 anchor B5-ENGINE-1~4·HELPER-1로 정밀 검증 — E2E는 UI 통합·해석 안내)
 *
 * 실행: E2E_PORT=3200 npx playwright test e2e/stock-transfer-165-5-capital-event.spec.ts
 * 정책: [[feedback_browser_verify_with_playwright]] · [[feedback_e2e_worktree_port_isolation]]
 */

import { test, expect, type Page } from "@playwright/test";

const CAPITAL_EVENT_TOGGLE_TITLE = "평가기간 중 증자·합병 발생 (상증령 §52의2②)";

async function gotoStockTransferTax(page: Page) {
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => sessionStorage.clear());
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  await page.getByPlaceholder("종목명을 입력하세요").waitFor({ state: "visible", timeout: 30_000 });
}

async function fillByLabel(page: Page, label: string, value: string) {
  await page.locator(`div:has(> label:has-text('${label}')) input[type="text"]`).first().fill(value);
}

/** Step1 — kosdaq 비상장→상장 (취득 2024-03-15 / 양도 2025-02-26) */
async function fillStep1(page: Page) {
  await page.getByPlaceholder("종목명을 입력하세요").fill("예제증자합병주식");
  await page.getByRole("radio", { name: "코스닥" }).first().click();

  const y = page.locator('input[type="text"][aria-label="연도"]');
  const m = page.locator('input[type="text"][aria-label="월"]');
  const d = page.locator('input[type="text"][aria-label="일"]');
  await y.nth(0).fill("2024");
  await m.nth(0).fill("03");
  await d.nth(0).fill("15");
  await y.nth(1).fill("2025");
  await m.nth(1).fill("02");
  await d.nth(1).fill("26");

  await page.locator('[data-slot="field-card"]').filter({ hasText: "양도 주식수" }).locator("input").first().fill("5000");
  await page.locator('[data-slot="field-card"]').filter({ hasText: "발행주식 총수" }).locator("input").first().fill("100000");
}

test.describe("B-5 §165⑤ 증자·합병 기간 조정 UI", () => {
  test("E-1: full 모드 → 증자·합병 토글 노출 → ON 시 발생일 + §52의2② 안내", async ({ page }) => {
    test.setTimeout(120_000);
    await gotoStockTransferTax(page);
    await fillStep1(page);

    // Step1 → Step2 → 환산취득가
    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByText("양도·취득가액").first()).toBeVisible({ timeout: 10_000 });
    await fillByLabel(page, "양도가액 합계", "44750000");
    await page.getByRole("radio", { name: "환산취득가" }).first().click();

    // 취득 후 상장 ON
    await page
      .locator('[data-slot="toggle-card"]')
      .filter({ hasText: "취득 후 상장" })
      .getByRole("switch")
      .first()
      .click();

    // full 모드 — 종가 표 + 증자·합병 섹션 노출
    await page.getByText("완전 재현 (PDF 3개 화면)", { exact: false }).click();

    // 증자·합병 토글 노출
    await expect(page.getByText(CAPITAL_EVENT_TOGGLE_TITLE, { exact: true })).toBeVisible({ timeout: 10_000 });

    // OFF 상태: 명문 미확인 안내(토글 children) 미노출
    await expect(page.getByText("명문·예규로 확정되지", { exact: false })).toHaveCount(0);

    // 토글 ON — 제목 텍스트 클릭(B-4 패턴)
    await page.getByText(CAPITAL_EVENT_TOGGLE_TITLE, { exact: true }).click();

    // ON: 발생일 + §52의2② 명문 미확인 해석 안내 노출
    await expect(page.getByText("증자·합병 발생일", { exact: false })).toBeVisible();
    await expect(page.getByText("명문·예규로 확정되지", { exact: false })).toBeVisible();
  });
});
