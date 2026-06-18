import { test, expect, type Page } from "@playwright/test";

/** E2E: 증여로 보는 경우 — 자본거래 (Phase 2 핵심 + sub-case 토글) */

async function fillGiftDate(page: Page) {
  await page.getByLabel("연도").first().fill("2025");
  await page.getByLabel("월").first().fill("3");
  await page.getByLabel("일").first().fill("15");
}

test.describe("증여로 보는 경우 — 자본거래", () => {
  test("§40 전환사채 저가인수 시가10억·인수6억 → 4억", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await fillGiftDate(page);
    await page.getByTestId("deemed-type-convertible_bond").click();
    await page.getByPlaceholder("전환사채등 시가 (원)").fill("1000000000");
    await page.getByPlaceholder("인수·취득가액 (원)").fill("600000000");
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-result-value")).toContainText("400,000,000");
    await page.getByTestId("deemed-to-wizard").click();
    await expect(page).toHaveURL(/\/calc\/gift-tax/);
  });

  test("§39 증자 저가발행·실권주 재배정 → 33,330,000", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await fillGiftDate(page);
    await page.getByTestId("deemed-type-capital_increase").click();
    await page.getByPlaceholder("증자 전 1주당 평가가액 (원)").fill("10000");
    await page.getByPlaceholder("증자 전 발행주식총수").fill("100000");
    await page.getByPlaceholder("신주 1주당 인수가액 (원)").fill("5000");
    await page.getByPlaceholder("증자 주식수").fill("50000");
    await page.getByPlaceholder("배정받은 실권주수").fill("10000");
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-result-value")).toContainText("33,330,000");
  });

  test("§39 증자 고가발행 나목(실권주 미배정·비율가중) → 60,003,000", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await fillGiftDate(page);
    await page.getByTestId("deemed-type-capital_increase").click();
    await page.getByTestId("ci-direction-high").click();
    await page.getByTestId("ci-subtype-no_realloc").click();
    await page.getByPlaceholder("증자 전 1주당 평가가액 (원)").fill("10000");
    await page.getByPlaceholder("증자 전 발행주식총수").fill("100000");
    await page.getByPlaceholder("신주 1주당 인수가액 (원)").fill("20000");
    await page.getByPlaceholder("증자 주식수").fill("50000");
    await page.getByPlaceholder("실권주수").fill("30000");
    await page.getByPlaceholder("특수관계인이 인수한 신주수").fill("15000");
    await page.getByPlaceholder("분모 신주수").fill("50000");
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-result-value")).toContainText("60,003,000");
  });

  test("§40 전환사채 양도 양도6억·시가5억 → 1억", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await fillGiftDate(page);
    await page.getByTestId("deemed-type-convertible_bond").click();
    await page.getByTestId("cb-case-transfer").click();
    await page.getByPlaceholder("전환사채등 시가 (원)").fill("500000000");
    await page.getByPlaceholder("양도가액 (원)").fill("600000000");
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-result-value")).toContainText("100,000,000");
  });
});
