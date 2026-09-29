import { test, expect, type Page } from "@playwright/test";

/**
 * E2E: §39①3호 전환주식 저가 다목 — 인수인 매입가(「상증령」§29④)는 **발행 시점 leg에만** 쓴다.
 * 전환: 10,000×100,000 · 전환가액 5,000 · 50,000 → 166,650,000
 * 발행: 10,000×100,000 · 발행가 7,000 · 50,000 → ㉯ 9,000 · 매입가 8,000이면 50,000,000(없으면 100,000,000)
 * ⇒ 116,650,000(매입가) / 66,650,000(공란). 규칙 anchor: `convertible-stock-underwriter-price.anchor.test.tsx`.
 */
async function fill(page: Page) {
  await page.goto("/calc/gift-deemed");
  await page.getByTestId("deemed-type-convertible_stock").click();
  const gd = page.getByTestId("deemed-detail-dialog").getByTestId("deemed-gift-date");
  await gd.getByLabel("연도").fill("2025");
  await gd.getByLabel("월").fill("3");
  await gd.getByLabel("일", { exact: true }).fill("15");
  await page.getByTestId("cs-subtype-third_party").click();
  for (const [ph, nw] of [["전환", "5000"], ["발행", "7000"]] as const) {
    await page.getByPlaceholder(`${ph} 증자 전 1주당 평가가액 (원)`).fill("10000");
    await page.getByPlaceholder(`${ph} 증자 전 발행주식총수`).fill("100000");
    await page.getByPlaceholder(ph === "전환" ? "전환 1주당 전환가액등 (원)" : "발행 신주 1주당 인수가액 (원)").fill(nw);
    await page.getByPlaceholder(`${ph} 증자 주식수`).fill("50000");
    await page.getByPlaceholder(`${ph} 직접배정 신주수`).fill("50000");
  }
  const w = page.getByTestId("cs-issuance-date");
  await w.getByLabel("연도").fill("2017");
  await w.getByLabel("월").fill("3");
  await w.getByLabel("일", { exact: true }).fill("2");
}

test("전환주식 저가 다목 · 발행 시점 매입가 8,000 → 116,650,000", async ({ page }) => {
  await fill(page);
  await page.getByPlaceholder("발행 인수인으로부터 취득한 1주당 가액 (원)").fill("8000");
  await page.getByTestId("deemed-detail-confirm").click();
  await page.getByTestId("deemed-calc-btn").click();
  await expect(page.getByTestId("deemed-result-value")).toContainText("116,650,000");
});

test("짝 — 매입가 공란이면 66,650,000 · 전환 시점 섹션에는 칸이 없다", async ({ page }) => {
  await fill(page);
  await expect(page.getByPlaceholder("전환 인수인으로부터 취득한 1주당 가액 (원)")).toHaveCount(0);
  await page.getByTestId("deemed-detail-confirm").click();
  await page.getByTestId("deemed-calc-btn").click();
  await expect(page.getByTestId("deemed-result-value")).toContainText("66,650,000");
});
