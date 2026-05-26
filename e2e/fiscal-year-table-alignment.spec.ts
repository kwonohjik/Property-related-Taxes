/**
 * E2E: 비상장 V2 사업연도 표 상단·하단 입력 열 정렬 (작업 A)
 *
 * 검증 (docs/00-pm/ui-polish-fiscal-align-netasset-label.plan.md 작업 A):
 *   상단 연도/개시일/종료일 입력 3열과 하단 ①②③ 입력 3열이
 *   동일 grid 트랙(라벨 13rem + 3년 균등)을 공유하여 세로 정렬된다.
 *   → 1년전 열의 상단 연도 input과 하단 ① 첫 입력의 x좌표·너비가 일치.
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

test.describe("사업연도 표 상하 입력 열 정렬", () => {
  test("상단 연도 입력과 하단 ① 입력이 동일 x·width로 세로 정렬된다", async ({ page }) => {
    await gotoV2FormalValuationCard(page);

    // 상단 1년전 열 연도 input (placeholder 유지)
    const topYearInput = page.getByPlaceholder("사업연도 라벨").nth(0);
    await expect(topYearInput).toBeVisible({ timeout: 5_000 });

    // 하단 ① 행(각 사업연도 소득금액)의 첫 입력(1년전 열)
    const incomeRow = page.locator('[role="row"]').filter({ hasText: "각 사업연도 소득금액" });
    const bottomFirstInput = incomeRow.getByPlaceholder("0").nth(0);
    await expect(bottomFirstInput).toBeVisible();

    const top = await topYearInput.boundingBox();
    const bottom = await bottomFirstInput.boundingBox();
    expect(top).not.toBeNull();
    expect(bottom).not.toBeNull();

    // 같은 grid 2열(1년전) → x좌표·너비 일치 (border/padding 차 ±3px 허용)
    expect(Math.abs(top!.x - bottom!.x)).toBeLessThan(3);
    expect(Math.abs(top!.width - bottom!.width)).toBeLessThan(3);
  });

  test("3개 연도 열의 하단 입력 폭이 균등하다", async ({ page }) => {
    await gotoV2FormalValuationCard(page);

    const incomeRow = page.locator('[role="row"]').filter({ hasText: "각 사업연도 소득금액" });
    const inputs = incomeRow.getByPlaceholder("0");
    const w0 = (await inputs.nth(0).boundingBox())!.width;
    const w1 = (await inputs.nth(1).boundingBox())!.width;
    const w2 = (await inputs.nth(2).boundingBox())!.width;

    expect(Math.abs(w0 - w1)).toBeLessThan(2);
    expect(Math.abs(w1 - w2)).toBeLessThan(2);
  });
});
