/**
 * E2E: 재산 평가 내역 표시명 — 내부 id 미노출
 *
 * 버그(이미지51): 자산 이름(name)을 비우면 "재산 평가 내역"에 내부 id(prop-…·stock-…)가
 *   그대로 노출됨. → 이름 미입력 시 카테고리 한글 라벨("토지" 등)로 표시.
 *
 * 정책: [[feedback_browser_verify_with_playwright]] · "알 수 없는 문자열 출력 금지"
 */
import { test, expect } from "@playwright/test";
import {
  addLandAsset,
  calcAndWaitResult,
  fillDateAndVerify,
  nextSteps,
} from "./_helpers/tax-flow";

test("재산 평가 내역 — 이름 미입력 자산은 카테고리 라벨, 내부 id(prop-/stock-) 미노출", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto("/calc/inheritance-tax");
  await fillDateAndVerify(page, { year: "2024", month: "6", day: "10" });

  // 자녀 1명
  await page.getByRole("button", { name: /상속인 추가/ }).click();
  await page.getByText("자녀", { exact: true }).click();
  await page.getByPlaceholder("앞 6자리-뒤 7자리").last().fill("700101-1000000");
  await page.getByRole("button", { name: /^다음/ }).click();

  // 토지 추가 (이름 미입력)
  await addLandAsset(page, { area: "300", unitPrice: "1000000" });

  // 결과까지
  await nextSteps(page, 3);
  await calcAndWaitResult(page);

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
