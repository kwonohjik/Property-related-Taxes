import { test, expect, type Page } from "@playwright/test";

/**
 * E2E: 신탁이익의 증여 (§33) — 유형 추가 (2026-06-19, E2E_PORT=3104)
 * 정책: [[feedback_browser_verify_with_playwright]] · [[feedback_e2e_worktree_port_isolation]]
 * 엔진 numeric은 unit anchor(trust-benefit.test.ts)로 검증 — 본 spec은 UI 폼→엔진 배선.
 */

async function fillGiftDate(page: Page) {
  await page.getByLabel("연도").first().fill("2026");
  await page.getByLabel("월").first().fill("1");
  await page.getByLabel("일").first().fill("3");
}

test.describe("신탁이익의 증여 (gift-deemed §33)", () => {
  test("TB-UI-1: 동일수익자·원본8억·수익률10%·원천15.4%·3년 → 997,183,628", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/calc/gift-deemed");
    await fillGiftDate(page);
    await page.getByTestId("deemed-type-trust_benefit").click();

    await page.getByPlaceholder("신탁재산 가액 (원)").fill("800000000");
    // 수익률 확정 토글은 기본 ON → 수익률 입력 노출
    await page.getByPlaceholder("신탁 수익률 (%)").fill("10");
    await page.getByPlaceholder("원천징수세율 (%)").fill("15.4");
    await page.getByPlaceholder("수익 지급 횟수 (연)").fill("3");

    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-result-value")).toContainText("997,183,628");
  });

  test("TB-UI-2: 수익률 확정 토글 OFF → 수익률 입력 숨김 (미확정 원본×3%)", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/calc/gift-deemed");
    await fillGiftDate(page);
    await page.getByTestId("deemed-type-trust_benefit").click();

    // 기본 ON — 수익률 입력 노출 확인
    await expect(page.getByPlaceholder("신탁 수익률 (%)")).toBeVisible();
    // 토글 OFF → 수익률 입력 숨김
    await page.getByRole("switch", { name: /신탁 수익률 확정/ }).click();
    await expect(page.getByPlaceholder("신탁 수익률 (%)")).toBeHidden();
  });
});
