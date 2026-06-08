/**
 * E2E: 공익신탁 §17 과세가액 불산입 항목 추가 (2026-06-05)
 *
 * 정책: [[feedback_browser_verify_with_playwright]] · [[feedback_korean_law_citation_verify]]
 *
 * 상증법 §17 — 공익신탁재산에 대한 상속세 과세가액 불산입.
 * Step 2(비과세·장례비·채무) ExemptionChecklist에 "공익신탁 출연 재산" 항목이
 * 자동 렌더되고, 선택 시 금액 입력·요건이 표시되는지 검증.
 */

import { test, expect, type Page } from "@playwright/test";

/** Step0(상속인) → Step1(토지 자산) → Step2(비과세) — 단계 네비 버튼으로 결정적 이동 */
async function gotoExemptionStep(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill("2026");
  await page.getByLabel("월").first().fill("5");
  await page.getByLabel("일").first().fill("15");
  await page.getByRole("button", { name: /상속인 추가/ }).click();
  await page.getByText("자녀", { exact: true }).click();
  await page.getByRole("button", { name: /^다음/ }).click(); // → Step1

  // Step1: 토지 1건 (이후 단계 진입 위해 자산 ≥1 필요)
  await page
    .getByRole("button", { name: /재산 추가|상속재산 추가/ })
    .first()
    .click();
  await page.getByRole("button", { name: /토지/ }).first().click();
  await page.getByRole("switch", { name: /보충적 평가방법/ }).click();
  await page.getByPlaceholder("면적 입력").fill("100");
  await page.getByPlaceholder("공시지가 단가").fill("1000000");

  // 비과세·장례비 단계로 직접 이동 (다음 카운팅 회피)
  await page.getByRole("button", { name: /비과세.*단계로 이동/ }).click();
  await expect(page.getByText("비과세 해당 여부")).toBeVisible();

  // 비과세 마스터 토글 "여" (exact — "사전증여 단계로 이동" substring 매칭 회피)
  await page.getByRole("button", { name: "여", exact: true }).first().click();
}

test.describe("공익신탁 §17 과세가액 불산입", () => {
  test("PT-1: Step2 비과세 체크리스트에 '공익신탁 출연 재산'(§17) 항목 노출", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoExemptionStep(page);

    await expect(page.getByText("공익신탁 출연 재산")).toBeVisible();
    // 법령 근거 §17 라벨 노출
    await expect(page.getByText("상증법 §17")).toBeVisible();
  });

  test("PT-2: 공익신탁 항목 '여' 선택 → 요건·금액 입력 노출", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoExemptionStep(page);

    // "공익신탁 출연 재산" 행 스코프 → 여 클릭
    const trustRow = page
      .locator("div.rounded-lg.border")
      .filter({ hasText: "공익신탁 출연 재산" });
    await expect(trustRow).toBeVisible();
    await trustRow.getByRole("button", { name: "여", exact: true }).click();

    // 요건(§17 본문) + 금액 입력란 노출
    await expect(
      trustRow.getByText("「공익신탁법」에 따른 공익신탁일 것"),
    ).toBeVisible();
    await expect(trustRow.getByPlaceholder("금액 입력")).toBeVisible();
  });
});
