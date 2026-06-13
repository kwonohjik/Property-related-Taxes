/**
 * E2E: "기타(other)" 수증자 상속인/비상속인 분류 + 모달 증여가액 요약 삭제
 *
 * 계획서: docs/02-design/features/prior-gift-donee-classification-fix.*
 * 정책: [[feedback_browser_verify_with_playwright]]
 *
 *  OD-1: "기타"(토글 OFF=기본) 수증자 → §13①2호 비상속인 5년 배지 (며느리 케이스)
 *  OD-2: "기타"(토글 ON) 수증자 → §13①1호 상속인 10년 배지 (4순위 방계)
 *  OD-3: 사전증여 편집 모달에 "증여가액" 요약 부재 (이슈 2)
 */

import { test, expect, type Page } from "@playwright/test";
import { addHeir, addLandAsset } from "./_helpers/tax-flow";

/** Step0(배우자+기타) → 기타 토글 조작 → Step3 사전증여 → 기타 수증자 선택. 편집 모달 locator 반환 */
async function gotoStep3WithOtherDonee(page: Page, asHeir: boolean) {
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill("2024");
  await page.getByLabel("월").first().fill("6");
  await page.getByLabel("일").first().fill("10");

  await addHeir(page, "heir", "spouse");
  // 기타(며느리) — 모달 유지하여 "상속인 여부" 토글 조작
  await addHeir(page, "other", undefined, { keepModalOpen: true });
  const heirDialog = page.getByRole("dialog", { name: "상속인 편집" });
  const toggle = heirDialog.getByText("상속인 여부");
  await expect(toggle).toBeVisible(); // 기본 OFF(비상속인)
  if (asHeir) await toggle.click(); // ON → 상속인
  await heirDialog.getByRole("button", { name: "닫기" }).click();
  await expect(heirDialog).toBeHidden();

  // Step0 → Step1(상속재산) 이동 후 자산 추가 → Step2 → Step3
  await page.getByRole("button", { name: /^다음/ }).click();
  await addLandAsset(page, { area: "300", unitPrice: "1000000" });
  await page.getByRole("button", { name: /^다음/ }).click();
  await page.getByRole("button", { name: /^다음/ }).click();

  // 사전증여 추가 → 편집 모달
  await page.getByRole("button", { name: /사전증여 추가/ }).click();
  const giftDialog = page.getByTestId("prior-gift-edit-dialog");
  await expect(giftDialog).toBeVisible({ timeout: 5_000 });
  await giftDialog.getByRole("textbox", { name: "연도" }).fill("2020");
  await giftDialog.getByRole("textbox", { name: "월" }).fill("1");
  await giftDialog.getByRole("textbox", { name: "일" }).fill("1");
  await giftDialog.getByPlaceholder("금액 입력").first().fill("250000000");
  // 수증자 옵션: [선택안함, 배우자, 기타] → 기타 = index 2
  await giftDialog.getByTestId("gift-donee-select").selectOption({ index: 2 });
  return giftDialog;
}

test.describe("기타 수증자 상속인 분류", () => {
  test("OD-1: 기타(토글 OFF) → 비상속인 §13①2호 5년 배지", async ({ page }) => {
    test.setTimeout(90_000);
    const d = await gotoStep3WithOtherDonee(page, false);
    await expect(d.getByTestId("gift-donee-summary")).toContainText(
      "비상속인 · §13①2호 5년 합산",
    );
  });

  test("OD-2: 기타(토글 ON) → 상속인 §13①1호 10년 배지", async ({ page }) => {
    test.setTimeout(90_000);
    const d = await gotoStep3WithOtherDonee(page, true);
    await expect(d.getByTestId("gift-donee-summary")).toContainText(
      "상속인 · §13①1호 10년 합산",
    );
  });

  test("OD-3: 사전증여 편집 모달에 '증여가액' 요약 부재 (이슈2)", async ({ page }) => {
    test.setTimeout(90_000);
    const d = await gotoStep3WithOtherDonee(page, false);
    await expect(d.getByText("증여가액", { exact: true })).toHaveCount(0);
  });
});
