/**
 * 지목변경 간주취득 과세표준 §10의6① 본칙 E2E — 브라우저 실플로우 확인
 *
 * 「지방세법」 §10의6①1호는 지목변경 과세표준을 「그 변경으로 증가한 가액에 해당하는
 * **사실상취득가격**」으로 정하고, 시가표준액 차액은 ②1호가 「사실상취득가격을
 * **확인할 수 없는 경우**」에만 허용하는 보충법이다(계산방법은 시행령 §18의6 1호).
 *
 * 종전 화면에는 **시가표준액 2칸뿐**이라 본칙대로 신고할 입력 경로가 없었다.
 * 이 spec 이 확인하는 것은 그 경로가 실제로 열렸는가, 그리고 **한쪽만** 보이는가다.
 *
 * 실행: E2E_PORT=3101 npx playwright test e2e/acquisition-land-category-actual-price.spec.ts
 */

import { test, expect, type Page } from "@playwright/test";

function toggleSwitch(page: Page, titleText: string | RegExp) {
  return page
    .locator('[data-slot="toggle-card"]')
    .filter({ hasText: titleText })
    .getByRole("switch");
}

async function gotoLandCategoryStep(page: Page) {
  await page.goto("/calc/acquisition-tax");
  await page.locator("select").nth(1).selectOption("deemed_land_category");
  await page.getByRole("button", { name: /다음/ }).click();
  await expect(page.getByText("지목변경 간주취득 상세")).toBeVisible();

  // Step 1 의 select 는 「변경 전/후 지목」 둘뿐이다 (Step 0 의 select 는 언마운트된다)
  const selects = page.locator("select");
  await expect(selects).toHaveCount(2);
  await selects.nth(0).selectOption("전");
  await selects.nth(1).selectOption("대");
}

test.describe("취득세 지목변경 — §10의6① 사실상취득가격 본칙", () => {
  test("본칙 ON: 사실상취득가격 칸이 열리고 시가표준액 칸은 닫힌다 · 과세표준 3억", async ({
    page,
  }) => {
    await gotoLandCategoryStep(page);

    // ── 기본값은 보충법 — 시가표준액 2칸 ──
    await expect(page.getByPlaceholder("지목변경 전 토지 공시가격 기준")).toBeVisible();
    await expect(page.getByPlaceholder("형질변경 공사비 등 합계")).toHaveCount(0);

    // ── 본칙 토글 — 종전에는 이 칸이 화면에 없었다 ──
    const actualToggle = toggleSwitch(page, /사실상취득가격을 확인할 수 있음/);
    await expect(actualToggle).toBeVisible();
    await actualToggle.click();

    // 상호배타: 보충 칸은 사라진다
    await expect(page.getByPlaceholder("형질변경 공사비 등 합계")).toBeVisible();
    await expect(page.getByPlaceholder("지목변경 전 토지 공시가격 기준")).toHaveCount(0);
    await expect(page.getByPlaceholder("지목변경 후 토지 공시가격 기준")).toHaveCount(0);

    await page.getByPlaceholder("형질변경 공사비 등 합계").fill("300000000");

    // 미리보기 — 과세표준은 차액이 아니라 사실상취득가격
    await expect(page.getByText("과세표준 = 사실상취득가격 300,000,000")).toBeVisible();
    await expect(page.getByText("× 2% = 6,000,000")).toBeVisible();

    // ── 계산 ──
    const resp = page.waitForResponse(
      (r) => r.url().includes("/api/calc/acquisition") && r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: /취득세 계산/ }).click();
    const r = await resp;
    expect(r.ok(), `취득세 계산 API 비정상 응답 ${r.status()}`).toBe(true);

    // 결과 카드가 본칙 행·근거를 그린다
    await expect(page.getByText("사실상취득가격 (증가한 가액)")).toBeVisible({ timeout: 30_000 });
    // ⚠️ `/지방세법 §10의6①1호/` 만으로는 엔진 경고문 2곳에도 걸려 strict mode 위반이다.
    //    결과 카드 산식 줄 전체를 지목한다.
    await expect(
      page.getByText("지목변경으로 증가한 가액에 해당하는 사실상취득가격 (지방세법 §10의6①1호)"),
    ).toBeVisible();
  });

  test("〔역방향〕 본칙 OFF: 종전대로 시가표준액 차액이 과세표준", async ({ page }) => {
    await gotoLandCategoryStep(page);

    await page.getByPlaceholder("지목변경 전 토지 공시가격 기준").fill("100000000");
    await page.getByPlaceholder("지목변경 후 토지 공시가격 기준").fill("250000000");

    await expect(
      page.getByText("과세표준 = 변경 후 250,000,000 - 변경 전 100,000,000 = 150,000,000"),
    ).toBeVisible();
    await expect(page.getByText("× 2% = 3,000,000")).toBeVisible();

    // 본칙 칸은 열려 있지 않다
    await expect(page.getByPlaceholder("형질변경 공사비 등 합계")).toHaveCount(0);
  });
});
