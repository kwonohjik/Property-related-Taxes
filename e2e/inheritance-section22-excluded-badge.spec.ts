/**
 * E2E: D-5 — §22② 최대주주 보유주식 배제 echo 배지
 *
 * 계획서: docs/00-pm/inheritance-stock-section22-toggle-consolidation.plan.md D-5
 *
 * 시나리오:
 *   D5-a: 상장주식 §22② 토글 ON → 결과 화면 "공제 상세 내역" 펼침 시 배지 노출
 *   D5-b: 토글 OFF(기본) → 결과 화면 배지 미노출
 *
 * 검증 방식:
 *   상장주식 평균 단가·수량 입력(§22 평가액 반영) → 최대주주 토글 ON → 마법사 완료 →
 *   결과 화면 "상속공제 상세 내역" 펼침 → data-testid="section22-excluded-badge" 노출 확인.
 *
 *   OFF 시: 동일 플로우에서 배지 count=0.
 *
 * 정책:
 *   [[feedback_browser_verify_with_playwright]] — 수동 안내 금지, spec 통과로 브라우저 확인 충족
 */

import { test, expect, type Page } from "@playwright/test";
import {
  fillDateAndVerify,
  fillAndVerify,
  nextSteps,
  calcAndWaitResult,
  addHeir,
  closeStockModal,
} from "./_helpers/tax-flow";

/**
 * Step0(피상속인·상속인) 입력 후 Step1(상속재산)으로 이동.
 * 상속인: 자녀 1명.
 */
async function gotoStep1WithListedStock(page: Page) {
  await page.goto("/calc/inheritance-tax");

  // Step0: 상속개시일 (값 커밋 검증)
  await fillDateAndVerify(page, { year: "2024", month: "6", day: "10" });

  // 상속인(자녀) 추가
  await addHeir(page, "heir", "child");

  // Step1(상속재산) 이동
  await nextSteps(page, 1);

  // 상장주식 카드 추가
  await page.getByRole("button", { name: /주식·지분 추가/ }).click();
  await page.getByText("상장주식", { exact: true }).click();

  // 최소 평가액 입력: 주당 평균가 100,000 × 수량 100 = 10,000,000 (값 커밋 검증)
  await fillAndVerify(page.getByPlaceholder("주당 순손익 입력 (원)"), "100000");
  await fillAndVerify(page.getByPlaceholder("주식 수 입력"), "100");
}

/**
 * Step1 → Step2 → Step3 → Step4(공제) → "계산하기" → 결과 화면 대기
 */
async function proceedToResult(page: Page) {
  // 주식 편집 모달이 열려 있으면 닫기 — backdrop이 "다음"을 막음 (테이블+모달 전환)
  await closeStockModal(page);
  // Step2(비과세·장례비) → Step3(사전증여) → Step4(공제·세액공제)
  await nextSteps(page, 3);
  // 계산 API 응답 명시 대기 + 결과 노출
  await calcAndWaitResult(page);
}

/**
 * 결과 화면에서 "상속공제 상세 내역" 펼치기 + "금융재산 공제 (§22)" 하위 펼치기
 * (section22-excluded-badge는 FinancialDeductionDetailCard.open=true 시만 렌더)
 */
async function expandDeductionBreakdown(page: Page) {
  await page.getByTestId("deduction-breakdown-toggle").click();
  // "금융재산 공제 (§22)" 텍스트를 가진 div 내 "펼치기" aria-label 버튼 클릭
  await page
    .locator("div.flex.items-center.justify-between")
    .filter({ hasText: "금융재산 공제 (§22)" })
    .getByRole("button", { name: "펼치기" })
    .click();
}

test.describe("D-5: §22② 최대주주 보유주식 배제 echo 배지", () => {
  test("D5-a: 상장주식 §22② 토글 ON → 결과 화면 배지 '1건 제외' 노출", async ({ page }) => {
    test.setTimeout(90_000);

    await gotoStep1WithListedStock(page);

    // §22② 최대주주 토글 ON
    await page.getByText("최대주주에 해당", { exact: true }).click();

    await proceedToResult(page);
    await expandDeductionBreakdown(page);

    // §22② 배제 배지 노출 확인
    const badge = page.getByTestId("section22-excluded-badge");
    await expect(badge).toBeVisible({ timeout: 5_000 });
    await expect(badge).toContainText("§22②");
    await expect(badge).toContainText("1건 제외");
  });

  test("D5-b: 상장주식 §22② 토글 OFF(기본) → 결과 화면 배지 미노출", async ({ page }) => {
    test.setTimeout(90_000);

    await gotoStep1WithListedStock(page);

    // 토글 ON 하지 않음 (기본 OFF)

    await proceedToResult(page);
    await expandDeductionBreakdown(page);

    // 배지 미표시 확인
    await expect(page.getByTestId("section22-excluded-badge")).toHaveCount(0);
  });
});
