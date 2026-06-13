/**
 * E2E: 주식 입력 탭 — 입력 순서 표시 + 하단 추가 버튼
 *
 * 설계: docs/02-design/features/stock-input-order-bottom-add.plan.md
 *
 * SO-1: 비상장 → 상장 순 입력 → DOM 카드 순서 [비상장, 상장] (입력 순 보존)
 * SO-2: 빈 목록 → 하단 버튼(stock-add-bottom) 부재 · 헤더 버튼 단독 →
 *        1건 추가 후 하단 버튼 노출 → 하단 버튼 클릭 시 추가 패널 펼침
 *
 * 정책: [[feedback_browser_verify_with_playwright]] · [[feedback_pre_anchor_verification]]
 */

import { test, expect, type Page } from "@playwright/test";
import { addHeir, closeHeirEditModal, closeStockModal } from "./_helpers/tax-flow";

/** 상속세 Step0(상속개시일 + 자녀 1명, RRN) → Step1(상속재산) 이동 */
async function gotoStockStep(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill("2026");
  await page.getByLabel("월").first().fill("5");
  await page.getByLabel("일").first().fill("15");
  await addHeir(page, "heir", "child");
  await closeHeirEditModal(page);
  await page.getByRole("button", { name: /^다음/ }).click();
}

/**
 * 주식 추가 — 헤더 버튼(estate-add-header-stock, 하단 버튼과 무관하게 단일 매칭) →
 * 카테고리 버튼("상장주식"/"비상장주식" exact)
 */
async function addStock(page: Page, kind: "listed" | "unlisted") {
  await page.getByTestId("estate-add-header-stock").click();
  await page
    .getByText(kind === "listed" ? "상장주식" : "비상장주식", { exact: true })
    .click();
  // 추가 직후 편집 모달 자동 오픈(E-1) → backdrop이 다음 추가·검증을 막으므로 닫는다.
  await closeStockModal(page);
}

test.describe("주식 입력 탭 — 입력 순서 + 하단 추가 버튼", () => {
  test("SO-1: 비상장 → 상장 순 입력 시 그 순서로 표시", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoStockStep(page);

    await addStock(page, "unlisted"); // 비상장 먼저
    await addStock(page, "listed"); //   상장 나중

    const cards = page.getByTestId("stock-card");
    await expect(cards).toHaveCount(2);
    // 입력 순서 보존 — 첫 카드 비상장, 둘째 카드 상장 (현행은 항상 상장 우선이라 실패)
    await expect(cards.nth(0)).toHaveAttribute("data-category", "unlisted_stock");
    await expect(cards.nth(1)).toHaveAttribute("data-category", "listed_stock");
  });

  test("SO-2: 하단 추가 버튼 게이팅 (빈 목록 부재 → 1건 후 노출 → 패널 펼침)", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await gotoStockStep(page);

    // 빈 목록: 하단 버튼 부재 + 헤더 버튼 단독
    await expect(page.getByTestId("stock-add-bottom")).toHaveCount(0);
    await expect(page.getByTestId("estate-add-header-stock")).toBeVisible();

    // 1건 추가 → 하단 버튼 노출
    await addStock(page, "unlisted");
    await expect(page.getByTestId("stock-add-bottom")).toBeVisible();

    // 하단 버튼 클릭 → 추가 패널 펼침
    await page.getByTestId("stock-add-bottom").click();
    await expect(page.getByText("추가할 주식 종류 선택")).toBeVisible();
  });
});
