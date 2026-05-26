/**
 * E2E: 순자산가액 표 좌측 라벨 폭 확대 검증 (작업 B)
 *
 * 검증 (docs/00-pm/ui-polish-fiscal-align-netasset-label.plan.md 작업 B):
 *   자산/부채행 라벨 16rem(256px) 적용 + 입력란이 금액 표시에 충분한 폭 유지.
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

test.describe("순자산가액 표 라벨 폭", () => {
  test("자산행 라벨 폭 ≈ 16rem(256px), 입력란 충분 폭", async ({ page }) => {
    await gotoV2FormalValuationCard(page);

    // 자산총액 첫 행 "① + 재무상태표상 자산가액"의 라벨 셀
    const label = page.getByText("재무상태표상 자산가액", { exact: false }).first();
    await label.scrollIntoViewIfNeeded();
    await expect(label).toBeVisible();

    const labelBox = await label.boundingBox();
    // 같은 grid 행(라벨 셀의 부모)의 입력란
    const row = label.locator("..");
    const inputBox = await row.locator("input").first().boundingBox();

    expect(labelBox).not.toBeNull();
    expect(inputBox).not.toBeNull();

     
    console.log(`[자산행] 라벨폭=${labelBox!.width}px / 입력폭=${inputBox!.width}px`);

    // 16rem = 256px (셀 padding/오차 허용)
    expect(labelBox!.width).toBeGreaterThan(244);
    expect(labelBox!.width).toBeLessThan(272);
    // 입력란은 12자리 금액 표시에 충분한 폭(>= 140px)
    expect(inputBox!.width).toBeGreaterThan(140);
  });

  test("부채행 라벨도 동일 16rem 폭", async ({ page }) => {
    await gotoV2FormalValuationCard(page);

    const label = page.getByText("재무상태표상 부채액", { exact: false }).first();
    await label.scrollIntoViewIfNeeded();
    await expect(label).toBeVisible();

    const labelBox = await label.boundingBox();
     
    console.log(`[부채행] 라벨폭=${labelBox!.width}px`);
    expect(labelBox!.width).toBeGreaterThan(244);
    expect(labelBox!.width).toBeLessThan(272);
  });
});
