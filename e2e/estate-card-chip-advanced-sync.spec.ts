/**
 * E2E: estate-card-followup §FU-5·PR-G — 헤더 칩 ↔ ⚙️ 패널 상태 동기
 *
 * Plan estate-card-followup.plan.md §8 Anchor #2
 *
 * 시나리오:
 *   1. 상속세 진입 + 자녀 상속인 추가
 *   2. 예금·펀드·채권·공제금(financial) 자산 1개 추가
 *   3. 헤더 칩 §22 클릭 → 3-state 순환 (undef → true → false → undef)
 *   4. 분류 칩 클릭 → 인라인 펼침 → 보험금 선택 → 칩 라벨 갱신
 *   5. ⚙️ 옵션 버튼 클릭 → 고급 패널 펼침
 *
 * 정책: [[feedback_browser_verify_with_playwright]]
 */

import { test, expect, type Page } from "@playwright/test";

async function gotoStep1WithFinancialCard(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill("2026");
  await page.getByLabel("월").first().fill("5");
  await page.getByLabel("일").first().fill("15");
  await page.getByRole("button", { name: /상속인 추가/ }).click();
  await page.getByText("자녀", { exact: true }).click();
  await page.getByRole("button", { name: /^다음/ }).click();
  // 부동산·금융 자산 추가 (financial)
  await page.getByRole("button", { name: /재산 추가/ }).first().click();
  await page.getByText("예금·펀드·채권·공제금", { exact: true }).click();
}

test.describe("PR-G S-1: 헤더 칩 ↔ ⚙️ 패널 상태 동기", () => {
  test("S-1a: §22 칩 3-state 순환", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep1WithFinancialCard(page);

    // estate-card-shell이 노출되었는지 (testid prefix로 찾기)
    const shell = page.locator('[data-testid^="estate-card-shell-"]').first();
    await expect(shell).toBeVisible();

    // §22 칩 — 라벨 "금융재산 공제" + 체크는 mark(굵은 아이콘)·aria-pressed로 표현 (2026-05-29)
    const section22Chip = page.locator('[data-testid^="estate-chip-section22-"]').first();
    await expect(section22Chip).toContainText("금융재산 공제");
    await expect(section22Chip).not.toContainText("✓"); // ✓는 아이콘으로 분리, 라벨 텍스트엔 없음
    await expect(section22Chip).toHaveAttribute("aria-pressed", "true"); // financial 기본 ON

    // 1회 클릭 → true (사용자 지정) — 여전히 ON
    await section22Chip.click();
    await expect(section22Chip).toHaveAttribute("aria-pressed", "true");

    // 2회 클릭 → false (사용자 지정 OFF)
    await section22Chip.click();
    await expect(section22Chip).toHaveAttribute("aria-pressed", "false");

    // 3회 클릭 → undefined (기본 복귀) → ON
    await section22Chip.click();
    await expect(section22Chip).toHaveAttribute("aria-pressed", "true");
  });

  test("S-1b: 분류 칩 인라인 펼침 + 보험금 선택 → 칩 라벨 갱신", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep1WithFinancialCard(page);

    // 분류 칩 — 기본 "일반" (estate-chip-classification-{itemId})
    const classChip = page.locator('[data-testid^="estate-chip-classification-"]').first();
    await expect(classChip).toContainText("일반");

    // 인라인 패널 — 이미 열려 있으면 열지 않음, 닫혀 있으면 칩 클릭으로 열기
    const inlinePanel = page.locator('[data-testid^="estate-inline-expand-classification-"]').first();
    const isPanelVisible = await inlinePanel.isVisible().catch(() => false);
    if (!isPanelVisible) {
      await classChip.click();
    }
    await expect(inlinePanel).toBeVisible();

    // 보험금 라디오 선택 — DeemedCategorySection 내부 (RadioCardGroup, testid 없음 → role="radio")
    await page.getByRole("radio", { name: "보험금 (§8)" }).click();

    // 칩 라벨 갱신
    await expect(classChip).toContainText("보험금 §8");
  });

  test("S-1c: ⚙️ 옵션 버튼 클릭 → 고급 패널 노출", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep1WithFinancialCard(page);

    // ⚙️ 옵션 토글 버튼 — 헤더 우측
    const advancedToggle = page.locator('[data-testid^="estate-advanced-panel-toggle-"]').first();
    await expect(advancedToggle).toBeVisible();

    // 클릭 전 ⚙️ 패널 미노출 — id^="estate-advanced-panel-" 로 패널 DOM 부재 확인
    // (data-testid 패턴은 toggle 버튼도 매칭되므로 id 속성으로 구분)
    await expect(
      page.locator('[id^="estate-advanced-panel-"]'),
    ).toHaveCount(0);

    // 클릭
    await advancedToggle.click();

    // ⚙️ 패널 노출 — id="estate-advanced-panel-{itemId}"
    await expect(page.locator('[id^="estate-advanced-panel-"]').first()).toBeVisible();
  });
});
