/**
 * E2E: PR-F FU-6 — 자산 카테고리 변경 워크플로
 *
 * 시나리오:
 *   1. 상속세 진입 + 자녀 추가
 *   2. financial 자산 추가
 *   3. ⋮ 메뉴 → "카테고리 변경" → Dialog 펼침
 *   4. 그룹 내 변경 (cash) → confirm indigo + emerald hint
 *   5. 그룹 간 변경 (real_estate_apartment) → confirm rose + 손실 필드 amber
 *   6. confirm → 카드 카테고리 변경 + 칩 자동 갱신
 *
 * 정책: [[feedback_browser_verify_with_playwright]]
 */

import { test, expect, type Page } from "@playwright/test";

async function gotoStep1WithFinancialCard(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill("2026");
  await page.getByLabel("월").first().fill("5");
  await page.getByLabel("일").first().fill("15");
  await page.getByRole("button", { name: /상속인 추가/ }).click();
  await page.getByText("자녀", { exact: true }).click();
  await page.getByRole("button", { name: /^다음/ }).click();
  await page.getByRole("button", { name: /재산 추가/ }).first().click();
  await page.getByText("예금·펀드·채권·공제금", { exact: true }).click();
}

test.describe("PR-F S-2: 카테고리 변경 워크플로", () => {
  test("S-2a: ⋮ 메뉴 → 카테고리 변경 → Dialog 펼침", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep1WithFinancialCard(page);

    const actionsMenu = page.locator('[data-testid^="estate-card-actions-menu-"]').first();
    await expect(actionsMenu).toBeVisible();
    await actionsMenu.click();

    const changeItem = page.locator('[data-testid^="estate-card-category-change-"]').first();
    await expect(changeItem).toBeVisible();
    await changeItem.click();

    const dialog = page.locator('[data-testid^="category-change-dialog-"]').first();
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("카테고리 변경");
    await expect(dialog).toContainText("현재 카테고리");
  });

  test("S-2b: 그룹 내 변경 (financial → cash) — emerald hint + indigo confirm", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoStep1WithFinancialCard(page);

    await page.locator('[data-testid^="estate-card-actions-menu-"]').first().click();
    await page.locator('[data-testid^="estate-card-category-change-"]').first().click();

    // cash 라디오 선택 — financial과 같은 financial 그룹
    await page.locator('[data-testid^="category-change-radio-cash-"]').first().click();

    // 그룹 내 변경 hint
    await expect(page.getByText(/그룹 내 변경/)).toBeVisible();

    // confirm 버튼 — indigo + "변경 확인" 라벨
    const confirm = page.locator('[data-testid^="category-change-confirm-"]').first();
    await expect(confirm).toBeEnabled();
    await expect(confirm).toContainText("변경 확인");

    // 클릭 → Dialog 닫힘 + 카드 카테고리 변경
    await confirm.click();
    await expect(page.locator('[data-testid^="category-change-dialog-"]')).toHaveCount(0);
  });

  test("S-2c: 그룹 간 변경 (financial → 아파트) — amber 경고 + rose confirm", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoStep1WithFinancialCard(page);

    await page.locator('[data-testid^="estate-card-actions-menu-"]').first().click();
    await page.locator('[data-testid^="estate-card-category-change-"]').first().click();

    // real_estate_apartment 라디오 선택
    await page
      .locator('[data-testid^="category-change-radio-real_estate_apartment-"]')
      .first()
      .click();

    // 그룹 간 amber 경고
    await expect(page.getByText(/그룹 간 변경/)).toBeVisible();

    // confirm 버튼 — rose + "변경 확인 (필드 손실)" 라벨
    const confirm = page.locator('[data-testid^="category-change-confirm-"]').first();
    await expect(confirm).toBeEnabled();
    await expect(confirm).toContainText("필드 손실");
  });

  test("S-2d: 동일 카테고리 선택 시 confirm 버튼 disabled", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep1WithFinancialCard(page);

    await page.locator('[data-testid^="estate-card-actions-menu-"]').first().click();
    await page.locator('[data-testid^="estate-card-category-change-"]').first().click();

    // 현재 카테고리는 financial — 라디오 기본 financial 선택됨
    const confirm = page.locator('[data-testid^="category-change-confirm-"]').first();
    await expect(confirm).toBeDisabled();
  });
});
