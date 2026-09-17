/**
 * E2E: 주식 **취득가액 「합계 직접 입력」** (`acquisitionActualInputMode: "total"`)
 *
 * ## 왜 E2E여야 하는가
 *
 * ④⑬(폼 → body) · ⑫(Zod) · ⑭(route → 엔진)는 **TypeScript가 못 잡는 구간**이고, 한 곳만
 * 빠져도 total 모드가 **조용히 1주당 단가로 되돌아간다** — 화면은 멀쩡하고 아무 테스트도
 * 빨개지지 않는다. 엔진 anchor는 엔진 input을 직접 만들어 넣으므로 그 구간을 보지 못한다
 * ([[feedback_leaf_anchor_skips_zod_layer]]).
 *
 * ⚠️ **라벨로 클릭하지 않는다.** 「합계 직접 입력」은 양도가액 축에도 있어 화면에 두 번 뜬다 —
 *   `input[name="acquisitionActualInputMode"]`로 스코프한다.
 *
 * 실행: npx playwright test e2e/stock-acquisition-total-input.spec.ts
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

/** Step1 — 코스닥 · 취득 2020-01-01 / 양도 2025-07-01 · 4,000주 */
async function fillStep1(page: Page) {
  await page.getByPlaceholder("종목명을 입력하세요").fill("합계입력주식");
  await page.getByRole("radio", { name: "코스닥" }).first().click();
  const y = page.locator('input[type="text"][aria-label="연도"]');
  const m = page.locator('input[type="text"][aria-label="월"]');
  const d = page.locator('input[type="text"][aria-label="일"]');
  await y.nth(0).fill("2020");
  await m.nth(0).fill("01");
  await d.nth(0).fill("01");
  await y.nth(1).fill("2025");
  await m.nth(1).fill("07");
  await d.nth(1).fill("01");
  await page.locator('[data-slot="field-card"]').filter({ hasText: "양도 주식수" }).locator("input").first().fill("4000");
  await page.locator('[data-slot="field-card"]').filter({ hasText: "발행주식 총수" }).locator("input").first().fill("10000000");
}

/** 취득가액 실가 — 입력 방식 라디오를 **그룹 이름으로** 고른다 */
const acqMode = (page: Page, value: string) =>
  page.locator(`input[name="acquisitionActualInputMode"][value="${value}"]`);

test.describe("주식 취득가액 — 합계 직접 입력", () => {
  test("AT-E1: 🔴 합계를 넣으면 **그 금액 그대로** 취득가액이 된다", async ({ page }) => {
    test.setTimeout(120_000);
    await gotoStockTransferTax(page);
    await fillStep1(page);

    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByText("양도·취득가액").first()).toBeVisible({ timeout: 10_000 });

    // 양도가액 합계 (기본값이 total)
    await page.locator(`div:has(> label:has-text('양도가액 합계')) input[type="text"]`).first().fill("39000000");

    // 취득가액 입력 방식 → 합계 직접 입력
    await acqMode(page, "total").check();
    // 4,000주로 나누어떨어지지 «않는» 값 — 역산이 끼어들면 총액이 달라진다
    await page.locator(`div:has(> label:has-text('취득가액 합계')) input[type="text"]`).first().fill("21000003");

    // 역산 참고가 「정확히 떨어지지 않음」으로 뜬다 (총액이 정본임을 알린다)
    await expect(page.getByText(/정확히 떨어지지 않음/)).toBeVisible();

    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByText("필요경비·신고").first()).toBeVisible({ timeout: 10_000 });
    await page.locator('input[type="text"][aria-label="연도"]').nth(0).fill("2025");
    await page.locator('input[type="text"][aria-label="월"]').nth(0).fill("08");
    await page.locator('input[type="text"][aria-label="일"]').nth(0).fill("31");

    const calcResponse = page.waitForResponse(
      (r) => r.url().includes("/api/calc/stock-transfer") && r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: "결과 보기" }).click();
    const resp = await calcResponse;
    const json = await resp.json();

    // 🔴 배선이 한 곳이라도 빠지면 20,000,000(= floor(21,000,003/4,000) × 4,000) 근처로 떨어진다
    expect(json.result.acquisitionPrice).toBe(21_000_003);
    expect(json.result.transferPrice).toBe(39_000_000);
  });

  test("AT-E2: 계산 전에도 사이드바가 취득가액을 보여 준다", async ({ page }) => {
    test.setTimeout(120_000);
    await gotoStockTransferTax(page);
    await fillStep1(page);
    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByText("양도·취득가액").first()).toBeVisible({ timeout: 10_000 });

    await acqMode(page, "total").check();
    await page.locator(`div:has(> label:has-text('취득가액 합계')) input[type="text"]`).first().fill("21000000");

    // 종전에는 total 이 어느 분기에도 안 걸려 **항상 0**이었다(사이드바가 항목을 숨겼다).
    await expect(page.getByText("취득가액").last()).toBeVisible();
    await expect(page.getByText("21,000,000").first()).toBeVisible();
  });
});
