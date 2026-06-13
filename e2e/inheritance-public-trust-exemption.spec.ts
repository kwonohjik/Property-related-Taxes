/**
 * E2E: 공익신탁 §17 과세가액 불산입 항목 추가 (2026-06-13)
 *
 * 정책: [[feedback_browser_verify_with_playwright]] · [[feedback_korean_law_citation_verify]]
 *
 * 상증법 §17 — 공익신탁재산에 대한 상속세 과세가액 불산입.
 * Step 2(비과세·장례비·채무) ExemptionChecklist에 "공익신탁 출연 재산" 항목이
 * 자동 렌더되고, 선택 시 금액 입력·요건이 표시되는지 검증.
 *
 * 체크리스트 UI 업데이트 (2026-06-13):
 *  - 항목 "여" 클릭 대신 체크리스트 칩 클릭으로 선택
 *  - 칩 선택 → 과세가액 불산입 그룹 자동 펼침 → 입력 섹션 노출
 */

import { test, expect, type Page } from "@playwright/test";
import { addHeir, addLandAsset } from "./_helpers/tax-flow";

/** Step0(상속인) → Step1(토지 자산) → Step2(비과세) */
async function gotoExemptionStep(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill("2026");
  await page.getByLabel("월").first().fill("5");
  await page.getByLabel("일").first().fill("15");
  await addHeir(page, "heir", "child");
  await page.getByRole("button", { name: /^다음/ }).click(); // → Step1

  // Step1: 토지 1건
  await addLandAsset(page, { area: "100", unitPrice: "1000000" });

  // Step2 진입
  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByText(/비과세.*불산입 선택/)).toBeVisible();

  // 비과세 마스터 토글 "여"
  await expect(page.getByText(/비과세.*불산입 선택/)).toBeVisible();
}

test.describe("공익신탁 §17 과세가액 불산입", () => {
  test("PT-1: Step2 체크리스트에 '공익신탁 출연' 칩 노출 + 클릭 시 항목 노출", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoExemptionStep(page);

    // 공익신탁 출연 칩 노출
    await expect(page.getByRole("button", { name: /공익신탁 출연/ }).first()).toBeVisible();

    // 칩 클릭 → 과세가액 불산입 그룹 펼침 → 항목 텍스트 노출
    await page.getByRole("button", { name: /공익신탁 출연/ }).first().click();
    await expect(page.getByText("공익신탁 출연 재산")).toBeVisible();
    // 법령 근거 §17 라벨 노출
    await expect(page.getByText("상증법 §17")).toBeVisible();
  });

  test("PT-2: 공익신탁 칩 클릭 → 요건·금액 입력 노출", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoExemptionStep(page);

    // 칩 클릭 → 펼침
    await page.getByRole("button", { name: /공익신탁 출연/ }).first().click();

    // 금액 입력란 노출
    await expect(page.getByPlaceholder("금액 입력").first()).toBeVisible();

    // 요건(§17 본문)은 '자세히' 접힘 안에 위치 → 토글 클릭 후 노출
    await page
      .getByTestId("exemption-row-inh_public_trust-details-toggle")
      .click();
    await expect(
      page.getByText("「공익신탁법」에 따른 공익신탁일 것"),
    ).toBeVisible();
  });
});
