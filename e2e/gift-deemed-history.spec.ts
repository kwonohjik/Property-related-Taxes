/**
 * 증여이익(증여로 보는 경우) 계산 — 이력 왕복 (#72)
 *
 * 설계: docs/00-pm/gift39-72-100-103-deemed-history.plan.md (PR ①)
 *
 * 종전에는 이 계산기가 로컬 세목에 없어 입력·결과가 어디에도 남지 않았다. vitest가 등록·재개
 * 함수를 고정하지만, **실제로 저장되고 이력 화면에 「증여이익」으로 뜨고 편집으로 돌아오는지**는
 * 브라우저에서만 관측된다(`feedback_guard_uses_proxy_not_the_claim`).
 */
import { test, expect, type Page } from "@playwright/test";
import { waitForCalculationSaved } from "./_helpers/history-seed";

/** §40 전환사채 저가인수 — 시가 1,000,000,000 · 인수 600,000,000 → 증여이익 400,000,000 */
async function calcConvertibleBond(page: Page) {
  await page.goto("/calc/gift-deemed");
  await page.getByTestId("deemed-type-convertible_bond").click();
  const gd = page.getByTestId("deemed-detail-dialog").getByTestId("deemed-gift-date");
  await gd.getByLabel("연도").fill("2025");
  await gd.getByLabel("월").fill("3");
  await gd.getByLabel("일", { exact: true }).fill("15");
  await page.getByLabel("전환사채등 시가", { exact: true }).fill("1000000000");
  await page.getByLabel("인수·취득가액", { exact: true }).fill("600000000");
  await page.getByTestId("deemed-detail-confirm").click();
  await page.getByTestId("deemed-calc-btn").click();
  await expect(page.getByTestId("deemed-result-value")).toContainText("400,000,000");
}

test.describe("증여이익 계산 — 이력", () => {
  test("[GDH-1] 계산 결과가 이력에 「증여이익」으로 남는다 (세액이 아니다)", async ({ page }) => {
    await calcConvertibleBond(page);
    // 저장은 결과 마운트 뒤 비동기 write다 — 응답만 보고 이동하면 0건으로 보인다
    await waitForCalculationSaved(page, "gift_deemed");

    await page.goto("/history");
    await expect(page.getByText("증여이익:").first()).toBeVisible();
    await expect(page.getByText("400,000,000").first()).toBeVisible();
    await expect(page.getByText(/전환사채에 따른 이익/).first()).toBeVisible();

    // 드로어 머리 값도 「납부세액 -」이 아니라 증여이익이다
    await page.getByText(/전환사채에 따른 이익/).first().click();
    await expect(page.getByTestId("drawer-headline-value")).toHaveText("400,000,000");
  });

  test("[GDH-2] 이력 「편집」이 계산기로 돌아와 입력을 복원하고 같은 값을 다시 낸다", async ({ page }) => {
    await calcConvertibleBond(page);
    await waitForCalculationSaved(page, "gift_deemed");

    await page.goto("/history");
    await page.locator('[data-testid^="resume-"]').first().click();
    await expect(page).toHaveURL(/\/calc\/gift-deemed/);

    // 결과는 되살리지 않는다 — 폼만 온다
    await expect(page.getByTestId("deemed-summary-card")).toContainText("전환사채에 따른 이익");
    await expect(page.getByTestId("deemed-result-value")).toHaveCount(0);

    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-result-value")).toContainText("400,000,000");
  });

  test("[GDH-3] 이력 필터 「증여이익」이 그 세목만 남긴다", async ({ page }) => {
    await calcConvertibleBond(page);
    await waitForCalculationSaved(page, "gift_deemed");

    await page.goto("/history");
    await page.getByRole("button", { name: "증여이익", exact: true }).click();
    await expect(page.getByText("증여이익:").first()).toBeVisible();
    await page.getByRole("button", { name: "증여세", exact: true }).click();
    await expect(page.getByText("증여이익:")).toHaveCount(0);
  });
});
