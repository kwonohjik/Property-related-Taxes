/**
 * E2E: 사업연도 표 Enter 세로(열 단위) 이동
 *
 * 검증 (docs/00-pm/ui-fiscal-year-vertical-enter.plan.md):
 *   1. 같은 사업연도 열에서 Enter → 아래 항목(①→②)
 *   2. 열 끝 ㉒(row=21) → Enter → 다음 사업연도 ①(col+1, row=0)
 *   3. 마지막 열(col=2) ㉒ → Enter → 표 밖 다음 입력으로 복귀
 *
 * 셀 식별: [data-fy-col][data-fy-row] (col 0~2 = 1/2/3년전, row 0~21 = ①~㉒)
 */
import { test, expect, type Page } from "@playwright/test";
import { addHeir } from "./_helpers/tax-flow";

async function gotoV2FormalValuationCard(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill("2024");
  await page.getByLabel("월").first().fill("3");
  await page.getByLabel("일").first().fill("31");
  await addHeir(page, "heir", "child"); // 2단계 picker + 모달 RRN 자동입력·닫기 (raw 패턴 마이그레이션)
  await page.getByRole("button", { name: /^다음/ }).click();
  await page.getByRole("button", { name: /주식·지분 추가/ }).click();
  await page.getByRole("button", { name: /비상장주식/ }).click();
  await page.getByText("정식평가", { exact: true }).click();
}

const cell = (page: Page, col: number, row: number) =>
  page.locator(`[data-fy-col="${col}"][data-fy-row="${row}"] input`);

test.describe("사업연도 표 Enter 세로 이동", () => {
  test("① 1년전 → Enter → ② 1년전 (같은 열 아래)", async ({ page }) => {
    await gotoV2FormalValuationCard(page);
    const c00 = cell(page, 0, 0);
    await c00.scrollIntoViewIfNeeded();
    await c00.click();
    await c00.fill("100000000");
    await page.keyboard.press("Enter");
    await expect(cell(page, 0, 1)).toBeFocused();
  });

  test("㉒ 1년전 → Enter → ① 2년전 (다음 사업연도 열로)", async ({ page }) => {
    await gotoV2FormalValuationCard(page);
    const c0_21 = cell(page, 0, 21);
    await c0_21.scrollIntoViewIfNeeded();
    await c0_21.click();
    await page.keyboard.press("Enter");
    await expect(cell(page, 1, 0)).toBeFocused();
  });

  test("㉒ 3년전(마지막 열) → Enter → 표 밖 입력으로 복귀", async ({ page }) => {
    await gotoV2FormalValuationCard(page);
    const c2_21 = cell(page, 2, 21);
    await c2_21.scrollIntoViewIfNeeded();
    await c2_21.click();
    await page.keyboard.press("Enter");
    // 더 이상 표 안 입력에 머물지 않음 (표 밖으로 이동 또는 최소한 ㉒에서 벗어남)
    await expect(c2_21).not.toBeFocused();
    const stillInTable = await page.evaluate(
      () => !!document.activeElement?.closest("[data-fy-col]"),
    );
    expect(stillInTable).toBe(false);
  });

  test("가로로 가지 않음: ① 1년전 Enter는 ① 2년전이 아니라 ② 1년전", async ({ page }) => {
    await gotoV2FormalValuationCard(page);
    const c00 = cell(page, 0, 0);
    await c00.scrollIntoViewIfNeeded();
    await c00.click();
    await page.keyboard.press("Enter");
    // 가로(col=1, row=0)로 가면 안 됨
    await expect(cell(page, 1, 0)).not.toBeFocused();
  });
});
