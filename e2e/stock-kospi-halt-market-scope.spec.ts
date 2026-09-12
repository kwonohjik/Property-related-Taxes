/**
 * E2E: 코스피 거래정지는 §165④ 보충평가로 가지 않는다 (영 §165③ 코스닥·코넥스 한정)
 *
 * 법령 근거와 두 논거(공백·잉여)는 단일 정본
 * `lib/tax-engine/stock-transfer/trading-halt-market-scope.ts` 머리말에 있다.
 *
 * 수정 전에는 ⑤·⑧·④·⑫ **네 층 어디에도 시장 게이트가 없어** 코스피에서 거래정지를 고르면
 * 취득가액이 실제로 갈렸다(5억 양도 실측: 200,000,000 → 204,166,666 / 196,000,000).
 *
 * 부정(코스피에서 못 고른다)만 두면 「전부 막아도」 통과하므로 긍정 짝을 함께 건다 —
 * 코스닥에서는 그대로 고를 수 있다. [[feedback_negative_anchor_needs_positive_twin]]
 */

import { test, expect, type Page } from "@playwright/test";

function cardInput(page: Page, label: string) {
  return page.locator('[data-slot="field-card"]').filter({ hasText: label }).locator("input").first();
}

async function gotoStep2(page: Page, market: "유가증권" | "코스닥") {
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => sessionStorage.clear());
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  await page.getByPlaceholder("종목명을 입력하세요").waitFor({ state: "visible", timeout: 30_000 });
  await page.getByPlaceholder("종목명을 입력하세요").fill("게이트");
  await page.getByRole("radio", { name: market }).first().click();
  const y = page.locator('input[type="text"][aria-label="연도"]');
  const m = page.locator('input[type="text"][aria-label="월"]');
  const d = page.locator('input[type="text"][aria-label="일"]');
  await y.nth(0).fill("2015"); await m.nth(0).fill("03"); await d.nth(0).fill("15");
  await y.nth(1).fill("2025"); await m.nth(1).fill("02"); await d.nth(1).fill("26");
  await cardInput(page, "양도 주식수").fill("10000");
  await cardInput(page, "발행주식 총수").fill("1000000");
  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByText("양도·취득가액").first()).toBeVisible({ timeout: 10_000 });
  await page.getByRole("radio", { name: "환산취득가" }).first().click();
}

const haltRadio = (page: Page, value: string) =>
  page.locator(`input[name="acquisitionStdMode"][value="${value}"]`);

test("코스피 — 거래정지 2모드가 막히고 사유가 보인다", async ({ page }) => {
  test.setTimeout(120_000);
  await gotoStep2(page, "유가증권");
  await expect(haltRadio(page, "halt_transfer")).toBeDisabled();
  await expect(haltRadio(page, "halt_acquisition")).toBeDisabled();
  // 형제는 살아 있다 — 좁히기가 이웃을 먹지 않았다
  await expect(haltRadio(page, "monthly_avg")).toBeEnabled();
  await expect(haltRadio(page, "post_listing")).toBeEnabled();
  // 왜 못 고르는지 화면이 말한다
  await expect(page.getByText(/코스닥·코넥스 상장법인에만 적용/).first()).toBeVisible();
});

test("코스닥 — 종전대로 고를 수 있다 (구별력 짝)", async ({ page }) => {
  test.setTimeout(120_000);
  await gotoStep2(page, "코스닥");
  await expect(haltRadio(page, "halt_transfer")).toBeEnabled();
  await expect(haltRadio(page, "halt_acquisition")).toBeEnabled();
  await haltRadio(page, "halt_transfer").click();
  await expect(haltRadio(page, "halt_transfer")).toBeChecked();
  await expect(page.getByText(/코스닥·코넥스 상장법인에만 적용/)).toHaveCount(0);
});
