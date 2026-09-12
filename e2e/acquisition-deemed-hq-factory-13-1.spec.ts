/**
 * 과점주주 간주취득 × §13①(본점·공장) E2E — 브라우저 실플로우 확인
 *
 * 「지방세법」 §15② 단서: 「취득물건이 **제13조제1항**에 해당하는 경우에는 **중과기준세율의
 * 100분의 300**」 ⇒ 6%. 근거는 조심 1998-0145(기각 = 중과 적법)·조심2011지0312.
 *
 * 본점 3억(6%) + 일반 7억(2%) · 지분 100% → **1,800만 + 1,400만 = 3,200만**.
 * 「전부 6%」(6,000만)도 「전부 2%」(2,000만)도 아니라는 것이 물건별 판정의 요지다.
 *
 * 실행: E2E_PORT=3101 npx playwright test e2e/acquisition-deemed-hq-factory-13-1.spec.ts
 */

import { test, expect, type Page } from "@playwright/test";

function toggleSwitch(page: Page, titleText: string | RegExp) {
  return page
    .locator('[data-slot="toggle-card"]')
    .filter({ hasText: titleText })
    .getByRole("switch");
}

test.describe("취득세 과점주주 — §15② 단서 §13① 본점·공장 6%", () => {
  test("본점 3억(6%) + 일반 7억(2%) = 32,000,000", async ({ page }) => {
    await page.goto("/calc/acquisition-tax");

    await page.locator("select").nth(1).selectOption("deemed_major_shareholder");
    await page.getByRole("button", { name: /다음/ }).click();
    await expect(page.getByText("과점주주 간주취득 상세")).toBeVisible();

    await page.getByPlaceholder("취득 전 보유 지분율 (신규 진입 시 비움)").fill("0");
    await page.getByPlaceholder("취득 후 합산 지분율").fill("100");

    // 물건별 구분 모드 ON — 토글이 **빈 행 1개를 미리 깐다**(행이 0건이면)
    await toggleSwitch(page, /물건별로 구분/).click();
    const rows = page.getByTestId("deemed-bucket-rows");
    await expect(rows.locator("> div")).toHaveCount(1);

    // 1번 물건 — 본점 사업용 (§13①)
    const row1 = rows.locator("> div").nth(0);
    await row1.getByPlaceholder("결산서·장부상 가액 (§10의6④)").fill("300000000");
    await row1.locator('input[type="radio"][value="hq_factory"]').check();

    // 2번 물건 — 일반
    await page.getByTestId("deemed-bucket-add").click();
    await expect(rows.locator("> div")).toHaveCount(2);
    const row2 = rows.locator("> div").nth(1);
    await row2.getByPlaceholder("결산서·장부상 가액 (§10의6④)").fill("700000000");

    // 행 미리보기 — 6%가 실제로 적용된다
    await expect(row1.getByText(/× 6% = 18,000,000/)).toBeVisible();

    // ── 계산 ──
    const resp = page.waitForResponse(
      (r) => r.url().includes("/api/calc/acquisition") && r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: /취득세 계산/ }).click();
    const r = await resp;
    expect(r.ok(), `취득세 계산 API 비정상 응답 ${r.status()}`).toBe(true);

    // 결과 — 물건별 표에 §13① 배지, 합계 3,200만
    await expect(page.getByTestId("deemed-bucket-breakdown")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("deemed-bucket-breakdown").getByText("§13①")).toBeVisible();
    await expect(page.getByText("32,000,000").first()).toBeVisible();
  });
});
