/**
 * transfer-multi-house-marriage.spec.ts
 *
 * #2a 혼인 합가 — 양도세 Step 4(보유 상황) 주택 편집 모달의 「양도일 현재도 배우자 쪽이 보유하나요」 질문(§167의3⑨, 결정 #47).
 *
 * 종전 「배우자 단독 보유 주택」 칩(혼인합가일만 입력하면 노출)은 #47에서 사실 질문으로 대체됐다. 질문은 혼인합가일만으로
 * 열리지 않고 `spouseHoldingQuestionApplies`(혼인 5년 안 양도 · 3주택↑ · 중과가 걸리는 양도)가 모두 맞을 때만 열린다.
 *
 * 실행: E2E_PORT=3103 npx playwright test e2e/transfer-multi-house-marriage.spec.ts
 */

import { test, expect, type Page } from "@playwright/test";
import { fillAcquisitionDateInDialog } from "./_helpers/add-house-row";
import { gotoSpouseHoldingOpenForm } from "./_helpers/spouse-holding-seed";

async function gotoHoldingStepWithTwoHouses(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByRole("button", { name: "보유 상황" }).first().click();
  // 명부 필수화(PR-1, 2026-10-05) — "housing"은 "2채" 버튼이 사라졌다(Q-6). 목록은 항상 열려 있다.
  await expect(page.getByText("다른 보유 주택 목록", { exact: false }).first()).toBeVisible();
}

/** 질문(배우자 쪽/그 밖의 행 어느 쪽이든)과 옛 칩이 모두 없는지 */
const noSpouseHoldingUi = async (scope: Page | ReturnType<Page["getByRole"]>) => {
  await expect(scope.locator('[data-testid^="spouse-holding-"]')).toHaveCount(0);
  await expect(scope.getByRole("switch", { name: /배우자 단독 보유 주택/ })).toHaveCount(0);
};

test.describe("#2a 혼인 합가 「양도일 현재 배우자 보유」 질문", () => {
  test("혼인합가일을 입력해도 조건(조정 · 3주택↑ · 혼인 5년 안 양도)이 안 맞으면 질문이 없다", async ({ page }) => {
    await gotoHoldingStepWithTwoHouses(page);

    await page.getByRole("button", { name: /주택 추가/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 3000 });
    await noSpouseHoldingUi(dialog);
    await fillAcquisitionDateInDialog(dialog, "2018-01-01");
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

    // 주택 행 편집 → 모달 재오픈 — 혼인일이 있어도 2주택·비조정이라 질문은 닫혀 있다(옛 칩은 이 시점에 노출됐다).
    await page.getByRole("table").first().getByRole("button", { name: /편집/ }).first().click();
    await expect(dialog).toBeVisible({ timeout: 3000 });
    await noSpouseHoldingUi(dialog);
  });

  test("조건 충족 — 배우자 쪽 행은 예/아니오/모름 3지선다가 열리고 답이 유지된다 / 그 밖의 행은 예/아니오", async ({ page }) => {
    await gotoSpouseHoldingOpenForm(page, { houseCount: 2 });
    const dialog = page.getByRole("dialog");

    await page.getByRole("button", { name: "주택 1 편집" }).click();
    await expect(dialog).toBeVisible({ timeout: 3000 });
    await expect(dialog.getByTestId("spouse-holding-spouse_side")).toBeVisible();
    await expect(dialog.getByTestId("spouse-holding-unknown-h1")).toBeVisible();
    await expect(dialog.getByRole("switch", { name: /배우자 단독 보유 주택/ })).toHaveCount(0);
    await dialog.getByTestId("spouse-holding-yes-h1").check();
    await expect(dialog.getByTestId("spouse-holding-yes-h1")).toBeChecked();
    await dialog.getByRole("button", { name: "완료" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 3000 });

    // 다시 열어도 답이 남는다
    await page.getByRole("button", { name: "주택 1 편집" }).click();
    await expect(dialog.getByTestId("spouse-holding-yes-h1")).toBeChecked();
  });
});
