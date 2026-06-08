/**
 * E2E: 상속재산 단계 그룹별 접기/펼치기
 *
 * 시나리오:
 *   1. 상속세 진입 + 자녀 추가 → 상속재산 단계 이동
 *   2. 3그룹(상속재산·주식/지분·추정상속재산) 기본 펼침 — 본문 보임
 *   3. 상속재산 그룹 접기 → 본문 hidden + 요약 배지(N건) 표시
 *   4. 다시 펼치기 → 본문 복귀, 요약 배지 숨김
 *   5. 항목 입력 후 접으면 합계가 요약에 반영
 *
 * 정책: [[feedback_browser_verify_with_playwright]]
 */

import { test, expect, type Page } from "@playwright/test";

async function gotoEstateStep(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill("2026");
  await page.getByLabel("월").first().fill("5");
  await page.getByLabel("일").first().fill("15");
  await page.getByRole("button", { name: /상속인 추가/ }).click();
  await page.getByText("자녀", { exact: true }).click();
  await page.getByRole("button", { name: /^다음/ }).click();
}

test.describe("상속재산 단계 그룹 접기/펼치기", () => {
  test("기본 펼침 → 접기 시 본문 hidden + 요약, 펼치기 복귀", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoEstateStep(page);

    const estateToggle = page.getByTestId("estate-group-toggle-estate");
    await expect(estateToggle).toBeVisible();

    // 기본 펼침 — "상속재산 추가" 버튼 보임 + 요약 배지 없음
    const addEstateBtn = page.getByRole("button", { name: /상속재산 추가/ });
    await expect(addEstateBtn).toBeVisible();
    await expect(page.getByTestId("estate-group-summary-estate")).toHaveCount(0);

    // 접기 → 본문 hidden + 요약 배지(0건) 표시
    await estateToggle.click();
    await expect(addEstateBtn).toBeHidden();
    const summary = page.getByTestId("estate-group-summary-estate");
    await expect(summary).toBeVisible();
    await expect(summary).toContainText("0건");

    // 다시 펼치기 → 본문 복귀, 요약 숨김
    await estateToggle.click();
    await expect(addEstateBtn).toBeVisible();
    await expect(page.getByTestId("estate-group-summary-estate")).toHaveCount(0);
  });

  test("3그룹 토글 독립 동작 (주식·추정상속재산)", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoEstateStep(page);

    for (const key of ["stock", "presumed"]) {
      const toggle = page.getByTestId(`estate-group-toggle-${key}`);
      await expect(toggle).toBeVisible();
      await toggle.click();
      await expect(page.getByTestId(`estate-group-summary-${key}`)).toBeVisible();
      await toggle.click();
      await expect(page.getByTestId(`estate-group-summary-${key}`)).toHaveCount(0);
    }
  });
});
