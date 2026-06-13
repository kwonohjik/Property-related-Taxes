/**
 * E2E: 비과세(§12)/과세가액 불산입(§16·§17) 결과 화면 구분 표시 (작업1) — 2026-06-13
 *
 * 정책: [[feedback_browser_verify_with_playwright]]
 *
 * 검증:
 *  - 공익법인 출연(§16 불산입) + 족보·제구(§12 비과세) 혼재 입력 → 결과 화면
 *  - ExemptionSummaryCard 헤더 "과세제외 내역" + 비과세/과세가액 불산입 2그룹 분리
 *  - 과세 요약 카드에 "과세가액 불산입 차감" 행 분리 노출
 *
 * 체크리스트 UI 업데이트 (2026-06-13):
 *  - 항목 "여" 클릭 대신 체크리스트 칩 클릭으로 선택
 */

import { test, expect, type Page } from "@playwright/test";
import { nextSteps, calcAndWaitResult, addHeir, addLandAsset } from "./_helpers/tax-flow";

/** Step0(상속인) → Step1(토지 10억) → Step2(비과세, 마스터 여) */
async function gotoExemptionStep(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill("2026");
  await page.getByLabel("월").first().fill("5");
  await page.getByLabel("일").first().fill("15");
  await addHeir(page, "heir", "child");
  await page.getByRole("button", { name: /^다음/ }).click(); // → Step1

  // Step1: 토지 1건 (보충적 평가 1,000㎡ × 100만 = 10억)
  await addLandAsset(page, { area: "1000", unitPrice: "1000000" });

  // Step2 진입
  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByText(/비과세.*불산입 선택/)).toBeVisible();
  // 마스터 토글 "여"
  await expect(page.getByText(/비과세.*불산입 선택/)).toBeVisible();
}

test.describe("비과세/과세가액 불산입 결과 구분 표시 (작업1)", () => {
  test("ETR-1: 공익법인(불산입)+족보(비과세) → 결과 '과세제외 내역' 2그룹 + 요약 2행", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoExemptionStep(page);

    // 공익법인 출연 재산(§16 과세가액 불산입) — 칩 클릭 → 금액 입력
    await page.getByRole("button", { name: /공익법인 출연/ }).first().click();
    // 과세가액 불산입 그룹이 펼쳐짐
    await expect(page.getByText("공익법인 출연 재산")).toBeVisible();
    await page.getByPlaceholder("금액 입력").first().fill("100000000");

    // 족보·제구(§12 비과세) — 칩 클릭 → 금액 입력
    await page.getByRole("button", { name: /족보·제구/ }).first().click();
    // 비과세 그룹이 펼쳐짐 — rule.name 포함 텍스트로 확인
    await expect(page.getByText("족보·제구 (族譜·祭具)")).toBeVisible();
    // 족보·제구 입력 섹션에서 금액 입력
    await page.getByPlaceholder("금액 입력").last().fill("5000000");

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
