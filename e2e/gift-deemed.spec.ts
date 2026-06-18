import { test, expect, type Page } from "@playwright/test";

/**
 * E2E: 증여로 보는 경우 (gift-deemed) Phase 1
 * 유형 선택 → 상세 입력 → 증여이익 산정 → 세액연결 이관.
 * CurrencyInput은 label htmlFor 미연결 → getByPlaceholder 사용. DateInput은 aria-label 사용.
 */

async function fillGiftDate(page: Page) {
  await page.getByLabel("연도").first().fill("2025");
  await page.getByLabel("월").first().fill("3");
  await page.getByLabel("일").first().fill("15");
}

test.describe("증여로 보는 경우 (gift-deemed)", () => {
  test("§35 저가양수 특수관계 시가10억·대가6억 → 1억 + 증여세 연결", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await fillGiftDate(page);
    await page.getByTestId("deemed-type-bargain_transfer").click();
    await page.getByPlaceholder("시가 (원)").fill("1000000000");
    await page.getByPlaceholder("거래대가 (원)").fill("600000000");
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-result-value")).toContainText("100,000,000");
    await page.getByTestId("deemed-to-wizard").click();
    await expect(page).toHaveURL(/\/calc\/gift-tax/);
  });

  test("§34 보험금 1호 보험금1억·총1천만·타인600만 → 6,000만", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await fillGiftDate(page);
    await page.getByTestId("deemed-type-insurance").click();
    await page.getByPlaceholder("보험금 (원)").fill("100000000");
    await page.getByPlaceholder("납부보험료 총액 (원)").fill("10000000");
    await page.getByPlaceholder("관련 보험료 (원)").fill("6000000");
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-result-value")).toContainText("60,000,000");
  });

  test("§35 임계미달 시가10억·대가8억 → 미적용 배너", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await fillGiftDate(page);
    await page.getByTestId("deemed-type-bargain_transfer").click();
    await page.getByPlaceholder("시가 (원)").fill("1000000000");
    await page.getByPlaceholder("거래대가 (원)").fill("800000000");
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-exclusion")).toBeVisible();
  });
});
