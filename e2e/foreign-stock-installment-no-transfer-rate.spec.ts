/**
 * E2E: 국외주식 장기할부 분할 수령 — 양도일 기준환율 칸 없이 계산 (계획서 F-1 · V-2)
 *
 * 분할 수령 모드는 양도일 기준환율 칸을 **숨기고** ⑧도 그 칸을 검증하지 않는다. 그런데 ⑫ Zod가
 * `transferExchangeRate`를 필수로 받아, 단일 수령 값이 남아 있지 않은 신규 입력은 「화면 통과 ↔ API 400」이었다.
 *
 * - FIR-1: 필요경비 없이 분할 수령만 → 200 · body에 `transferExchangeRate` 없음 · 결과 화면 도달
 * - FIR-2: 양도비 금액만 넣고 지출일 환율을 비우면 → 대신 쓸 양도일 환율이 없으므로 **3단계에서 막힌다**
 *   (⑧ 통과 ↔ 엔진 «환율 미입력 불가» 400의 형제 모순 — 같은 PR에서 닫는다)
 */

import { test, expect, type Page } from "@playwright/test";

// 헬퍼는 `foreign-stock-expense-exchange-rate.spec.ts`와 같은 구현이다.
async function gotoStockTransferTax(page: Page) {
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => sessionStorage.clear());
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  await page.getByPlaceholder("종목명을 입력하세요").waitFor({ state: "visible", timeout: 30_000 });
}

async function fillByLabel(page: Page, label: string, value: string) {
  await page
    .locator(`div:has(> label:has-text('${label}')) input[type="text"]`)
    .first()
    .fill(value);
}

async function fillDate(page: Page, nth: number, y: string, m: string, d: string) {
  await page.locator('input[type="text"][aria-label="연도"]').nth(nth).fill(y);
  await page.locator('input[type="text"][aria-label="월"]').nth(nth).fill(m);
  await page.locator('input[type="text"][aria-label="일"]').nth(nth).fill(d);
}

/** 1단계 → 2단계(분할 수령 2건) → 3단계 진입 */
async function reachStep3Installments(page: Page) {
  await gotoStockTransferTax(page);
  await page.getByPlaceholder("종목명을 입력하세요").fill("FX Corp");
  await page.getByRole("radio", { name: "해외주식" }).first().click();
  await fillByLabel(page, "국내 거주 연수", "10");
  await fillDate(page, 0, "2021", "03", "15");
  await fillDate(page, 1, "2025", "09", "30");
  await fillByLabel(page, "양도 주식수", "1000");

  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByText("양도가액 — 원화 환산 (§178의5)")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("radio", { name: /장기할부 분할 수령/ }).click();
  // 양도일 기준환율 칸은 분할 수령 모드에서 보이지 않는다 — 이 spec의 전제
  await expect(page.locator(`div:has(> label:has-text('양도일 기준환율')) input[type="text"]`)).toHaveCount(0);

  // 수령 2건: 100,000 USD @1,300 · 100,000 USD @1,350 (2단계에는 이 두 행 외에 날짜 칸이 없다)
  await fillDate(page, 0, "2025", "09", "30");
  await fillDate(page, 1, "2026", "10", "30");
  const amounts = page.getByPlaceholder("수령액 (USD)");
  const rates = page.getByPlaceholder("기준환율", { exact: true });
  await amounts.nth(0).fill("100000");
  await rates.nth(0).fill("1300");
  await amounts.nth(1).fill("100000");
  await rates.nth(1).fill("1350");

  await fillByLabel(page, "취득일 기준환율", "1000");
  await fillByLabel(page, "1주당 취득가액 (외화)", "100");

  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByText("필요경비·신고").first()).toBeVisible({ timeout: 10_000 });
  await fillDate(page, 0, "2025", "11", "30");
}

test.describe("국외주식 장기할부 분할 수령 — 양도일 환율 칸 없이 (F-1)", () => {
  test("FIR-1: 필요경비 없이 분할 수령만 입력하면 계산된다", async ({ page }) => {
    test.setTimeout(120_000);
    await reachStep3Installments(page);

    const calcResponse = page.waitForResponse(
      (r) => r.url().includes("/api/calc/stock-transfer") && r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: "결과 보기" }).click();
    const resp = await calcResponse;
    const reqBody = JSON.parse(resp.request().postData() ?? "{}");
    expect(reqBody.transferReceiptMode).toBe("installments");
    expect(reqBody.transferExchangeRate).toBeUndefined();
    expect(resp.status(), await resp.text()).toBe(200);

    // 130,000,000 + 135,000,000
    const json = await resp.json();
    expect(json.result.transferPriceKrw).toBe(265_000_000);
    await expect(page.getByText("2회 분할 수령 합산")).toBeVisible({ timeout: 30_000 });
  });

  test("FIR-2: 양도비 지출일 환율을 비우면 3단계에서 막힌다 (대신 쓸 양도일 환율이 없다)", async ({ page }) => {
    test.setTimeout(120_000);
    await reachStep3Installments(page);

    await fillByLabel(page, "양도비 (외화)", "1000");
    await page.getByRole("button", { name: "결과 보기" }).click();
    await expect(page.getByText(/양도비 지출일 기준환율을 입력하세요/).first()).toBeVisible({ timeout: 10_000 });

    // 긍정 짝 — 환율을 넣으면 계산된다
    await fillByLabel(page, "양도비 지출일 기준환율", "1320");
    const calcResponse = page.waitForResponse(
      (r) => r.url().includes("/api/calc/stock-transfer") && r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: "결과 보기" }).click();
    const resp = await calcResponse;
    expect(resp.status(), await resp.text()).toBe(200);
    const json = await resp.json();
    expect(json.result.necessaryExpensesKrw).toBe(1_320_000);
  });
});
