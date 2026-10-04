/**
 * E2E: 의제취득일 — 주식 1986.1.1.(영 §162⑦3호) / 기타자산 1985.1.1.(⑦1호), 입력 날짜는 그대로 저장
 *
 * 계획서 `docs/00-pm/stock-deemed-date-other-asset-and-conversion-citation.plan.md` (Y-1)
 *
 * 종전 화면은 1985.12.31. 이전 입력을 1986-01-01로 **바꿔 저장**했고 기타자산도 1986.1.1.로 의제했다.
 *   DD-1  비상장으로 1984-06-01 입력 → 안내 1986.1.1. · 입력칸은 1984 그대로
 *         → 시장을 기타자산으로 바꾸면(날짜 입력 «뒤») 안내가 1985.1.1. · §162⑦1호로 따라 바뀐다
 *         → 계산 요청 본문의 취득일 = 1984-06-01 · 결과 배지 「의제취득일적용(기타자산)」
 *
 * 정책: [[feedback_browser_verify_with_playwright]]
 */

import { test, expect, type Page } from "@playwright/test";
import { chooseAcqPerShare } from "./_helpers/stock-acq-input-mode";

async function gotoStockTransferTax(page: Page) {
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => sessionStorage.clear());
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  await page.getByPlaceholder("종목명을 입력하세요").waitFor({ state: "visible", timeout: 30_000 });
}

async function fillDate(page: Page, nth: number, iso: string) {
  const [y, m, d] = iso.split("-");
  await page.locator('input[type="text"][aria-label="연도"]').nth(nth).fill(y);
  await page.locator('input[type="text"][aria-label="월"]').nth(nth).fill(m);
  await page.locator('input[type="text"][aria-label="일"]').nth(nth).fill(d);
}

function fieldInput(page: Page, label: string) {
  return page.locator('[data-slot="field-card"]').filter({ hasText: label }).last().locator('input[type="text"]').first();
}

test("DD-1: 입력 날짜는 그대로 · 의제취득일은 분류로 파생 (주식 1986.1.1. → 기타자산 1985.1.1.)", async ({ page }) => {
  test.setTimeout(120_000);
  await gotoStockTransferTax(page);

  await page.getByPlaceholder("종목명을 입력하세요").fill("의제취득일테스트");
  await page.getByRole("radio", { name: "비상장" }).first().click();
  await fillDate(page, 0, "1984-06-01");

  // 비상장(§94①3호) — 의제취득일 1986.1.1. · 입력칸은 바뀌지 않는다
  const notice = page.getByTestId("deemed-acquisition-notice");
  await expect(notice).toContainText("1986.1.1.");
  await expect(notice).toContainText("§162⑦3호");
  await expect(page.locator('input[type="text"][aria-label="연도"]').first()).toHaveValue("1984");

  // 날짜 입력 «뒤»에 기타자산으로 바꾼다 — 종전이면 이미 1986-01-01로 덮어써져 되돌릴 수 없었다
  await page.getByRole("radio", { name: "기타자산" }).first().click();
  await expect(notice).toContainText("1985.1.1.");
  await expect(notice).toContainText("§162⑦1호");
  await expect(page.locator('input[type="text"][aria-label="연도"]').first()).toHaveValue("1984");

  await fillDate(page, 1, "2025-12-01");
  await fieldInput(page, "양도 주식수").fill("100");
  await fieldInput(page, "발행주식 총수").fill("1000");
  await page
    .locator('[data-slot="toggle-card"]')
    .filter({ hasText: "§94①4 라목 — 부동산과다보유법인" })
    .getByRole("switch")
    .first()
    .click();

  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByText("양도·취득가액").first()).toBeVisible({ timeout: 10_000 });
  await page.locator("div:has(> label:has-text('양도가액 합계')) input").first().fill("200000000");
  await chooseAcqPerShare(page);
  await page.locator("div:has(> label:has-text('1주당 취득가액')) input").first().fill("100000");

  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByRole("heading", { name: /필요경비/ }).first()).toBeVisible({ timeout: 10_000 });
  await fillDate(page, 0, "2026-02-28");

  const reqPromise = page.waitForRequest(
    (r) => r.url().includes("/api/calc/stock-transfer") && r.method() === "POST",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: "결과 보기" }).click();
  const body = (await reqPromise).postDataJSON() as Record<string, unknown>;
  // ④ — 원래 날짜가 그대로 간다(의제일은 엔진이 분류로 파생)
  expect(body.acquisitionDate).toBe("1984-06-01");

  await expect(page.getByText("의제취득일적용(기타자산)").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("의제취득일적용", { exact: true })).toHaveCount(0);
});
