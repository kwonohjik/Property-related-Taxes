/**
 * E2E: 상장 환산(§163⑨) — 키움 1개월 종가 자동조회가 «일반 경로»에서 동작한다
 *
 * 계획서: docs/00-pm/stock-listed-conversion-1month-kiwoom-autofetch.plan.md (Phase 4)
 *
 * ## 무엇을 증명하는가
 *
 * 종전에는 자동조회 버튼이 「취득 후 상장」 ToggleCard children +
 * `transferStdInputMode === "daily"` 라는 **이중 게이트** 뒤에만 있어
 * 일반 §163⑨ 환산 사용자에게 **도달 경로가 없었다**.
 * 컴포넌트 anchor(`stock-listed-conversion-autofetch-gate.anchor.test.tsx`)가 렌더를 보지만,
 * **실제로 클릭해서 값이 채워지는지**는 브라우저에서만 알 수 있다
 * ([[feedback_browser_verify_with_playwright]]).
 *
 * ## 키움은 mock 한다
 *
 * CI 워크플로에 `KIWOOM` 키가 **0건**이라(V-5 실측) 실호출 경로가 성립하지 않는다.
 * fixture는 **실 API 실측 응답**이다 — `e2e/_helpers/kiwoom-1month-mock.ts` 참조.
 *
 * 실행: E2E_PORT=3200 npx playwright test e2e/stock-listed-conversion-kiwoom-autofetch.spec.ts
 */

import { test, expect, type Page } from "@playwright/test";
import { mockKiwoom1Month, FIXTURE_2025_06_10 } from "./_helpers/kiwoom-1month-mock";

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

/** Step1 — 코스피 005930, 취득 2018-01-01 / 양도 2025-06-10 (mock fixture 기준일) */
async function fillStep1(page: Page) {
  await page.getByPlaceholder("종목명을 입력하세요").fill("삼성전자");
  await page.getByRole("radio", { name: "코스피" }).first().click();

  const y = page.locator('input[type="text"][aria-label="연도"]');
  const m = page.locator('input[type="text"][aria-label="월"]');
  const d = page.locator('input[type="text"][aria-label="일"]');
  await y.nth(0).fill("2018");
  await m.nth(0).fill("01");
  await d.nth(0).fill("01");
  await y.nth(1).fill("2025");
  await m.nth(1).fill("06");
  await d.nth(1).fill("10");

  await page.locator('[data-slot="field-card"]').filter({ hasText: "양도 주식수" }).locator("input").first().fill("1000");
  await page
    .locator('[data-slot="field-card"]')
    .filter({ hasText: "발행주식 총수" })
    .locator("input")
    .first()
    .fill("10000000");

  // 종목코드 — 자동조회 활성화 조건
  await page
    .locator('[data-slot="field-card"]')
    .filter({ hasText: "종목코드" })
    .locator("input")
    .first()
    .fill("005930");
}

async function gotoStep2Estimated(page: Page) {
  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByText("양도·취득가액").first()).toBeVisible({ timeout: 10_000 });
  await fillByLabel(page, "양도가액 합계", "60000000");
  await page.getByRole("radio", { name: "환산취득가" }).first().click();
}

test.describe("상장 환산 §163⑨ — 키움 자동조회 (일반 경로)", () => {
  test("KA-1: 「취득 후 상장」을 켜지 않아도 자동조회 버튼이 보인다", async ({ page }) => {
    test.setTimeout(120_000);
    await mockKiwoom1Month(page);
    await gotoStockTransferTax(page);
    await fillStep1(page);
    await gotoStep2Estimated(page);

    await expect(page.getByText(/환산취득가 \(시행령 §163⑨\)/)).toBeVisible();
    // Phase 5 이후 두 축이 모두 있다 — 분모(양도일)·분자(취득일)
    await expect(page.getByRole("button", { name: /양도일 키움 자동조회/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /취득일 키움 자동조회/ })).toBeVisible();
  });

  test("KA-2: 클릭 → 양도시 1주당 기준시가가 56,590으로 채워진다", async ({ page }) => {
    test.setTimeout(120_000);
    await mockKiwoom1Month(page);
    await gotoStockTransferTax(page);
    await fillStep1(page);
    await gotoStep2Estimated(page);

    await page.getByRole("button", { name: /양도일 키움 자동조회/ }).click();

    // 결과 카드 — 산식이 그대로 보인다 (검증 UX 표준)
    await expect(page.getByText(/2025-05-11 ~ 2025-06-10/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/56,590/).first()).toBeVisible();

    // 폼 mirror — 분모 칸에 실제로 실렸다
    const denom = page
      .locator(`div:has(> label:has-text('양도시 1주당 기준시가'))`)
      .locator('input[type="text"]')
      .first();
    await expect(denom).toHaveValue("56,590");
  });

  test("KA-4: 취득일 축 — 클릭 → 분자 칸이 채워지고 «분모는 그대로»다", async ({ page }) => {
    test.setTimeout(120_000);
    // 취득일(2018-01-01) fixture 를 추가로 등록한다 — 없으면 mock 이 404 로 알려준다
    await mockKiwoom1Month(page, [
      FIXTURE_2025_06_10,
      { ...FIXTURE_2025_06_10, transferDate: "2018-01-01", anchorDate: "2018-01-01", average: 51_000 },
    ]);
    await gotoStockTransferTax(page);
    await fillStep1(page);
    await gotoStep2Estimated(page);

    await page.getByRole("button", { name: /취득일 키움 자동조회/ }).click();

    const numer = page
      .locator(`div:has(> label:has-text('취득시 1주당 기준시가'))`)
      .locator('input[type="text"]')
      .first();
    await expect(numer).toHaveValue("51,000", { timeout: 15_000 });

    // 🔑 분모는 건드리지 않는다 — 두 축이 서로를 덮어쓰면 환산비율이 무너진다
    const denom = page
      .locator(`div:has(> label:has-text('양도시 1주당 기준시가'))`)
      .locator('input[type="text"]')
      .first();
    await expect(denom).toHaveValue("");
  });

  test("KA-3: 라벨이 「이전 1개월」이다 (소득세법 §99①3 문언)", async ({ page }) => {
    test.setTimeout(120_000);
    await mockKiwoom1Month(page);
    await gotoStockTransferTax(page);
    await fillStep1(page);
    await gotoStep2Estimated(page);

    await expect(
      page.getByText("양도시 1주당 기준시가 (양도일 이전 1개월 종가평균)"),
    ).toBeVisible();
    await expect(page.getByText(/양도일 직전 1개월/)).toHaveCount(0);
  });
});
