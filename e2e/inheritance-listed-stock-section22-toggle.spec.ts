/**
 * E2E: S-2 — 상장주식 §22② 최대주주 토글 (F-1 Phase 2)
 *
 * 계획서: docs/00-pm/inheritance-stock-section22-toggle-consolidation.plan.md §6·§7
 *
 * 시나리오:
 *   S-2-a: 상장주식 카드에 §22② 최대주주 토글 표시
 *   S-2-b: 기본 OFF 상태 (미체크)
 *   S-2-c: 토글 ON → §22 제외 안내 펼침 (§22 suggest 경로로 검증)
 *   S-2-d: 토글 ON → OFF 복귀 확인
 *
 * 검증 방식:
 *   §22 reflect은 [적용] 버튼 경로가 필요하므로,
 *   e2e는 토글 표시·ON/OFF 전환·펼침 안내 텍스트 변화로 검증.
 *
 * 정책:
 *   [[feedback_browser_verify_with_playwright]] — 수동 안내 금지, spec 통과로 브라우저 확인 충족
 */

import { test, expect, type Page } from "@playwright/test";
import { addHeir } from "./_helpers/tax-flow";

async function gotoStep0AndFillDeathDate(page: Page, year: string, month: string, day: string) {
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill(year);
  await page.getByLabel("월").first().fill(month);
  await page.getByLabel("일").first().fill(day);
  await addHeir(page, "heir", "child");
  await page.getByRole("button", { name: /^다음/ }).click();
}

async function openListedStockCard(page: Page) {
  await page.getByRole("button", { name: /주식·지분 추가/ }).click();
  await page.getByText("상장주식", { exact: true }).click();
}

test.describe("S-2: 상장주식 §22② 최대주주 토글 (F-1)", () => {
  test("S-2-a: 상장주식 카드에 §22② 토글 헤더 표시", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep0AndFillDeathDate(page, "2026", "5", "15");
    await openListedStockCard(page);

    // §22② 최대주주 토글 헤더 표시 확인
    await expect(
      page.getByText("§22② 최대주주 보유주식 금융재산공제 배제", { exact: true }),
    ).toBeVisible();

    // ToggleCard title 표시 확인
    await expect(page.getByText("최대주주에 해당", { exact: true })).toBeVisible();
  });

  test("S-2-b: 기본 OFF 상태 — 펼침 안내 미표시", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep0AndFillDeathDate(page, "2026", "5", "15");
    await openListedStockCard(page);

    // OFF 기본: ToggleCard children 펼침 안내 미표시
    const guide = page.getByText(/\[적용\] 버튼으로 반영/);
    await expect(guide).toHaveCount(0);
  });

  test("S-2-c: 토글 ON → 펼침 안내 표시", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep0AndFillDeathDate(page, "2026", "5", "15");
    await openListedStockCard(page);

    // 토글 ON
    await page.getByText("최대주주에 해당", { exact: true }).click();

    // ON: children 펼침 안내 표시
    await expect(page.getByText(/\[적용\] 버튼으로 반영/).first()).toBeVisible();
  });

  test("S-2-d: 토글 ON → OFF 복귀 시 안내 재소멸", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep0AndFillDeathDate(page, "2026", "5", "15");
    await openListedStockCard(page);

    // ON
    await page.getByText("최대주주에 해당", { exact: true }).click();
    await expect(page.getByText(/\[적용\] 버튼으로 반영/).first()).toBeVisible();

    // OFF 복귀
    await page.getByText("최대주주에 해당", { exact: true }).click();
    await expect(page.getByText(/\[적용\] 버튼으로 반영/)).toHaveCount(0);
  });
});
