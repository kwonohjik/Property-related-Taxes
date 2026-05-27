/**
 * E2E: 평가차액 "행 단위 입력 모드" ON 시 기본 자산1행·부채1행 자동 열기
 *
 * 검증 (docs/00-pm/ui-valuation-delta-default-rows.plan.md):
 *   1. 토글 ON → 자산/부채 영역 + 계정과목 input(자산1·부채1=2개) 즉시 노출
 *   2. ON → OFF → 계정과목 input 사라짐(총액 모드 복귀)
 *   3. ON→OFF→ON 재토글 시에도 행 1개씩(계정과목 2개) — 중복 생성 없음
 */
import { test, expect, type Page } from "@playwright/test";

async function gotoV2FormalValuationCard(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill("2024");
  await page.getByLabel("월").first().fill("3");
  await page.getByLabel("일").first().fill("31");
  await page.getByRole("button", { name: /상속인 추가/ }).click();
  await page.getByText("자녀", { exact: true }).click();
  await page.getByRole("button", { name: /^다음/ }).click();
  await page.getByRole("button", { name: /주식·지분 추가/ }).click();
  await page.getByRole("button", { name: /비상장주식/ }).click();
  await page.getByText("정식평가", { exact: true }).click();
}

/** "행 단위 입력 모드" ToggleCard의 switch */
const deltaToggle = (page: Page) =>
  page
    .locator('[data-variant="card"]')
    .filter({ hasText: "행 단위 입력 모드" })
    .getByRole("switch");

test.describe("평가차액 행 단위 입력 모드 — ON 시 기본 행", () => {
  test("토글 ON → 자산1행·부채1행 즉시 노출(계정과목 input 2개)", async ({ page }) => {
    await gotoV2FormalValuationCard(page);

    const toggle = deltaToggle(page);
    await toggle.scrollIntoViewIfNeeded();
    await toggle.click();

    await expect(page.getByText("자산 평가차액", { exact: false })).toBeVisible();
    await expect(page.getByText("부채 평가차액", { exact: false })).toBeVisible();
    // 자산 1행 + 부채 1행 = 계정과목 input 2개
    await expect(page.getByPlaceholder("계정과목")).toHaveCount(2);
  });

  test("ON → OFF → 계정과목 input 사라짐(총액 모드 복귀)", async ({ page }) => {
    await gotoV2FormalValuationCard(page);

    const toggle = deltaToggle(page);
    await toggle.scrollIntoViewIfNeeded();
    await toggle.click(); // ON
    await expect(page.getByPlaceholder("계정과목")).toHaveCount(2);

    await toggle.click(); // OFF
    await expect(page.getByPlaceholder("계정과목")).toHaveCount(0);
  });

  test("ON→OFF→ON 재토글 시 행 1개씩 — 중복 생성 없음", async ({ page }) => {
    await gotoV2FormalValuationCard(page);

    const toggle = deltaToggle(page);
    await toggle.scrollIntoViewIfNeeded();
    await toggle.click(); // ON (2)
    await expect(page.getByPlaceholder("계정과목")).toHaveCount(2);
    await toggle.click(); // OFF (0)
    await expect(page.getByPlaceholder("계정과목")).toHaveCount(0);
    await toggle.click(); // ON again → 다시 2 (4가 아님)
    await expect(page.getByPlaceholder("계정과목")).toHaveCount(2);
  });
});
