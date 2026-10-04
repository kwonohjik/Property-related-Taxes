/**
 * E2E: 기타자산(주식등) 환산취득가 — 비상장 보충평가 경로 (영 §165⑧1호 → 법 §99①4 → 영 §165④)
 *
 * 계획서 `docs/00-pm/stock-other-asset-estimated-supplementary-valuation.plan.md` §1 · §4
 *
 *   OA-E1  기타자산(라목) + 환산(장부 있음) → 신고서 11행 취득가액 600,000,000
 *          종전: 상장 종가평균 경로로 낙하해 취득가액 0 (입력한 순손익·순자산이 버려졌다)
 *   OA-E2  기타자산(라목) + 환산 + 취득시점 장부분실 → 468,750,000
 *          종전: 토글이 숨긴 취득연도 칸을 ⑫가 요구해 «결과 보기»가 막혔다 (막다른 길)
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

/** 기타자산(§94①4 라목) · 1990 매수 · 양도 2024-06-01 · 8,000주 */
async function fillStep1OtherAsset(page: Page) {
  await page.getByRole("radio", { name: "기타자산" }).first().click();
  await page.getByPlaceholder("종목명을 입력하세요").fill("부동산과다보유법인");
  const y = page.locator('input[type="text"][aria-label="연도"]');
  const m = page.locator('input[type="text"][aria-label="월"]');
  const d = page.locator('input[type="text"][aria-label="일"]');
  await y.nth(0).fill("1990"); await m.nth(0).fill("01"); await d.nth(0).fill("01");
  await y.nth(1).fill("2024"); await m.nth(1).fill("06"); await d.nth(1).fill("01");
  await cardInput(page, "양도 주식수").fill("8000");
  await cardInput(page, "발행주식 총수").fill("40000");
  // §94①4 라목 — 부동산과다보유법인 (양도비율 요건 없음)
  await page.getByText("§94①4 라목 — 부동산과다보유법인").first().click();
  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByText("양도·취득가액").first()).toBeVisible({ timeout: 10_000 });
}

async function toResult(page: Page) {
  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByRole("heading", { name: /필요경비/ }).first()).toBeVisible({ timeout: 10_000 });
  const y = page.locator('input[type="text"][aria-label="연도"]');
  const m = page.locator('input[type="text"][aria-label="월"]');
  const d = page.locator('input[type="text"][aria-label="일"]');
  await y.nth(0).fill("2024"); await m.nth(0).fill("08"); await d.nth(0).fill("31"); // 신고일
  await page.getByRole("button", { name: "결과 보기" }).click();
}

test("OA-E1: 기타자산 환산(장부 있음) — 비상장 보충평가로 취득가액 600,000,000 (종전 0)", async ({ page }) => {
  test.setTimeout(120_000);
  await gotoStockTransferTax(page);
  await fillStep1OtherAsset(page);

  await page.getByRole("textbox", { name: "양도가액 합계" }).fill("6000000000");
  await page.getByRole("radio", { name: "환산취득가" }).click();
  // 양도·취득연도 순손익·순자산 — 기타자산 화면도 이 칸을 입력받는다 (엔진이 이제 읽는다)
  await page.getByRole("textbox", { name: "1주당 순손익가치", exact: true }).first().fill("30000");
  await page.getByRole("textbox", { name: "1주당 순자산가치", exact: true }).first().fill("200000");
  await page.getByRole("textbox", { name: "1주당 순손익가치 (취득시점)", exact: true }).fill("5000");
  await page.getByRole("textbox", { name: "1주당 순자산가치 (취득시점)", exact: true }).fill("20000");

  await toResult(page);

  // 취득가액 = 6,000,000,000 × max(11,000, 16,000) ÷ max(98,000, 160,000) = 600,000,000
  await expect(page.getByRole("row", { name: /11\. 취득가액.*600,000,000/ }).first()).toBeVisible({ timeout: 60_000 });
});

test("OA-E2: 기타자산 환산 + 취득시점 장부분실 — ⑫가 막지 않고 468,750,000 (종전: 막다른 길)", async ({ page }) => {
  test.setTimeout(120_000);
  await gotoStockTransferTax(page);
  await fillStep1OtherAsset(page);

  await page.getByRole("textbox", { name: "양도가액 합계" }).fill("6000000000");
  await page.getByRole("radio", { name: "환산취득가" }).click();
  await page.getByRole("textbox", { name: "1주당 순손익가치", exact: true }).first().fill("30000");
  await page.getByRole("textbox", { name: "1주당 순자산가치", exact: true }).first().fill("200000");
  // 장부분실 토글 — 취득시점 순손익·순자산 칸이 사라진다
  await page.getByText("취득시점 장부분실 — 액면가 적용").first().click();
  await page.getByRole("textbox", { name: "1주당 액면가" }).fill("12500");

  // 요청 본문에 토글·액면가가 실린다 (종전: ④가 기타자산에는 싣지 않았다)
  const req = page.waitForRequest(
    (r) => r.url().includes("/api/calc/stock-transfer") && r.method() === "POST",
    { timeout: 30_000 },
  );
  await toResult(page);
  const body = (await req).postDataJSON() as Record<string, unknown>;
  expect(body.acqFaceValueOnly).toBe(true);
  expect(body.acqFaceValuePerShare).toBe(12500);

  await expect(page.getByRole("row", { name: /11\. 취득가액.*468,750,000/ }).first()).toBeVisible({ timeout: 60_000 });
});
