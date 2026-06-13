/**
 * E2E: 비과세 재산 상속인별 귀속(협의분할) (작업4) — 2026-06-13
 *
 * 정책: [[feedback_browser_verify_with_playwright]]
 *
 * 검증:
 *  - 공익법인 출연(§16) 체크 → 협의분할 ToggleCard 노출(상속세 전용)
 *  - ON → HeirAllocationInput 칩으로 상속인별 분배(합=청구액 → validation 통과)
 *  - 계산 → 결과 도달 + ㉠ "과세제외 재산" 행 노출
 *
 * 체크리스트 UI 업데이트 (2026-06-13):
 *  - 항목 "여" 클릭 대신 체크리스트 칩 클릭으로 선택
 */

import { test, expect, type Page } from "@playwright/test";
import { nextSteps, calcAndWaitResult, addHeir, addLandAsset } from "./_helpers/tax-flow";

/** Step0(배우자+자녀) → Step1(토지 10억) → Step2(비과세, 마스터 여) */
async function gotoExemptionStep(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill("2026");
  await page.getByLabel("월").first().fill("5");
  await page.getByLabel("일").first().fill("15");

  await addHeir(page, "heir", "spouse", { residentNumber: "700101-2000000" });
  await addHeir(page, "heir", "child", { residentNumber: "000101-3000000" });

  await page.getByRole("button", { name: /^다음/ }).click(); // → Step1

  // Step1: 토지 (보충적 평가 1,000㎡ × 100만 = 10억)
  await addLandAsset(page, { area: "1000", unitPrice: "1000000" });

  // Step2 진입
  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByText(/비과세.*불산입 선택/)).toBeVisible();
  // 마스터 "여"
  await expect(page.getByText(/비과세.*불산입 선택/)).toBeVisible();
}

test.describe("비과세 재산 상속인별 귀속 (작업4)", () => {
  test("EHA-1: 공익법인 칩 클릭 → 협의분할 ON → 배우자 귀속 → 계산 통과 + 과세제외 행", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoExemptionStep(page);

    // 공익법인 출연 칩 클릭 → 과세가액 불산입 그룹 펼침 + 항목 노출
    await page.getByRole("button", { name: /공익법인 출연/ }).first().click();
    await expect(page.getByText("공익법인 출연 재산")).toBeVisible();

    // 금액 입력
    await page.getByPlaceholder("금액 입력").first().fill("100000000");

    // 협의분할 ToggleCard 노출 + ON (비과세 항목 내부 — first로 특정)
    const allocToggle = page.getByRole("switch", { name: /협의분할 \(상속인별 분배\)/ });
    await expect(allocToggle).toBeVisible();
    await allocToggle.click();

    // 배우자 칩 클릭 → 잔여(전액 1억) 자동 채움 → 합 = 청구액(validation 통과)
    await page.getByRole("button", { name: /배우자/ }).first().click();

    // Step3 → Step4 → 계산 → 결과
    await nextSteps(page, 2);
    await calcAndWaitResult(page);

    // 과세제외 내역 카드 (ExemptionSummaryCard) 노출
    await expect(page.getByText("과세제외 내역").first()).toBeVisible();
  });
});
