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

async function fillStep0WithSevenChildren(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill("2024");
  await page.getByLabel("월").first().fill("6");
  await page.getByLabel("일").first().fill("10");
  for (let i = 0; i < 7; i++) {
    await page.getByRole("button", { name: /상속인 추가/ }).click();
    await page.getByText("자녀", { exact: true }).last().click();
  }
  await page.getByRole("button", { name: /^다음/ }).click(); // → Step1
}

async function addLandAsset(page: Page) {
  await page.getByRole("button", { name: /상속재산 추가/ }).click();
  await page.getByRole("button", { name: /토지/ }).first().click();
  await page.getByPlaceholder("면적 입력").fill("600");
  await page.getByPlaceholder("공시지가 단가").fill("10000000");
}

async function gotoStep4(page: Page) {
  await page.getByRole("button", { name: /^다음/ }).click(); // → Step2
  await page.getByRole("button", { name: /^다음/ }).click(); // → Step3
  await page.getByRole("button", { name: /^다음/ }).click(); // → Step4
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

    await page.getByRole("button", { name: /계산하기/ }).click();

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
    await page.getByRole("button", { name: /계산하기/ }).click();

    // 공제 상세 펼친 후에도 단서 Row 없음
    await page.getByRole("button", { name: /상속공제 상세 내역/ }).click();
    await expect(
      page.getByText("무신고 — 일괄공제 5억 고정 (§21① 단서)"),
    ).toHaveCount(0);
  });
});
