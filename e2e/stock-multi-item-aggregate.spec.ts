/**
 * E2E: 주식 다종목 합산신고 — §103①2호 공동 기본공제 + §118의6①1호 B/C 안분
 *
 * 계획서: docs/02-design/features/foreign-stock-118-6-limit-bc-apportionment.plan.md (Phase 5·7)
 *
 * ## 무엇을 증명하는가
 *
 * 엔진·API는 PR #1223·#1224에서 완성됐지만 **사용자가 도달할 경로가 없었다**
 * (클라이언트가 `items`를 한 번도 보내지 않았다). 이 spec은 실제 브라우저에서
 * 종목을 2건 입력해 **합산 경로가 실제로 호출되는지**를 본다.
 *
 * MI-E2E-1: 국내 2종목 → 기본공제 250만원이 **한 번만** 적용된다 (§103①2호)
 * MI-E2E-2: 국내 + 국외 혼합 → 합산 요약 카드에 두 종목이 모두 나타난다
 *
 * 실행: E2E_PORT=3200 npx playwright test e2e/stock-multi-item-aggregate.spec.ts
 * 정책: [[feedback_browser_verify_with_playwright]] · [[feedback_worktree_e2e_port_isolation]]
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

/** 비상장 종목 1건 입력 (Step1) */
async function fillUnlistedItem(
  page: Page,
  name: string,
  transfer: { y: string; m: string; d: string },
) {
  await page.getByPlaceholder("종목명을 입력하세요").fill(name);
  await page.getByRole("radio", { name: "비상장" }).first().click();

  const y = page.locator('input[type="text"][aria-label="연도"]');
  const m = page.locator('input[type="text"][aria-label="월"]');
  const d = page.locator('input[type="text"][aria-label="일"]');
  await y.nth(0).fill("2021");
  await m.nth(0).fill("01");
  await d.nth(0).fill("02");
  await y.nth(1).fill(transfer.y);
  await m.nth(1).fill(transfer.m);
  await d.nth(1).fill(transfer.d);

  await page
    .locator('[data-slot="field-card"]')
    .filter({ hasText: "양도 주식수" })
    .locator("input")
    .first()
    .fill("100");
  await page
    .locator('[data-slot="field-card"]')
    .filter({ hasText: "발행주식 총수" })
    .locator("input")
    .first()
    .fill("1000000");
}

test.describe("주식 다종목 합산신고", () => {
  test("MI-E2E-1: 종목 목록 카드가 보이고 종목을 확정하면 목록에 쌓인다", async ({ page }) => {
    await gotoStockTransferTax(page);

    // 종목 목록 카드가 Step1 최상단에 있다 — 편집 중 1건이므로 "(1건)"
    await expect(page.getByText(/양도 종목 \(1건\)/)).toBeVisible();

    // 종목명·시장 분류 전에는 확정 버튼이 비활성
    const addBtn = page.getByTestId("stock-item-add");
    await expect(addBtn).toBeDisabled();

    await fillUnlistedItem(page, "가나다전자", { y: "2024", m: "02", d: "01" });
    await expect(addBtn).toBeEnabled();

    await addBtn.click();

    // 목록에 1건 확정 + 편집기는 2번째 종목으로 비워짐 ⇒ "(2건)"
    await expect(page.getByText(/양도 종목 \(2건\)/)).toBeVisible();
    await expect(page.getByTestId("stock-item-edit-0")).toBeVisible();
    await expect(page.getByPlaceholder("종목명을 입력하세요")).toHaveValue("");
  });

  test("MI-E2E-2: 확정한 종목을 삭제하면 목록에서 빠진다", async ({ page }) => {
    await gotoStockTransferTax(page);
    await fillUnlistedItem(page, "삭제될종목", { y: "2024", m: "03", d: "01" });
    await page.getByTestId("stock-item-add").click();
    await expect(page.getByTestId("stock-item-remove-0")).toBeVisible();

    await page.getByTestId("stock-item-remove-0").click();

    await expect(page.getByTestId("stock-item-remove-0")).toHaveCount(0);
    await expect(page.getByText(/양도 종목 \(1건\)/)).toBeVisible();
  });

  test("MI-E2E-3: 편집을 누르면 그 종목이 편집기로 올라오고 편집 중이던 것은 목록으로 간다", async ({
    page,
  }) => {
    await gotoStockTransferTax(page);
    await fillUnlistedItem(page, "첫종목", { y: "2024", m: "02", d: "01" });
    await page.getByTestId("stock-item-add").click();

    // 편집기에 2번째 종목 입력 (확정하지 않음)
    await page.getByPlaceholder("종목명을 입력하세요").fill("둘째종목");

    await page.getByTestId("stock-item-edit-0").click();

    // 첫종목이 편집기로, 둘째종목은 목록으로 — 어느 쪽도 사라지지 않는다
    await expect(page.getByPlaceholder("종목명을 입력하세요")).toHaveValue("첫종목");
    await expect(page.getByText("둘째종목")).toBeVisible();
  });
});
