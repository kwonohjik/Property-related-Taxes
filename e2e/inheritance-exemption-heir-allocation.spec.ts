/**
 * E2E: 비과세 재산 상속인별 귀속(협의분할) (작업4) — 2026-06-09
 *
 * 정책: [[feedback_browser_verify_with_playwright]]
 *
 * 검증:
 *  - 공익법인 출연(§16) "여" → 협의분할 ToggleCard 노출(상속세 전용)
 *  - ON → HeirAllocationInput 칩으로 상속인별 분배(합=청구액 → validation 통과)
 *  - 계산 → 결과 도달 + ㉠ "과세제외 재산" 행 노출
 */

import { test, expect, type Page } from "@playwright/test";
import { nextSteps, calcAndWaitResult,
  addHeir,
} from "./_helpers/tax-flow";

/** Step0(배우자+자녀) → Step1(토지 10억) → Step2(비과세, 마스터 여) */
async function gotoExemptionStep(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill("2026");
  await page.getByLabel("월").first().fill("5");
  await page.getByLabel("일").first().fill("15");

  await addHeir(page, "heir", "spouse");
  await page.getByPlaceholder("앞 6자리-뒤 7자리").last().fill("700101-2000000");

  await addHeir(page, "heir", "child");
  await page.getByPlaceholder("앞 6자리-뒤 7자리").last().fill("000101-3000000");

  await page.getByRole("button", { name: /^다음/ }).click(); // → Step1

  // Step1: 토지 (보충적 평가 1,000㎡ × 100만 = 10억)
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

test.describe("비과세 재산 상속인별 귀속 (작업4)", () => {
  test("EHA-1: 공익법인 협의분할 ON → 배우자 귀속 → 계산 통과 + 과세제외 행", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoExemptionStep(page);

    const publicRow = page
      .locator("div.rounded-lg.border")
      .filter({ hasText: "공익법인 출연 재산" });
    await publicRow.getByRole("button", { name: "여", exact: true }).click();
    await publicRow.getByPlaceholder("금액 입력").fill("100000000");

    // 협의분할 ToggleCard 노출 + ON
    const allocToggle = publicRow.getByRole("switch", { name: /협의분할/ });
    await expect(allocToggle).toBeVisible();
    await allocToggle.click();

    // 배우자 칩 클릭 → 잔여(전액 1억) 자동 채움 → 합 = 청구액(validation 통과)
    await publicRow.getByRole("button", { name: /배우자/ }).first().click();

    // Step3 → Step4 → 계산 → 결과
    await nextSteps(page, 2);
    await calcAndWaitResult(page);

    // ㉠ 과세제외 재산 행(비과세+과세가액불산입) 노출 — per-heir 칸 활성화 확인
    await expect(page.getByText(/과세제외 재산/).first()).toBeVisible();
  });
});
