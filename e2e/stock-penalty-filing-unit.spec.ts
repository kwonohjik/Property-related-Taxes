/**
 * E2E: 가산세 신고-단위 산정 — 「과소신고납부세액등」 + §47조의4 납부지연
 *
 * 계획서: docs/00-pm/stock-transfer-pr3-followup-closeout.plan.md (Phase A′)
 *
 * ## 무엇을 증명하는가
 *
 * 엔진·⑫⑬⑭ 배선은 anchor 가 덮지만, **사용자가 실제로 그 칸에 값을 넣어 세액이 움직이는지**는
 * 브라우저에서만 알 수 있다. 종전에는 §47조의4 가 placeholder 0 이라 결과 화면의 납부지연
 * 행이 **한 번도 렌더된 적이 없었다**(`StockTransferPenaltySection.tsx` 의 `> 0` 게이트).
 *
 * 실행: npx playwright test e2e/stock-penalty-filing-unit.spec.ts
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

async function fillByLabel(page: Page, label: string, value: string) {
  await page.locator(`div:has(> label:has-text('${label}')) input[type="text"]`).first().fill(value);
}

/** 1 → 2 → 3단계 — 비상장 100주 · 양도소득 50,000,000 */
async function fillThroughStep3(page: Page) {
  await page.getByPlaceholder("종목명을 입력하세요").fill("가산세종목");
  await page.getByRole("radio", { name: "비상장" }).first().click();

  const y = page.locator('input[type="text"][aria-label="연도"]');
  const m = page.locator('input[type="text"][aria-label="월"]');
  const d = page.locator('input[type="text"][aria-label="일"]');
  await y.nth(0).fill("2021");
  await m.nth(0).fill("01");
  await d.nth(0).fill("02");
  await y.nth(1).fill("2024");
  await m.nth(1).fill("02");
  await d.nth(1).fill("01");

  await page
    .locator('[data-slot="field-card"]')
    .filter({ hasText: "양도 주식수" })
    .locator("input")
    .first()
    .fill("100");
  await page
    .locator('[data-slot="field-card"]')
    .filter({ hasText: "발행주식 총수" })
    .locator("input")
    .first()
    .fill("1000000");

  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByText("양도·취득가액").first()).toBeVisible({ timeout: 10_000 });
  await fillByLabel(page, "양도가액 합계", "100000000");
  await fillByLabel(page, "1주당 취득가액", "500000");

  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByText("필요경비·신고").first()).toBeVisible({ timeout: 10_000 });
  await page.locator('input[type="text"][aria-label="연도"]').nth(0).fill("2025");
  await page.locator('input[type="text"][aria-label="월"]').nth(0).fill("02");
  await page.locator('input[type="text"][aria-label="일"]').nth(0).fill("28");
}

