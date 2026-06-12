/**
 * E2E: [C-2/C-3] 거래정지 확장
 *
 * 설계: docs/02-design/features/stock-transfer-halt-extension-c2-c3.ui.design.md §5
 * C-2: 거래정지(양도) 상장주식도 비상장 보충평가 full/사례49 노출(simpleOnly 해제 증명)
 * C-3: 거래정지 + 취득 후 상장 = 법령상 양립 불가 (validate + Zod 차단)
 *
 * 실행: E2E_PORT=3200 npx playwright test e2e/stock-transfer-halt-extension.spec.ts
 * 정책: [[feedback_browser_verify_with_playwright]] · [[feedback_e2e_worktree_port_isolation]]
 */

import { test, expect, type Page } from "@playwright/test";

const HALT_TOGGLE_TITLE = "양도일 거래정지·관리종목 지정 (소령 §165③)";

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

/** Step1 — 코스닥 (취득 2018-01-01 / 양도 2024-06-01) */
async function fillStep1(page: Page) {
  await page.getByPlaceholder("종목명을 입력하세요").fill("예제거래정지확장");
  await page.getByRole("radio", { name: "코스닥" }).first().click();
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

test.describe("C-2/C-3 거래정지 확장 UI", () => {
  test("C2 E-1: 거래정지(양도) → full(평가액 계산) 라디오 노출 (simpleOnly 해제)", async ({ page }) => {
    test.setTimeout(120_000);
    await gotoStockTransferTax(page);
    await fillStep1(page);

    // Step1 → Step2 → 환산취득가
    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByText("양도·취득가액").first()).toBeVisible({ timeout: 10_000 });
    await fillByLabel(page, "양도가액 합계", "200000000");
    await page.getByRole("radio", { name: "환산취득가" }).first().click();

    // 거래정지(양도) 토글 ON
    await page
      .locator('[data-slot="toggle-card"]')
      .filter({ hasText: HALT_TOGGLE_TITLE })
      .getByRole("switch")
      .first()
      .click();

    // simpleOnly 해제 증명 — full "평가액 계산" 라디오 노출 (기존 simpleOnly면 미노출)
    await expect(page.getByText("평가액 계산", { exact: true })).toBeVisible({ timeout: 10_000 });
    // 사례49 토글도 노출
    await expect(page.getByText("취득시점 장부분실", { exact: false })).toBeVisible();
  });

  test("C3 E-2: 거래정지 + 취득 후 상장 → 양립 불가 차단 메시지(§52의2③)", async ({ page }) => {
    test.setTimeout(120_000);
    await gotoStockTransferTax(page);
    await fillStep1(page);

    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByText("양도·취득가액").first()).toBeVisible({ timeout: 10_000 });
    await fillByLabel(page, "양도가액 합계", "200000000");
    await page.getByRole("radio", { name: "환산취득가" }).first().click();

    // 취득 후 상장 ON
    await page
      .locator('[data-slot="toggle-card"]')
      .filter({ hasText: "취득 후 상장" })
      .getByRole("switch")
      .first()
      .click();
    // 거래정지(양도) ON
    await page
      .locator('[data-slot="toggle-card"]')
      .filter({ hasText: HALT_TOGGLE_TITLE })
      .getByRole("switch")
      .first()
      .click();

    // 다음 시도 → 양립 불가 차단 메시지(§52의2③)
    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByText("§52의2③", { exact: false })).toBeVisible({ timeout: 10_000 });
  });
});
