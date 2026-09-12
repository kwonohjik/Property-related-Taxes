/**
 * E2E: 액면가 취득가액 모드 (§99①4 장부분실)
 *
 * 종전에는 `FaceValueBlock`이 라디오 「액면가 (장부분실)」와 **의미가 같은**
 * ToggleCard(`bookLost`)를 한 번 더 물었고, ⑧이 그 토글 ON을 필수로 강제했다
 * (`stock-transfer-tax-validate-step2.ts`). 정보량 0인 중복 입력이라 제거하고
 * `bookLost`를 ④에서 `acquisitionMode === "face_value"`로 파생시켰다.
 *
 * 이 spec은 UI 쪽 짝이다 — ④ 파생 자체는 AP-FV-6 anchor가 고정한다
 * (`__tests__/calc/stock-api-plumbing-strip.anchor.test.ts`).
 *
 * 부정 단언(「토글이 없다」)만 두면 구별력이 0이므로 긍정 짝을 함께 건다:
 * 액면가 모드가 토글 없이 2단계를 **실제로 통과**하고 양도기준시가 미리보기가 선다.
 * [[feedback_negative_anchor_needs_positive_twin]] · [[feedback_browser_verify_with_playwright]]
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

test("액면가 모드 — 토글 없이 진행된다", async ({ page }) => {
  test.setTimeout(120_000);
  await gotoStockTransferTax(page);
  await page.getByPlaceholder("종목명을 입력하세요").fill("액면가테스트");
  await page.getByRole("radio", { name: "비상장" }).first().click();
  const y = page.locator('input[type="text"][aria-label="연도"]');
  const m = page.locator('input[type="text"][aria-label="월"]');
  const d = page.locator('input[type="text"][aria-label="일"]');
  await y.nth(0).fill("2015"); await m.nth(0).fill("03"); await d.nth(0).fill("15");
  await y.nth(1).fill("2025"); await m.nth(1).fill("02"); await d.nth(1).fill("26");
  await cardInput(page, "양도 주식수").fill("10000");
  await cardInput(page, "발행주식 총수").fill("100000");
  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByText("양도·취득가액").first()).toBeVisible({ timeout: 10_000 });

  await page.getByRole("textbox", { name: "양도가액 합계" }).fill("500000000");

  await page.getByRole("radio", { name: /액면가/ }).first().click();

  // 토글이 사라졌다
  await expect(page.getByText("장부 분실·멸실 확인")).toHaveCount(0);

  await page.getByRole("textbox", { name: "1주당 액면가" }).fill("5000");
  await page.getByRole("textbox", { name: "1주당 순손익가치" }).fill("10000");
  await page.getByRole("textbox", { name: "1주당 순자산가치" }).fill("10000");
  await expect(page.getByText("양도기준시가 = 10,000원")).toBeVisible();

  // 토글 없이도 다음 단계로 통과한다 (종전엔 error 차단)
  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByRole("heading", { name: /필요경비/ }).first()).toBeVisible({ timeout: 10_000 });
});