test.describe("가산세 신고-단위 산정", () => {
  test("PE-1: 정상 신고에는 신고위반 상세 칸만 없다 (납부지연 칸은 남는다)", async ({ page }) => {
    test.setTimeout(120_000);
    await gotoStockTransferTax(page);
    await fillThroughStep3(page);

    // §47조의3① 기준금액 차감 항목은 신고 위반 게이트 **안** — 정상 신고에는 없다.
    await expect(page.getByText("가산세 기준금액 (과소신고납부세액등)")).toHaveCount(0);
    await expect(page.getByText("당초 신고세액")).toHaveCount(0);

    // §47조의4 납부지연은 게이트 **밖**이라 정상 신고에도 남는다 — 「기한 내 정확히 신고하고
    // 납부만 늦은」 사안이 이 축의 핵심이고, 종전에는 입력 경로가 아예 없었다.
    // 이 단언을 `toHaveCount(0)` 으로 되돌리면 그 입력 경로가 다시 사라진다.
    await expect(page.getByText("법정납부기한")).toBeVisible();
  });

  test("PE-2: 과소신고를 고르면 기준금액 차감 칸과 납부지연 칸이 열린다", async ({ page }) => {
    test.setTimeout(120_000);
    await gotoStockTransferTax(page);
    await fillThroughStep3(page);

    await page.getByRole("radio", { name: /과소신고/ }).first().click();

    await expect(page.getByText("법정납부기한")).toBeVisible();
    await expect(page.getByText(/당초 신고세액/)).toBeVisible();
    await expect(page.getByText(/합산 결정세액에 한 번/)).toBeVisible();
  });

  test("PE-3: 납부지연가산세가 결과 화면에 실제로 렌더된다 (종전 placeholder 0)", async ({ page }) => {
    test.setTimeout(180_000);
    await gotoStockTransferTax(page);
    await fillThroughStep3(page);

    await page.getByRole("radio", { name: /과소신고/ }).first().click();
    await fillByLabel(page, "미납·과소납부세액", "10000000");

    // 법정납부기한 2024-04-30 (양도 2024-02-01 → 예정신고 기한)
    const deadline = page.locator('[data-slot="field-card"]').filter({ hasText: "법정납부기한" });
    await deadline.locator('input[aria-label="연도"]').fill("2024");
    await deadline.locator('input[aria-label="월"]').fill("04");
    await deadline.locator('input[aria-label="일"]').fill("30");

    const paidAt = page.locator('[data-slot="field-card"]').filter({ hasText: "실제 납부일" });
    await paidAt.locator('input[aria-label="연도"]').fill("2024");
    await paidAt.locator('input[aria-label="월"]').fill("05");
    await paidAt.locator('input[aria-label="일"]').fill("31");

    const calcResponse = page.waitForResponse(
      (r) => r.url().includes("/api/calc/stock-transfer") && r.request().method() === "POST",
      { timeout: 60_000 },
    );
    await page.getByRole("button", { name: "결과 보기" }).click();
    const resp = await calcResponse;
    expect(resp.ok()).toBeTruthy();

    // ⑬ 신규 6칸이 payload 에 실렸는가
    const reqBody = JSON.parse(resp.request().postData() ?? "{}");
    expect(reqBody.unpaidTax).toBe(10_000_000);
    expect(reqBody.paymentDeadline).toBe("2024-04-30");

    // 🔴 G-03: 산정기간은 「법정납부기한의 다음 날부터 납부일의 **전날**까지」(국세기본법 §47의4①1호).
    // 2024-05-01 ~ 2024-05-30 = 30일 × 10,000,000 × 0.022% = 66,000 (국기령 §27조의4① 1일 10만분의 22).
    // 종전 기댓값 68,200(31일)은 납부일 당일까지 세던 시절의 값이다.
    const json = await resp.json();
    expect(json.result.latePaymentPenalty).toBe(66_000);

    // 결과 화면에 실제로 렌더된다 — 종전에는 placeholder 0 이라 이 행이 나온 적이 없다.
    // 🔴 G-17: 결과 카드 행과 별지84호 표 27번 행이 **둘 다** 현행 조문 제목(§47조의4
    //          「납부지연가산세」)을 쓴다. 종전에는 「납부불성실」이었다. 같은 문자열이 두 곳에
    //          나오므로 각각의 역할로 좁힌다(느슨한 getByText는 strict mode 위반).
    await expect(
      page.getByText("납부지연 가산세 (국세기본법 §47조의4)", { exact: true }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole("cell", { name: "27. 납부지연 가산세 (국세기본법 §47조의4)" }),
    ).toBeVisible();
    // 결과 카드 · 별지84호 표 · 총액 등 여러 곳에 나오므로 정확일치 첫 요소로 좁힌다
    await expect(page.getByText("66,000", { exact: true }).first()).toBeVisible();
    // 기준금액 echo — 「산출세액 × 세율」이 아니라는 것을 화면이 말한다
    await expect(page.getByText(/기준금액/)).toBeVisible();
  });
});
