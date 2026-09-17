/**
 * E2E: 국외주식 필요경비 **지출일 기준환율** (영 §178의5①)
 *
 * 계획: 제보 —「자본적 지출액, 필요경비를 외화로 입력하는데 원화로 환산하는 환율이 없네」
 *
 * ## 무엇을 증명하는가
 *
 * 엔진 anchor(`foreign-expense-exchange-rate.predo.anchor.test.ts`)는 **엔진 함수에서 출발**하므로
 * 「사용자가 그 값을 넣을 수 있는가」를 증명하지 못한다. 종전에는 UI 에 칸이 아예 없어
 * 엔진만 고쳤다면 **입력 경로 없는 no-op** 이 됐을 것이다.
 *
 * ⇒ 이 spec 은 폼 → body → 세액 → 결과 카드까지 **실제 경로**를 따라간다.
 *
 * 🔑 환율 칸은 **금액을 넣었을 때만** 나타난다. 부정형 단언(「없다」)만 두면 칸이 영원히
 *   안 나와도 초록이므로, **긍정 짝**(넣으면 나타난다)을 함께 둔다
 *   ([[feedback_negative_anchor_needs_positive_twin]]).
 */

import { test, expect, type Page } from "@playwright/test";

// 🔑 헬퍼는 `foreign-stock-94-1-3-da-track.spec.ts` 와 **같은 구현**이다 — 해외주식 진입은
//   sessionStorage 를 비우고 두 번 goto 해야 이전 spec 의 폼이 남지 않는다.
async function gotoStockTransferTax(page: Page) {
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => sessionStorage.clear());
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  await page.getByPlaceholder("종목명을 입력하세요").waitFor({ state: "visible", timeout: 30_000 });
}

/** FieldCard 라벨로 텍스트 입력 — 주식 spec 공통 셀렉터 */
async function fillByLabel(page: Page, label: string, value: string) {
  await page
    .locator(`div:has(> label:has-text('${label}')) input[type="text"]`)
    .first()
    .fill(value);
}

async function reachStep3(page: Page) {
  await gotoStockTransferTax(page);
  await page.getByPlaceholder("종목명을 입력하세요").fill("FX Corp");
  await page.getByRole("radio", { name: "해외주식" }).first().click();
  await fillByLabel(page, "국내 거주 연수", "10");

  const y = page.locator('input[type="text"][aria-label="연도"]');
  const m = page.locator('input[type="text"][aria-label="월"]');
  const d = page.locator('input[type="text"][aria-label="일"]');
  await y.nth(0).fill("2021");
  await m.nth(0).fill("03");
  await d.nth(0).fill("15");
  await y.nth(1).fill("2025");
  await m.nth(1).fill("09");
  await d.nth(1).fill("30");
  await fillByLabel(page, "양도 주식수", "1000");

  // Step 2 — 양도일 환율 1,000 / 취득일 환율 1,000
  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByText("양도가액 — 원화 환산 (§178의5)")).toBeVisible({ timeout: 10_000 });
  await fillByLabel(page, "양도일 기준환율", "1000");
  await fillByLabel(page, "1주당 양도가액 (외화)", "200");
  await fillByLabel(page, "취득일 기준환율", "1000");
  await fillByLabel(page, "1주당 취득가액 (외화)", "100");

  // Step 3
  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByText("필요경비·신고").first()).toBeVisible({ timeout: 10_000 });
  await page.locator('input[type="text"][aria-label="연도"]').nth(0).fill("2025");
  await page.locator('input[type="text"][aria-label="월"]').nth(0).fill("11");
  await page.locator('input[type="text"][aria-label="일"]').nth(0).fill("30");
}

test.describe("국외주식 필요경비 — 지출일 기준환율 (영 §178의5①)", () => {
  test("FXE-1: 금액을 넣어야 환율 칸이 나타난다 (부정 + 긍정 짝)", async ({ page }) => {
    test.setTimeout(120_000);
    await reachStep3(page);

    // 부정 — 금액이 0이면 물어볼 이유가 없다
    await expect(page.getByText("자본적지출 지출일 기준환율")).toHaveCount(0);
    await expect(page.getByText("양도비 지출일 기준환율")).toHaveCount(0);

    // 긍정 짝 — 넣으면 나타난다 (이 단언이 없으면 칸이 영원히 안 나와도 위가 통과한다)
    await fillByLabel(page, "자본적지출액 (외화)", "5000");
    await expect(page.getByText("자본적지출 지출일 기준환율")).toBeVisible();
    await expect(page.getByText("양도비 지출일 기준환율")).toHaveCount(0);

    await fillByLabel(page, "양도비 (외화)", "1000");
    await expect(page.getByText("양도비 지출일 기준환율")).toBeVisible();
  });

  test("FXE-2: 입력한 지출일 환율이 body → 세액 → 결과 카드까지 도달한다", async ({ page }) => {
    test.setTimeout(120_000);
    await reachStep3(page);

    await fillByLabel(page, "자본적지출액 (외화)", "5000");
    await fillByLabel(page, "자본적지출 지출일 기준환율", "900");
    await fillByLabel(page, "양도비 (외화)", "1000");
    await fillByLabel(page, "양도비 지출일 기준환율", "950");

    const calcResponse = page.waitForResponse(
      (r) => r.url().includes("/api/calc/stock-transfer") && r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: "결과 보기" }).click();
    const resp = await calcResponse;
    expect(resp.ok()).toBeTruthy();

    // ⑬ body — 두 환율이 실렸는가 (여기가 비면 엔진만 고친 no-op 이다)
    const reqBody = JSON.parse(resp.request().postData() ?? "{}");
    expect(reqBody.capitalExpenditureExchangeRate).toBe(900);
    expect(reqBody.transferCostExchangeRate).toBe(950);

    // 세액 — 각 항목이 **자기 환율**로 환산됐는가
    //   자본적지출 5,000 × 900 = 4,500,000 / 양도비 1,000 × 950 = 950,000
    //   (양도일 환율 1,000 이었다면 5,000,000 + 1,000,000 = 6,000,000)
    const json = await resp.json();
    expect(json.result.necessaryExpensesKrw).toBe(5_450_000);

    // ⑦ 결과 카드 — 적용 환율을 밝히는가
    await expect(page.getByText(/자본적지출 900.*양도비 950/)).toBeVisible({ timeout: 30_000 });
  });

  test("FXE-3 [회귀 방지]: 환율을 비우면 양도일 환율로 환산된다", async ({ page }) => {
    test.setTimeout(120_000);
    await reachStep3(page);

    await fillByLabel(page, "양도비 (외화)", "1000");
    // 지출일 환율은 비운 채로 계산 — 차단되지 않아야 한다

    const calcResponse = page.waitForResponse(
      (r) => r.url().includes("/api/calc/stock-transfer") && r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: "결과 보기" }).click();
    const resp = await calcResponse;
    expect(resp.ok()).toBeTruthy();

    const json = await resp.json();
    // 1,000 × 양도일 환율 1,000 = 1,000,000 — 종전과 같은 값
    expect(json.result.necessaryExpensesKrw).toBe(1_000_000);
    await expect(page.getByText(/지출일 기준환율 1,000/)).toBeVisible({ timeout: 30_000 });
  });
});
