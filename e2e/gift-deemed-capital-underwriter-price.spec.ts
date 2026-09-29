import { test, expect, type Page } from "@playwright/test";

/**
 * E2E: §39 저가 다목 인수인 경유(「상증령」§29④) — 인수인에게 지급한 1주당 가액을 차감항에만 쓴다.
 * 증자 전 10,000 × 100,000주 · 발행가 5,000 · 신주 50,000 · 매입가 6,000 → ㉯ 8,333(발행가 기준) → 116,650,000.
 * 규칙 anchor: `__tests__/tax-engine/gift-deemed/capital-increase-underwriter-price.anchor.test.tsx`.
 */
async function fillThirdParty(page: Page) {
  await page.goto("/calc/gift-deemed");
  await page.getByTestId("deemed-type-capital_increase").click();
  const gd = page.getByTestId("deemed-detail-dialog").getByTestId("deemed-gift-date");
  await gd.getByLabel("연도").fill("2025");
  await gd.getByLabel("월").fill("3");
  await gd.getByLabel("일", { exact: true }).fill("15");
  await page.getByTestId("ci-subtype-third_party").click();
  await page.getByLabel("증자 전 1주당 평가가액", { exact: true }).fill("10000");
  await page.getByPlaceholder("증자 전 발행주식총수").fill("100000");
  await page.getByLabel("신주 1주당 인수가액", { exact: true }).fill("5000");
  await page.getByPlaceholder("증자 주식수").fill("50000");
  await page.getByPlaceholder("직접배정 신주수").fill("50000");
}

test("저가 다목 · 인수인 매입가 6,000 → 116,650,000", async ({ page }) => {
  await fillThirdParty(page);
  await page.getByLabel("인수인으로부터 취득한 1주당 가액", { exact: true }).fill("6000");
  await page.getByTestId("deemed-detail-confirm").click();
  await page.getByTestId("deemed-calc-btn").click();
  await expect(page.getByTestId("deemed-result-value")).toContainText("116,650,000");
});

test("짝 — 매입가를 비우면 발행가로 차감 → 166,650,000", async ({ page }) => {
  await fillThirdParty(page);
  await page.getByTestId("deemed-detail-confirm").click();
  await page.getByTestId("deemed-calc-btn").click();
  await expect(page.getByTestId("deemed-result-value")).toContainText("166,650,000");
});
