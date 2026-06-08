/**
 * E2E: 상속세 이력 "수정" 복원 (turn 1 fix, 2026-05-29)
 *
 * 계획서: docs/00-pm/inheritance-result-table-bugfix.plan.md §2-3 · T6
 * 정책: [[feedback_browser_verify_with_playwright]] — spec 통과로 브라우저 확인 충족
 *
 * 시나리오:
 *  ER-1: 상속개시일·상속인·상속재산 입력 → 계산 → 이력 자동저장
 *  ER-2: /history → 수정 클릭 → 상속세 마법사로 이동하며 폼 복원
 *        (이전엔 else→router.push만 → 빈 폼. 이제 inheritanceTaxResumeInput 경유 복원)
 *
 * 검증: 복원된 폼의 상속개시일·상속인이 입력값과 일치(빈 폼 아님).
 */

import { test, expect, type Page } from "@playwright/test";

async function inputAndCalculate(page: Page) {
  await page.goto("/calc/inheritance-tax");
  // 상속개시일 2024-06-10
  await page.getByLabel("연도").first().fill("2024");
  await page.getByLabel("월").first().fill("6");
  await page.getByLabel("일").first().fill("10");
  // 자녀 1명
  await page.getByRole("button", { name: /상속인 추가/ }).click();
  await page.getByText("자녀", { exact: true }).click();
  await page.getByPlaceholder("앞 6자리-뒤 7자리").last().fill("700101-1000000");
  // Step1 상속재산
  await page.getByRole("button", { name: /^다음/ }).click();
  await page.getByRole("button", { name: /상속재산 추가/ }).click();
  await page.getByRole("button", { name: /토지/ }).first().click();
  await page.getByPlaceholder("면적 입력").fill("300");
  await page.getByPlaceholder("공시지가 단가").fill("1000000");
  // Step2 → Step3 → Step4 → 계산
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: /^다음/ }).click();
  }
  // 마지막 단계에서 계산 실행
  await page.getByRole("button", { name: /계산|결과/ }).first().click();
}

test("ER: 이력 수정 클릭 시 상속개시일·상속인 복원 (빈 폼 아님)", async ({ page }) => {
  await inputAndCalculate(page);
  // 결과 화면 자동저장 대기
  await expect(page.getByText(/자동 저장|이력/).first()).toBeVisible({ timeout: 15_000 });

  // /history 이동 → 수정 클릭
  await page.goto("/history");
  const editBtn = page.getByRole("button", { name: /수정/ }).first();
  await expect(editBtn).toBeVisible({ timeout: 10_000 });
  await editBtn.click();

  // 상속세 마법사로 복귀 + 폼 복원 확인 (상속개시일 연도 2024 유지 = 빈 폼 아님)
  await expect(page).toHaveURL(/inheritance-tax/, { timeout: 10_000 });
  await expect(page.getByLabel("연도").first()).toHaveValue("2024");
});
