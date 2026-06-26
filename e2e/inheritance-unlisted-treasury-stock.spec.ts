/**
 * E2E: 비상장주식 V2 자기주식 보유 토글 — 목적별 펼침(일시보유/소각·감자)
 *
 * Plan/Design: docs/02-design/features/inheritance-unlisted-stock-treasury-stock.*
 *
 * 시나리오:
 *   T-TS-1: 토글 OFF(기본) → 자기주식 펼침(자기주식수·목적 라디오) 미표시
 *   T-TS-2: 토글 ON → 펼침에 자기주식수 입력 + 일시보유/소각·감자 라디오 표시
 *   T-TS-3: 토글 OFF로 복귀 → 펼침 다시 숨김
 *
 * 진입 헬퍼: inheritance-unlisted-section22-toggle.spec.ts 동일 패턴 재사용
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

async function openV2FormalCard(page: Page) {
  await page.getByRole("button", { name: /주식·지분 추가/ }).click();
  await page.getByRole("button", { name: /비상장주식/ }).click();
  await page.getByText("정식평가", { exact: true }).click();
}

test.describe("비상장주식 V2 자기주식 보유 토글", () => {
  test("T-TS-1: 토글 OFF 기본 — 자기주식 펼침 미표시", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep0AndFillDeathDate(page, "2026", "5", "15");
    await openV2FormalCard(page);

    await expect(page.getByText("자기주식 보유", { exact: true })).toBeVisible();
    // 펼침 영역(목적 라디오) 미표시
    await expect(page.getByText("일시보유목적", { exact: true })).toHaveCount(0);
    await expect(page.getByText("소각·감자목적", { exact: true })).toHaveCount(0);
  });

  test("T-TS-2: 토글 ON — 자기주식수 입력 + 목적 라디오 펼침", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep0AndFillDeathDate(page, "2026", "5", "15");
    await openV2FormalCard(page);

    await page.getByText("자기주식 보유", { exact: true }).click();

    // 펼침 헤더 + 자기주식수 입력 + 두 목적 라디오 표시
    await expect(
      page.getByText(/자기주식 보유 — 목적별 평가/),
    ).toBeVisible();
    await expect(page.getByText("일시보유목적", { exact: true })).toBeVisible();
    await expect(page.getByText("소각·감자목적", { exact: true })).toBeVisible();
  });

  test("T-TS-3: 토글 OFF 복귀 — 펼침 다시 숨김", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep0AndFillDeathDate(page, "2026", "5", "15");
    await openV2FormalCard(page);

    const toggle = page.getByText("자기주식 보유", { exact: true });
    await toggle.click();
    await expect(page.getByText("일시보유목적", { exact: true })).toBeVisible();

    await toggle.click();
    await expect(page.getByText("일시보유목적", { exact: true })).toHaveCount(0);
  });
});
