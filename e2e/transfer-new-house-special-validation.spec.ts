/**
 * transfer-new-house-special-validation.spec.ts
 *
 * #3-B1 신축·준공후미분양 특례(소령 §167의3①12 가·나목) 비차단 경고.
 * 특례 의도(준공후미분양 토글 ON 또는 준공일 입력)인데 판정 필수필드(취득가액·전용면적)
 * 미입력 시, 계산은 진행하되 "특례 미적용" 경고를 인라인 노출.
 *
 * 실행: npx playwright test e2e/transfer-new-house-special-validation.spec.ts
 *       (worktree는 E2E_PORT=3106 ...)
 */

import { test, expect, type Page } from "@playwright/test";

async function gotoHoldingStepWithTwoHouses(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByRole("button", { name: "보유 상황" }).first().click();
  await page.getByRole("button", { name: "2채", exact: true }).click();
  await expect(page.getByText("다른 보유 주택 목록", { exact: false }).first()).toBeVisible();
}

test.describe("#3-B1 신축·준공후미분양 특례 비차단 경고", () => {
  test("준공후미분양 토글 ON + 필수필드 미입력 → 경고 노출 / 입력 시 해제", async ({ page }) => {
    await gotoHoldingStepWithTwoHouses(page);

    await page.getByRole("button", { name: /주택 추가/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 3000 });

    // 준공후미분양 토글 ON (취득가액·전용면적 미입력 상태)
    await dialog.getByRole("switch", { name: /준공후미분양/ }).click();

    // 비차단 경고 노출
    const warning = dialog.getByText(/특례 판정에는 취득가액·전용면적 입력이 필요/);
    await expect(warning).toBeVisible();

    // 전용면적만 입력 → 취득가액 미입력이라 경고 유지
    await dialog.getByPlaceholder("전용면적 ㎡").fill("50");
    await expect(warning).toBeVisible();

    // 취득가액까지 입력 → 경고 해제
    await dialog.getByPlaceholder("취득가액 입력").fill("500000000");
    await expect(warning).not.toBeVisible();
  });
});
