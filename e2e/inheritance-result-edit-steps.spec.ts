/**
 * E2E: 상속세 결과 화면 → 입력 단계 바로가기(⑤)
 *
 * 검증:
 *   EDIT-1: 결과 화면에 "입력 단계로 돌아가 수정" 칩 노출 + 상속재산 칩 클릭 →
 *           2단계(상속재산) 이동 + 입력 보존(자산 유지 → step-circle-1 complete).
 *   EDIT-2: 공제·세액공제 칩 클릭 → 5단계(공제·세액공제) 이동(요약 카드 노출).
 *
 * 정책: [[feedback_browser_verify_with_playwright]]
 */
import { test, expect, type Page } from "@playwright/test";
import {
  fillDateAndVerify,
  addHeir,
  addLandAsset,
  nextSteps,
  calcAndWaitResult,
} from "./_helpers/tax-flow";

async function calcToResult(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await fillDateAndVerify(page, { year: "2024", month: "6", day: "10" });
  await addHeir(page, "heir", "child");
  await nextSteps(page, 1); // → 상속재산
  await addLandAsset(page, { area: "300", unitPrice: "10000000" });
  await nextSteps(page, 3); // → 비과세 → 사전증여 → 공제·세액공제
  await calcAndWaitResult(page);
}

test.describe("상속세 결과 → 입력 단계 바로가기", () => {
  test("EDIT-1: 상속재산 칩 → 2단계 이동 + 입력 보존", async ({ page }) => {
    test.setTimeout(90_000);
    await calcToResult(page);

    const editBar = page.getByTestId("result-edit-steps");
    await expect(editBar).toBeVisible();

    // 상속재산 칩 클릭 → 2단계 이동
    await editBar.getByRole("button", { name: /상속재산/ }).click();

    // 상속재산 단계 진입 확인
    await expect(page.getByRole("button", { name: /상속재산 추가/ })).toBeVisible();
    // 입력 보존 — 자산이 남아 있어 검증 통과(단계 배지 complete)
    await expect(page.getByTestId("step-circle-1")).toHaveAttribute(
      "data-status",
      "complete",
    );
  });

  test("EDIT-2: 공제·세액공제 칩 → 5단계 이동", async ({ page }) => {
    test.setTimeout(90_000);
    await calcToResult(page);

    await page
      .getByTestId("result-edit-steps")
      .getByRole("button", { name: /공제·세액공제/ })
      .click();

    // 5단계(공제·세액공제) — 계산 직전 요약 카드 노출로 확인
    await expect(page.getByTestId("inheritance-review-summary")).toBeVisible();
  });
});
