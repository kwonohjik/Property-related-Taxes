/**
 * E2E: 감정평가수수료 공제 (상속 §25①2호·§20의3 / 증여 §55①·§46의2) — UI 검증 (2026-06-05)
 *
 * 설계: docs/02-design/features/appraisal-fee-deduction.{engine,ui}.design.md
 * 정책: [[feedback_browser_verify_with_playwright]] — spec 통과로 브라우저 확인 충족
 *
 * 검증:
 *   AF-E2E-1  상속 Step4에 감정평가수수료 공제 섹션(violet) + 3종 입력란 노출
 *   AF-E2E-2  유형재산(3호) 700만 입력 → 계산 → 결과 과세표준에 "감정평가수수료 공제" 차감 행
 *   AF-E2E-3  증여 Step3에 감정평가수수료 공제 섹션(§55①·§46의2) 노출
 */

import { test, expect, type Page } from "@playwright/test";
import {
  fillDateAndVerify,
  addLandAsset,
  nextSteps,
  calcAndWaitResult,
} from "./_helpers/tax-flow";

/** 상속 Step0(2024-06-10 + 자녀1) → Step1(토지 30억) → 다음×3 → Step4 */
async function gotoInheritanceStep4(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await fillDateAndVerify(page, { year: "2024", month: "6", day: "10" });

  await page.getByRole("button", { name: /상속인 추가/ }).click();
  await page.getByText("자녀", { exact: true }).click();
  await page.getByRole("button", { name: /^다음/ }).click(); // → Step1

  await addLandAsset(page, { area: "300", unitPrice: "10000000" });
  await nextSteps(page, 3); // → Step2 → Step3 → Step4
}

test.describe("감정평가수수료 공제 — UI", () => {
  test("AF-E2E-1: 상속 Step4 감정평가수수료 섹션 + 3종 입력란 노출", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await gotoInheritanceStep4(page);

    await expect(
      page.getByText("감정평가수수료 공제 (§25①2호·시행령 §20의3)"),
    ).toBeVisible();
    await expect(page.getByText("1호 · 부동산 등 감정평가")).toBeVisible();
    await expect(page.getByText("2호 · 비상장주식 신용평가")).toBeVisible();
    await expect(page.getByText("3호 · 서화·골동품 등 유형재산")).toBeVisible();
    // CurrencyInput label은 <label> 텍스트 (htmlFor 미연결) → getByText로 확인
    await expect(page.getByText("유형재산 감정수수료")).toBeVisible();
  });

  test("AF-E2E-2: 유형재산(3호) 700만 입력 → 결과 과세표준 '감정평가수수료 공제' 차감", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await gotoInheritanceStep4(page);

    // 3호 유형재산 700만 (한도 500만 cap) — eligibility 무관.
    // 감정평가수수료 섹션 스코프 내 5번째 입력란(부동산·비상장·법인수·기관수·유형재산 순)
    const feeSection = page
      .locator("div")
      .filter({ hasText: "감정평가수수료 공제 (§25①2호·시행령 §20의3)" })
      .last();
    await feeSection.getByRole("textbox").nth(4).fill("7000000");
    await calcAndWaitResult(page);
    // 과세표준 CalculationStep 차감 행 (입력 섹션은 결과 화면에서 미표시 → exact 매칭)
    await expect(
      page.getByText("감정평가수수료 공제", { exact: true }),
    ).toBeVisible();
  });

  test("AF-E2E-3: 증여 Step3 감정평가수수료 섹션(§55①·§46의2) 노출", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto("/calc/gift-tax");
    // Step0 증여일 + 증여자(기본 父) → 다음
    await fillDateAndVerify(page, { year: "2024", month: "6", day: "10" });
    await page.getByRole("button", { name: /^다음/ }).click(); // → Step1

    // Step1 증여재산 — 현금 1건
    await page.getByRole("button", { name: /증여재산 추가|재산 추가/ }).first().click();
    await page.getByRole("button", { name: /현금/ }).first().click();
    await nextSteps(page, 2); // → Step2 → Step3

    await expect(
      page.getByText("감정평가수수료 공제 (§55①·시행령 §46의2)"),
    ).toBeVisible();
    await expect(page.getByText("유형재산 감정수수료")).toBeVisible();
  });
});
