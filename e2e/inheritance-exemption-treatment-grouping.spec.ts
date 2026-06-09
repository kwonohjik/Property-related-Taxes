/**
 * E2E: 비과세(§12)/과세가액 불산입(§16·§17) 결과 화면 구분 표시 (작업1) — 2026-06-09
 *
 * 정책: [[feedback_browser_verify_with_playwright]]
 *
 * 검증:
 *  - 공익법인 출연(§16 불산입) + 족보·제구(§12 비과세) 혼재 입력 → 결과 화면
 *  - ExemptionSummaryCard 헤더 "과세제외 내역" + 비과세/과세가액 불산입 2그룹 분리
 *  - 과세 요약 카드에 "과세가액 불산입 차감" 행 분리 노출
 */

import { test, expect, type Page } from "@playwright/test";
import { nextSteps, calcAndWaitResult } from "./_helpers/tax-flow";

/** Step0(상속인) → Step1(토지 10억) → Step2(비과세) — 단계 네비 버튼으로 결정적 이동 */
async function gotoExemptionStep(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill("2026");
  await page.getByLabel("월").first().fill("5");
  await page.getByLabel("일").first().fill("15");
  await page.getByRole("button", { name: /상속인 추가/ }).click();
  await page.getByText("자녀", { exact: true }).click();
  await page.getByPlaceholder("앞 6자리-뒤 7자리").last().fill("700101-1000000"); // 주민번호 필수(계산 차단 회피)
  await page.getByRole("button", { name: /^다음/ }).click(); // → Step1

  // Step1: 토지 1건 (보충적 평가 1,000㎡ × 100만 = 10억 — 비과세 클램프 회피)
  await page
    .getByRole("button", { name: /재산 추가|상속재산 추가/ })
    .first()
    .click();
  await page.getByRole("button", { name: /토지/ }).first().click();
  await page.getByRole("switch", { name: /보충적 평가방법/ }).click();
  await page.getByPlaceholder("면적 입력").fill("1000");
  await page.getByPlaceholder("공시지가 단가").fill("1000000");

  await page.getByRole("button", { name: /비과세.*단계로 이동/ }).click();
  await expect(page.getByText(/비과세.*해당 여부/)).toBeVisible();
  await page.getByRole("button", { name: "여", exact: true }).first().click(); // 마스터 토글
}

test.describe("비과세/과세가액 불산입 결과 구분 표시 (작업1)", () => {
  test("ETR-1: 공익법인(불산입)+족보(비과세) → 결과 '과세제외 내역' 2그룹 + 요약 2행", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoExemptionStep(page);

    // 공익법인 출연 재산(§16 과세가액 불산입) — 여 + 1억
    const publicRow = page
      .locator("div.rounded-lg.border")
      .filter({ hasText: "공익법인 출연 재산" });
    await publicRow.getByRole("button", { name: "여", exact: true }).click();
    await publicRow.getByPlaceholder("금액 입력").fill("100000000");

    // 족보·제구(§12 비과세) — 여 + 500만
    const ritualRow = page
      .locator("div.rounded-lg.border")
      .filter({ hasText: "족보·제구" });
    await ritualRow.getByRole("button", { name: "여", exact: true }).click();
    await ritualRow.getByPlaceholder("금액 입력").fill("5000000");

    // Step3(사전증여) → Step4(공제) → 계산 → 결과
    await nextSteps(page, 2);
    await calcAndWaitResult(page);

    // 결과: "과세제외 내역" 헤더 + 비과세/과세가액 불산입 2그룹
    await expect(page.getByText("과세제외 내역")).toBeVisible();
    await expect(
      page.getByTestId("exemption-result-group-non_taxable"),
    ).toBeVisible();
    await expect(
      page.getByTestId("exemption-result-group-not_included"),
    ).toBeVisible();

    // 과세 요약 카드: 과세가액 불산입 차감 행 분리
    await expect(page.getByText("과세가액 불산입 차감")).toBeVisible();
  });
});
