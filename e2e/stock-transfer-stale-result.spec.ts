/**
 * E2E A-2 — 입력을 고치면 결과가 다시 계산된다 (stale 결과 차단)
 *
 * 제보 재현: 1단계에서 지분율 15%를 넣어 「대주주 해당」 배지가 떴는데도, 결과 탭은
 * 비대주주(비과세·10%)를 그대로 보여줬다.
 *
 * 원인은 `updateFormData`가 `result`를 무효화하지 않은 것이었다. 결과 스텝은 `result`가
 * 있으면 자동 재계산을 건너뛰므로(Step4.tsx), 스텝 인디케이터로 오가면 **직전 계산 결과**가
 * 그대로 남았다.
 *
 * 안전망 실측(P-1): 이 동작을 지키는 vitest는 **0건**(411파일 3,704건 전부 통과)이었다.
 * A-1(store 단위) + 본 spec(실제 마법사 흐름)이 방어선이다.
 *
 * 실행: E2E_PORT=3402 npx playwright test e2e/stock-transfer-stale-result.spec.ts
 * 정책: [[feedback_browser_verify_with_playwright]] · [[feedback_worktree_e2e_port_isolation]]
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

/** Step1 — 코스닥 · 비대주주(지분율 미입력) · 취득 2020-07-01 / 양도 2026-02-26 */
async function fillStep1(page: Page) {
  await page.getByPlaceholder("종목명을 입력하세요").fill("주성");
  await page.getByRole("radio", { name: "코스닥" }).first().click();

  const y = page.locator('input[type="text"][aria-label="연도"]');
  const m = page.locator('input[type="text"][aria-label="월"]');
  const d = page.locator('input[type="text"][aria-label="일"]');
  await y.nth(0).fill("2020");
  await m.nth(0).fill("07");
  await d.nth(0).fill("01");
  await y.nth(1).fill("2026");
  await m.nth(1).fill("02");
  await d.nth(1).fill("26");

  await page.locator('[data-slot="field-card"]').filter({ hasText: "양도 주식수" }).locator("input").first().fill("5000");
  await page.locator('[data-slot="field-card"]').filter({ hasText: "발행주식 총수" }).locator("input").first().fill("100000");
}

/** 직전 사업연도 종료일 — 이 값이 있어야 대주주 자동 판정이 활성화된다 */
async function fillPriorYearEnd(page: Page, y: string, m: string, d: string) {
  const card = page.locator('[data-slot="field-card"]').filter({ hasText: "직전 사업연도 종료일" }).first();
  await card.locator('input[aria-label="연도"]').fill(y);
  await card.locator('input[aria-label="월"]').fill(m);
  await card.locator('input[aria-label="일"]').fill(d);
}

/** 본인 단독 지분율(%) — 대주주 판정 섹션 */
async function fillSelfShareRatio(page: Page, pct: string) {
  await page
    .locator('[data-slot="field-card"]')
    .filter({ hasText: "본인 단독 지분율" })
    .locator("input")
    .first()
    .fill(pct);
}

test.describe("A-2 — 입력 변경 시 결과 재계산", () => {
  test("지분율을 15%로 고치면 결과가 대주주 과세로 갱신된다", async ({ page }) => {
    test.setTimeout(180_000);
    await gotoStockTransferTax(page);
    await fillStep1(page);

    // 대주주 카드는 ToggleCard children이라 OFF면 내부 입력이 렌더되지 않는다.
    // (priorYearEndDate가 없으면 자동 판정도 비활성 → 토글을 먼저 켜야 입력에 닿는다 — 코드 주석의 「닭-달걀」)
    await page
      .locator('[data-slot="toggle-card"]')
      .filter({ hasText: "대주주 여부" })
      .getByRole("switch")
      .first()
      .click();

    // 직전 사업연도 종료일 — 이 값이 채워지면 자동 판정이 활성화된다
    await fillPriorYearEnd(page, "2025", "12", "31");

    // Step2 — 양도·취득가액 (실가)
    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByText("양도·취득가액").first()).toBeVisible({ timeout: 10_000 });
    await fillByLabel(page, "양도가액 합계", "44750000");  // 총액 모드 기본
    await fillByLabel(page, "1주당 취득가액", "3000");

    // Step3 — 신고일 필수 (미입력 시 「결과 보기」가 validate에 막힌다)
    await page.getByRole("button", { name: /^다음/ }).click();
    const filingCard = page.locator('[data-slot="field-card"]').filter({ hasText: "신고일" }).first();
    await filingCard.locator('input[aria-label="연도"]').fill("2026");
    await filingCard.locator('input[aria-label="월"]').fill("04");
    await filingCard.locator('input[aria-label="일"]').fill("30");

    await page.getByRole("button", { name: /결과 보기/ }).click();

    // 1차 계산 — 비대주주 장내 → 비과세
    await expect(page.getByText("비과세").first()).toBeVisible({ timeout: 30_000 });

    // ── 여기서부터가 제보 흐름 ──
    // 스텝 인디케이터로 1단계 복귀 → 지분율 15% 입력
    await page.getByText("자산·시장·대주주", { exact: false }).first().click();
    await page.getByPlaceholder("종목명을 입력하세요").waitFor({ state: "visible", timeout: 10_000 });
    await fillSelfShareRatio(page, "15");

    // 자동 판정 배지가 대주주로 바뀐다 (종전에도 여기까지는 정상이었다)
    await expect(page.getByText("대주주 해당", { exact: false })).toBeVisible({ timeout: 10_000 });

    // 결과 탭으로 복귀 — 재계산되어야 한다
    await page.getByText("결과", { exact: true }).first().click();

    // 종전 결함: 이전 결과(비과세)가 그대로 남았다.
    // 지금은 result가 무효화되어 자동 재계산 → 대주주 과세로 갱신된다.
    await expect(page.getByText("상장 대주주", { exact: false }).first()).toBeVisible({ timeout: 30_000 });
    // 조문 배정도 대주주 조항으로 바뀐다 (§94①3 가목 1) = 대주주가 양도하는 주식등)
    await expect(page.getByText("§94①3 가목1)", { exact: false }).first()).toBeVisible();
    // 그리고 비과세 표시는 사라진다 — stale 결과가 남지 않았다는 뜻
    await expect(page.getByText("비과세", { exact: true })).toHaveCount(0);
  });
});
