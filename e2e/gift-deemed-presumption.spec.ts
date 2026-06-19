import { test, expect, type Page } from "@playwright/test";

/** E2E: 증여로 보는 경우 — Phase 3 추정·의제 (§45 재산취득자금·§45의2 명의신탁). 상세 입력은 모달 안. */

async function openDetail(page: Page, type: string) {
  await page.getByTestId(`deemed-type-${type}`).click();
  const dialog = page.getByTestId("deemed-detail-dialog");
  await dialog.getByLabel("연도").fill("2025");
  await dialog.getByLabel("월").fill("3");
  await dialog.getByLabel("일", { exact: true }).fill("15");
}
const closeDetail = (page: Page) => page.getByTestId("deemed-detail-confirm").click();

test.describe("증여로 보는 경우 — 추정·의제", () => {
  test("§45 재산취득자금 증여추정 취득10억·입증6억 → 4억 + 증여세 연결", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await openDetail(page, "acquisition_fund_presumption");
    await page.getByPlaceholder("취득재산가액 (원)").fill("1000000000");
    await page.getByPlaceholder("입증된 금액 (원)").fill("600000000");
    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-result-value")).toContainText("400,000,000");
    await page.getByTestId("deemed-to-wizard").click();
    await expect(page).toHaveURL(/\/calc\/gift-tax/);
  });

  test("§45 미입증액 기준금액 미만 → 미적용", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await openDetail(page, "acquisition_fund_presumption");
    await page.getByPlaceholder("취득재산가액 (원)").fill("1000000000");
    await page.getByPlaceholder("입증된 금액 (원)").fill("850000000");
    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-result-value")).toContainText("0");
  });

  test("§45의2 명의신탁 증여의제 재산5억·조세회피목적 → 5억", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await openDetail(page, "nominee_trust");
    await page.getByPlaceholder("명의신탁 재산 가액 (원)").fill("500000000");
    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-result-value")).toContainText("500,000,000");
  });
});
