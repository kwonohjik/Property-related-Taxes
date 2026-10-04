/**
 * E2E: 영 §163⑨ 추계 차단의 예외 — 장부분실(법 §99①4 후단 · 교재 사례 49) 입력 경로가 상속·증여에서도 열려 있다
 *
 * 계획서 `docs/00-pm/stock-163-9-valuation-unavailable-exception.plan.md` §1 · §3.3
 *
 *   BL-E1  1990-01-01 상속(의제취득일 «후») + 장부분실 → 환산 라디오 활성 · 토글 없이는 ⑧이 막고, 토글을 켜면
 *          취득가액 468,750,000 (= 6,000,000,000 × 12,500 ÷ 160,000). 종전엔 날짜만 달라 이 경로에 도달할 수 없었다
 *   BL-E2  같은 상속 + 매매사례 라디오는 비활성 (Q-3)
 *
 * 정책: [[feedback_browser_verify_with_playwright]]
 */

import { test, expect, type Page } from "@playwright/test";

async function gotoStockTransferTax(page: Page) {
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => sessionStorage.clear());
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  await page.getByPlaceholder("종목명을 입력하세요").waitFor({ state: "visible", timeout: 30_000 });
}

function cardInput(page: Page, label: string) {
  return page.locator('[data-slot="field-card"]').filter({ hasText: label }).locator("input").first();
}

async function fillStep1Inheritance(page: Page) {
  await page.getByPlaceholder("종목명을 입력하세요").fill("사례49상속");
  await page.getByRole("radio", { name: "비상장" }).first().click();
  const y = page.locator('input[type="text"][aria-label="연도"]');
  const m = page.locator('input[type="text"][aria-label="월"]');
  const d = page.locator('input[type="text"][aria-label="일"]');
  await y.nth(0).fill("1990"); await m.nth(0).fill("01"); await d.nth(0).fill("01");
  await y.nth(1).fill("2024"); await m.nth(1).fill("06"); await d.nth(1).fill("01");
  await page.getByRole("radio", { name: /^상속/ }).first().click();
  await cardInput(page, "양도 주식수").fill("8000");
  await cardInput(page, "발행주식 총수").fill("40000");
  // 상속 — 피상속인 취득일(§104②1 보유기간 기산점)
  const decedent = page.locator('[data-slot="field-card"]').filter({ hasText: "피상속인 취득일" });
  await decedent.locator('input[aria-label="연도"]').first().fill("1988");
  await decedent.locator('input[aria-label="월"]').first().fill("01");
  await decedent.locator('input[aria-label="일"]').first().fill("01");
  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByText("양도·취득가액").first()).toBeVisible({ timeout: 10_000 });
}

test("BL-E1: 상속 + 장부분실 — 환산 라디오가 열리고 토글을 켜야 계산된다 (사례 49 수치)", async ({ page }) => {
  test.setTimeout(120_000);
  await gotoStockTransferTax(page);
  await fillStep1Inheritance(page);

  await page.getByRole("textbox", { name: "양도가액 합계" }).fill("6000000000");

  // 안내 — 매매사례는 불가, 환산은 장부분실일 때만
  const notice = page.getByTestId("gift-valuation-only-notice");
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("취득시점 장부분실");
  await expect(page.getByRole("radio", { name: "환산취득가" })).toBeEnabled();

  // 환산을 골랐지만 토글을 켜지 않으면 ⑧이 막는다
  await page.getByRole("radio", { name: "환산취득가" }).click();
  await page.getByRole("textbox", { name: "1주당 순손익가치", exact: true }).fill("30000");
  await page.getByRole("textbox", { name: "1주당 순자산가치", exact: true }).fill("200000");
  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByText(/취득시점 장부분실/).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: /필요경비/ })).toHaveCount(0);

  // 장부분실 토글 + 액면가 → 통과
  await page.getByText("취득시점 장부분실 — 액면가 적용").first().click();
  await page.getByRole("textbox", { name: "1주당 액면가" }).fill("12500");
  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByRole("heading", { name: /필요경비/ }).first()).toBeVisible({ timeout: 10_000 });

  const y = page.locator('input[type="text"][aria-label="연도"]');
  const m = page.locator('input[type="text"][aria-label="월"]');
  const d = page.locator('input[type="text"][aria-label="일"]');
  await y.nth(0).fill("2024"); await m.nth(0).fill("08"); await d.nth(0).fill("31"); // 신고일
  await page.getByRole("button", { name: "결과 보기" }).click();

  // 취득가액 = 6,000,000,000 × 12,500 ÷ max(98,000, 160,000) = 468,750,000
  await expect(page.getByRole("row", { name: /11\. 취득가액.*468,750,000/ }).first()).toBeVisible({ timeout: 60_000 });
});

test("BL-E2: 상속 + 매매사례 라디오는 비활성 (장부분실이어도 — Q-3)", async ({ page }) => {
  test.setTimeout(90_000);
  await gotoStockTransferTax(page);
  await fillStep1Inheritance(page);
  await expect(page.getByRole("radio", { name: "매매사례가액" })).toBeDisabled();
  // 「실가」 라디오는 양도가액·취득가액 두 그룹에 있다 — 취득가액 그룹으로 한정
  await expect(page.locator('input[name="acquisitionMode"][value="actual"]')).toBeEnabled();
});
