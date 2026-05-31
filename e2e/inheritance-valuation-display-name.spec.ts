/**
 * E2E: 재산 평가 내역 표시명 — 내부 id 미노출
 *
 * 버그(이미지51): 자산 이름(name)을 비우면 "재산 평가 내역"에 내부 id(prop-…·stock-…)가
 *   그대로 노출됨. → 이름 미입력 시 카테고리 한글 라벨("토지" 등)로 표시.
 *
 * 정책: [[feedback_browser_verify_with_playwright]] · "알 수 없는 문자열 출력 금지"
 */
import { test, expect } from "@playwright/test";

test("재산 평가 내역 — 이름 미입력 자산은 카테고리 라벨, 내부 id(prop-/stock-) 미노출", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill("2024");
  await page.getByLabel("월").first().fill("6");
  await page.getByLabel("일").first().fill("10");

  // 자녀 1명
  await page.getByRole("button", { name: /상속인 추가/ }).click();
  await page.getByText("자녀", { exact: true }).click();
  await page.getByRole("button", { name: /^다음/ }).click();

  // 토지 추가 (이름 미입력)
  await page.getByRole("button", { name: /상속재산 추가/ }).click();
  await page.getByRole("button", { name: /토지/ }).first().click();
  await page.getByPlaceholder("면적 입력").fill("300");
  await page.getByPlaceholder("공시지가 단가").fill("1000000");

  // 결과까지
  await page.getByRole("button", { name: /^다음/ }).click();
  await page.getByRole("button", { name: /^다음/ }).click();
  await page.getByRole("button", { name: /^다음/ }).click();
  await page.getByRole("button", { name: /계산하기/ }).click();
  await expect(page.getByText("상속세 결정세액")).toBeVisible({ timeout: 20_000 });

  // 재산 평가 내역 펼침
  await page.getByRole("button", { name: /재산 평가 내역/ }).click();

  // ① 내부 id(prop-…·stock-…) 전역 미노출 (핵심)
  await expect(page.getByText(/prop-\d/)).toHaveCount(0);
  await expect(page.getByText(/stock-\d/)).toHaveCount(0);

  // ② 카테고리 한글 라벨 표시
  await expect(page.getByText("토지", { exact: true }).first()).toBeVisible({
    timeout: 5_000,
  });
});
