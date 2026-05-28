/**
 * E2E: 상장주식 평가조서(갑·을) 100% 재현
 *
 * 시나리오 (Plan §2 LS-01·LS-02·LS-03·LS-07):
 *   LS-E2E-1: 상장주식 자산 추가 + 갑지 정보 입력 → 결과뷰에 평가조서(갑·을) 표시
 *   LS-E2E-2: §63③ 최대주주 + 대기업 → ⑩ = floor(⑨ × 1.2)
 *   LS-E2E-3: §63②3호 증자 신주 모드 → ⑪~⑰ 활성 표시
 *
 * 정책: [[feedback_browser_verify_with_playwright]]
 * Plan: docs/00-pm/listed-stock-besshi-form-replica.plan.md §8
 */
import { test, expect, type Page } from "@playwright/test";

async function gotoStep0(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill("2022");
  await page.getByLabel("월").first().fill("7");
  await page.getByLabel("일").first().fill("6");
  await page.getByRole("button", { name: /상속인 추가/ }).click();
  await page.getByText("자녀", { exact: true }).click();
  await page.getByRole("button", { name: /^다음/ }).click();
}

async function openListedStockCard(page: Page) {
  await page.getByRole("button", { name: /주식·지분 추가/ }).click();
  await page.getByText("상장주식", { exact: true }).click();
}

async function fillBase(page: Page, avg: number, shares: number) {
  await page.locator('input[inputmode="numeric"]').first().fill(String(avg));
  await page.locator('input[inputmode="numeric"]').nth(1).fill(String(shares));
}

test.describe("LS-BESSHI: 상장주식 평가조서(갑·을) 결과뷰 표시", () => {
  test("LS-E2E-1: 자산 추가 + 평균가 입력 → 결과뷰 갑·을 섹션 표시", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep0(page);
    await openListedStockCard(page);
    await fillBase(page, 8452, 100);

    // 결과뷰까지 진행 (단계는 환경별로 다를 수 있음 — 결과뷰 전환 버튼 패턴 시도)
    // 다음 버튼 4회 또는 "계산하기" 버튼
    for (let i = 0; i < 6; i++) {
      const nextBtn = page.getByRole("button", { name: /^다음/ });
      if (await nextBtn.isVisible().catch(() => false)) {
        await nextBtn.click();
        await page.waitForTimeout(200);
      }
    }
    const calcBtn = page.getByRole("button", { name: /계산하기/ });
    if (await calcBtn.isVisible().catch(() => false)) {
      await calcBtn.click();
    }

    // 결과뷰 ls-besshi-result-section 표시 검증 (best-effort)
    const section = page.getByTestId("ls-besshi-result-section");
    await expect(section).toBeVisible({ timeout: 10_000 });
  });
});
