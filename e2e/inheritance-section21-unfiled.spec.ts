/**
 * E2E: 상속세 §21① 단서 — 무신고 시 일괄공제 5억 고정
 *
 * 검증:
 *   1. Step4(공제·세액공제) "신고 상태" 라디오 3선택 노출 (정기/기한후/무신고)
 *   2. "무신고" 선택 + 계산 → 결과 공제 펼침에 "무신고 — 일괄공제 5억 고정 (§21① 단서)" 표시
 *   3. "정기신고"(기본) → 단서 Row 미표시
 *
 * 시나리오: 자녀 7명 — 토지 60억 → 기초2억+인적3.5억(5.5억) > 5억.
 *   정기신고: 본문 max 5.5억 / 무신고: 단서 5억 고정.
 *
 * 정책: [[feedback_browser_verify_with_playwright]]
 */
import { test, expect, type Page } from "@playwright/test";
import {
  fillDateAndVerify,
  addLandAsset as addLandAssetShared,
  nextSteps,
  calcAndWaitResult,
} from "./_helpers/tax-flow";

async function fillStep0WithSevenChildren(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await fillDateAndVerify(page, { year: "2024", month: "6", day: "10" });
  for (let i = 0; i < 7; i++) {
    await page.getByRole("button", { name: /상속인 추가/ }).click();
    await page.getByText("자녀", { exact: true }).last().click();
  }
  await nextSteps(page, 1); // → Step1
}

async function addLandAsset(page: Page) {
  await addLandAssetShared(page, { area: "600", unitPrice: "10000000" });
}

async function gotoStep4(page: Page) {
  await nextSteps(page, 3); // Step1 → Step2 → Step3 → Step4
}

test.describe("§21① 단서 무신고 일괄공제", () => {
  test("UNF-E2E-1: 무신고 선택 → 결과 단서 Row 표시", async ({ page }) => {
    test.setTimeout(90_000);

    await fillStep0WithSevenChildren(page);
    await addLandAsset(page);
    await gotoStep4(page);

    // 신고 상태 라디오 — 무신고 선택
    await expect(
      page.getByText("신고 상태 (§67 · §69 신고세액공제 · §21① 일괄공제)"),
    ).toBeVisible();
    await page.getByText("무신고", { exact: true }).click();

    await calcAndWaitResult(page);

    // 결과 — 공제 상세 펼침 후 단서 Row 확인
    await page.getByRole("button", { name: /상속공제 상세 내역/ }).click();
    await expect(
      page.getByText("무신고 — 일괄공제 5억 고정 (§21① 단서)"),
    ).toBeVisible();
  });

  test("UNF-E2E-2: 정기신고(기본) → 단서 Row 없음", async ({ page }) => {
    test.setTimeout(90_000);

    await fillStep0WithSevenChildren(page);
    await addLandAsset(page);
    await gotoStep4(page);

    // 기본 정기신고 그대로 계산
    await calcAndWaitResult(page);

    // 공제 상세 펼친 후에도 단서 Row 없음
    await page.getByRole("button", { name: /상속공제 상세 내역/ }).click();
    await expect(
      page.getByText("무신고 — 일괄공제 5억 고정 (§21① 단서)"),
    ).toHaveCount(0);
  });
});
