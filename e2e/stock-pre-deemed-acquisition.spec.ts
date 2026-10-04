/**
 * E2E: 의제취득일 전 매수 — 영 §176의2④ 「많은 것」 (① 의제취득일 현재 가액 vs ② 실가 + 생산자물가상승분)
 *
 * 계획서 `docs/00-pm/stock-pre-deemed-acquisition-176-2-4.plan.md`
 *
 *   PD-E1  실가 모드 — 비상장 1975-06-01 매수 · 실가 10,000/주 × 1,000주 → 취득가액 28,716,638 (입력 실가 10,000,000 아님)
 *          Step 2에 카드 · 요청 본문에 신규 필드 없음 · 결과 카드 · 배지 · 신고서 11행 라벨 · 필요경비 실비(개산공제 없음)
 *   PD-E2  매매사례 모드 + 취득 당시 실가 — ① 60,000,000 > ② 12,910,390(1980-06) → ① 채택 · 개산공제 · 요청 본문에 실가 전송
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

function cardInput(page: Page, label: string) {
  return page.locator('[data-slot="field-card"]').filter({ hasText: label }).locator("input").first();
}

async function fillStep1(page: Page, acqY: string, acqM: string) {
  await page.getByPlaceholder("종목명을 입력하세요").fill("의제취득일전매수");
  await page.getByRole("radio", { name: "비상장" }).first().click();
  const y = page.locator('input[type="text"][aria-label="연도"]');
  const m = page.locator('input[type="text"][aria-label="월"]');
  const d = page.locator('input[type="text"][aria-label="일"]');
  await y.nth(0).fill(acqY); await m.nth(0).fill(acqM); await d.nth(0).fill("01");
  await y.nth(1).fill("2025"); await m.nth(1).fill("12"); await d.nth(1).fill("01");
  await cardInput(page, "양도 주식수").fill("1000");
  await cardInput(page, "발행주식 총수").fill("10000");
  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByText("양도·취득가액").first()).toBeVisible({ timeout: 10_000 });
}

async function toResult(page: Page) {
  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByRole("heading", { name: /필요경비/ }).first()).toBeVisible({ timeout: 10_000 });
  const y = page.locator('input[type="text"][aria-label="연도"]');
  const m = page.locator('input[type="text"][aria-label="월"]');
  const d = page.locator('input[type="text"][aria-label="일"]');
  await y.nth(0).fill("2026"); await m.nth(0).fill("02"); await d.nth(0).fill("28"); // 신고일
  const req = page.waitForRequest(
    (r) => r.url().includes("/api/calc/stock-transfer") && r.method() === "POST",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: "결과 보기" }).click();
  return (await req).postDataJSON() as Record<string, unknown>;
}

test("PD-E1: 실가 모드 — 1975-06 매수 실가에 생산자물가상승분이 붙는다 (영 §176의2④2호)", async ({ page }) => {
  test.setTimeout(120_000);
  await gotoStockTransferTax(page);
  await fillStep1(page, "1975", "06");

  await page.getByRole("textbox", { name: "양도가액 합계" }).fill("200000000");
  // 카드 — 의제취득일 전 매수 안내 (실가 모드는 별도 실가 칸 없이 아래 실가가 ②의 기준)
  const card = page.getByTestId("pre-deemed-acquisition-card");
  await expect(card).toBeVisible();
  await expect(card).toContainText("영 §176의2④");
  await expect(page.getByTestId("pre-deemed-actual-note")).toBeVisible();
  await expect(page.getByTestId("pre-deemed-ppi-ratio")).toHaveCount(0); // 1965.01 이후라 표로 산정

  await chooseAcqPerShare(page);
  await page.locator("div:has(> label:has-text('1주당 취득가액')) input").first().fill("10000");

  const body = await toResult(page);
  // ④ — 실가 모드는 신규 필드를 싣지 않는다
  expect(body).not.toHaveProperty("preDeemedActualPricePerShare");
  expect(body).not.toHaveProperty("preDeemedPpiRatio");

  // 결과 — ② 28,716,638 (= 10,000,000 × 지수 50.57 ÷ 17.61 의 절사) · 개산공제 없음
  await expect(page.getByTestId("pre-deemed-result-card")).toContainText("28,716,638", { timeout: 60_000 });
  await expect(page.getByTestId("pre-deemed-result-card")).toContainText("← 채택");
  await expect(page.getByRole("row", { name: /11\. 취득가액 \(② = 실가 \+ 생산자물가상승분.*28,716,638/ }).first()).toBeVisible();
  // 신고서 17행은 늘 있되 ② 채택이면 값이 «-» (개산공제 없음 — 법 §97②1호 나목 실가 방식) · 양도차익 = 200,000,000 − 28,716,638
  await expect(page.getByRole("row", { name: /17\. 개산공제 §163⑥4 \(취득기준시가 × 1%\)\s+-$/ }).first()).toBeVisible();
  await expect(page.getByRole("row", { name: /18\. 양도차익.*171,283,362/ }).first()).toBeVisible();
  await expect(page.getByText("의제취득일물가상승가산").first()).toBeVisible();
});

test("PD-E2: 매매사례 모드 + 취득 당시 실가 — ①이 크면 ① 채택(개산공제), 실가는 요청에 실린다", async ({ page }) => {
  test.setTimeout(120_000);
  await gotoStockTransferTax(page);
  await fillStep1(page, "1980", "06");

  await page.getByRole("textbox", { name: "양도가액 합계" }).fill("200000000");
  await page.getByRole("radio", { name: "매매사례가액" }).first().click();
  await page.getByRole("textbox", { name: "1주당 취득 매매사례가액" }).fill("60000");
  await page.getByRole("textbox", { name: "1주당 순손익가치 (취득시점)", exact: true }).fill("10000");
  await page.getByRole("textbox", { name: "1주당 순자산가치 (취득시점)", exact: true }).fill("10000");

  // 취득 당시 실가 칸(선택) — ②와 ①을 견준다
  const card = page.getByTestId("pre-deemed-acquisition-card");
  await expect(card).toContainText("취득 당시 실지거래가액 (1주당, 선택)");
  await card.locator("input").first().fill("10000");

  const body = await toResult(page);
  expect(body.preDeemedActualPricePerShare).toBe(10000);

  // ① 60,000 × 1,000주 = 60,000,000 > ② 12,910,390 → ① 채택
  const result = page.getByTestId("pre-deemed-result-card");
  await expect(result).toContainText("60,000,000", { timeout: 60_000 });
  await expect(result).toContainText("12,910,390");
  await expect(result).toContainText("개산공제");
  await expect(page.getByRole("row", { name: /11\. 취득가액.*60,000,000/ }).first()).toBeVisible();
  await expect(page.getByRole("row", { name: /17\. 개산공제 §163⑥4.*100,000/ }).first()).toBeVisible();
});
