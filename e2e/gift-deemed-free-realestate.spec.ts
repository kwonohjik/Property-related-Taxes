import { test, expect, type Page } from "@playwright/test";

/**
 * E2E: 증여로 보는 경우 §37 보완 — 경정청구(G1) + 무상사용 다기간(G2).
 * 계획서 docs/00-pm/gift-free-realestate-supplement.plan.md
 * 정책 [[feedback_browser_verify_with_playwright]] · [[feedback_e2e_worktree_port_isolation]]
 */

async function openFreeRealEstate(page: Page) {
  await page.goto("/calc/gift-deemed");
  await page.getByTestId("deemed-type-free_realestate").click();
  const dialog = page.getByTestId("deemed-detail-dialog");
  // 모달 자체 증여일 (단일 DateInput — 토글 전이라 유일)
  await dialog.getByLabel("연도").fill("2025");
  await dialog.getByLabel("월").fill("3");
  await dialog.getByLabel("일", { exact: true }).fill("15");
}

async function fillDate(page: Page, wrapTestId: string, y: string, m: string, d: string) {
  const w = page.getByTestId(wrapTestId);
  await w.getByLabel("연도").fill(y);
  await w.getByLabel("월").fill(m);
  await w.getByLabel("일", { exact: true }).fill(d);
}

const confirm = (page: Page) => page.getByTestId("deemed-detail-confirm").click();

test.describe("증여로 보는 경우 §37 — 경정청구·다기간", () => {
  test("[RECT-1] 경정청구 산출세액 55,815,740 · 2020-03-15~2023-07-20 → 18,605,246", async ({ page }) => {
    await openFreeRealEstate(page);
    await page.getByPlaceholder("부동산 가액 (원)").fill("5000000000");
    await page.getByTestId("free-rect-toggle").getByRole("switch").click();
    await page.getByPlaceholder("증여세 산출세액 (원)").fill("55815740");
    await fillDate(page, "free-rect-giftdate-wrap", "2020", "3", "15");
    await fillDate(page, "free-rect-termdate-wrap", "2023", "7", "20");
    await confirm(page);
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-rectification-value")).toContainText("18,605,246");
  });

  test("[FRE-MULTI-1] 무상사용 다기간 50억×2 → 기간표 2행 · 증여재산가액=첫 기간 379,078,675", async ({ page }) => {
    await openFreeRealEstate(page);
    await page.getByTestId("free-periods-toggle").getByRole("switch").click();
    // 기간 1
    await fillDate(page, "free-period-date-wrap-0", "2020", "3", "15");
    await page.getByTestId("free-period-0").getByPlaceholder("부동산 가액 (원)").fill("5000000000");
    // 기간 2 추가
    await page.getByTestId("free-period-add").click();
    await fillDate(page, "free-period-date-wrap-1", "2025", "3", "16");
    await page.getByTestId("free-period-1").getByPlaceholder("부동산 가액 (원)").fill("5000000000");
    await confirm(page);
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-period-breakdown")).toBeVisible();
    await expect(page.getByTestId("deemed-result-value")).toContainText("379,078,675");
  });

  test("[회귀] 단일 무상사용 20억 (다기간·경정 OFF) → 151,631,469", async ({ page }) => {
    await openFreeRealEstate(page);
    await page.getByPlaceholder("부동산 가액 (원)").fill("2000000000");
    await confirm(page);
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-result-value")).toContainText("151,631,469");
  });

  test("[COL-RECT-1] 담보 경정 산출 5천만 · 2023-01-01~2023-07-01 → 25,000,000 (분모 12월)", async ({ page }) => {
    await openFreeRealEstate(page);
    await page.getByTestId("free-subtype-collateral").click();
    await page.getByPlaceholder("차입금 (원)").fill("500000000");
    await page.getByTestId("free-rect-toggle").getByRole("switch").click();
    await page.getByPlaceholder("증여세 산출세액 (원)").fill("50000000");
    await fillDate(page, "free-rect-giftdate-wrap", "2023", "1", "1");
    await fillDate(page, "free-rect-termdate-wrap", "2023", "7", "1");
    await confirm(page);
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-rectification-value")).toContainText("25,000,000");
  });
});
