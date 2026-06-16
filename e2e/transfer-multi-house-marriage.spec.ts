/**
 * transfer-multi-house-marriage.spec.ts
 *
 * #2a 혼인 합가 — 양도세 Step 4(보유 상황) → 혼인합가일 입력 시
 * 주택 편집 모달에 "배우자 단독 보유 주택" chip(§167의3⑨) 조건부 노출 검증.
 *
 * 노출 규약: showSpouseOwned = !!form.marriageDate (혼인합가일 입력 시에만).
 *
 * 실행: E2E_PORT=3103 npx playwright test e2e/transfer-multi-house-marriage.spec.ts
 */

import { test, expect, type Page } from "@playwright/test";

async function gotoHoldingStepWithTwoHouses(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByRole("button", { name: "보유 상황" }).first().click();
  await page.getByRole("button", { name: "2채", exact: true }).click();
  await expect(page.getByText("다른 보유 주택 목록", { exact: false }).first()).toBeVisible();
}

const spouseSwitch = (scope: Page | ReturnType<Page["getByRole"]>) =>
  scope.getByRole("switch", { name: /배우자 단독 보유 주택/ });

test.describe("#2a 혼인 합가 배우자 단독 보유 chip", () => {
  test("혼인합가일 미입력 → chip 숨김 / 입력 → chip 노출", async ({ page }) => {
    await gotoHoldingStepWithTwoHouses(page);

    // 주택 추가 → 모달 자동 오픈 (혼인합가일 미입력 → chip 숨김)
    await page.getByRole("button", { name: /주택 추가/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 3000 });
    await expect(spouseSwitch(dialog)).toHaveCount(0);
    await dialog.getByRole("button", { name: "완료" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 3000 });

    // 혼인합가일 입력 (라벨 "혼인합가일" 블록으로 스코프 → 연/월/일)
    const marriageBlock = page
      .locator("div")
      .filter({ hasText: "혼인합가일" })
      .filter({ has: page.getByLabel("연도") })
      .last();
    await marriageBlock.getByLabel("연도").fill("2021");
    await marriageBlock.getByLabel("월").fill("6");
    await marriageBlock.getByLabel("일").fill("1");

    // 주택 행 편집 → 모달 재오픈 → chip 노출 + 토글 동작
    await page.getByRole("table").first().getByRole("button", { name: /편집/ }).first().click();
    await expect(dialog).toBeVisible({ timeout: 3000 });
    await expect(spouseSwitch(dialog)).toBeVisible();
    await spouseSwitch(dialog).click();
    await expect(spouseSwitch(dialog)).toBeChecked();
  });
});
