/**
 * E2E: 신탁수익권(상증령 §61)·정기금받을권리(상증령 §62) 평가
 *
 * 계획: docs/00-pm/inheritance-gift-trust-benefit-valuation-61.plan.md
 * 설계: docs/02-design/features/inheritance-gift-trust-benefit-valuation-61.{engine,ui}.design.md
 *
 * 검증:
 *   TBV-1 동일수익자(§61①1호) — 신탁재산 8억 → 800,000,000 (수익권 PV 미가산)
 *   PP-3  무기정기금(§62 2호) — 1년분 1천만 → 200,000,000 (1년분×20)
 *   PP-1  유기정기금(§62 1호) — 1년분 1천만·만기 5년 → 45,797,069 (floor-per-term)
 *
 * 정책: [[feedback_browser_verify_with_playwright]] · ToggleCard/Radio=role=switch/클릭
 *   · DateInput=getByLabel(연/월/일) dialog scope [[feedback_e2e_gift_modal_chip_switch_selectors]]
 *   · 워크트리 E2E_PORT=3102
 */

import { test, expect, type Locator } from "@playwright/test";
import { addHeir, fillDateAndVerify, calcAndWaitResult, nextSteps } from "./_helpers/tax-flow";

/** scope(dialog 또는 testid 래퍼) 내 DateInput 연/월/일 입력 */
async function fillScopeDate(
  scope: Locator,
  date: { year: string; month: string; day: string },
): Promise<void> {
  await scope.getByLabel("연도").first().fill(date.year);
  await scope.getByLabel("월").first().fill(date.month);
  await scope.getByLabel("일").first().fill(date.day);
}

test.describe("신탁수익권 §61 · 정기금받을권리 §62 평가", () => {
  test("TBV-1 동일수익자 신탁 → 800,000,000", async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto("/calc/inheritance-tax");
    await fillDateAndVerify(page, { year: "2024", month: "1", day: "1" });
    await addHeir(page, "heir", "child");
    await page.getByRole("button", { name: /^다음/ }).click();

    await page.getByRole("button", { name: /상속재산 추가/ }).click();
    await page.getByRole("button", { name: /신탁수익권/ }).first().click();
    const dialog = page.getByTestId("estate-edit-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/신탁수익권 평가/).first()).toBeVisible();

    // 수익자 구성 기본 = 동일수익자(1호). 신탁재산 구성 1건 = 8억
    await dialog.getByTestId("trust-asset-add").click();
    await dialog.getByTestId("trust-asset-row-0-value").fill("800000000");

    await page.getByRole("dialog").getByRole("button", { name: "닫기" }).click();
    await expect(dialog).toBeHidden();

    await nextSteps(page, 3);
    await calcAndWaitResult(page);
    await expect(page.getByText("800,000,000").first()).toBeVisible({ timeout: 30_000 });
  });

  test("PP-3 무기정기금 → 200,000,000", async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto("/calc/inheritance-tax");
    await fillDateAndVerify(page, { year: "2024", month: "1", day: "1" });
    await addHeir(page, "heir", "child");
    await page.getByRole("button", { name: /^다음/ }).click();

    await page.getByRole("button", { name: /상속재산 추가/ }).click();
    await page.getByRole("button", { name: /정기금받을권리/ }).first().click();
    const dialog = page.getByTestId("estate-edit-dialog");
    await expect(dialog).toBeVisible();

    // 종류: 무기정기금
    await dialog.getByText("무기정기금").first().click();
    // 1년분 정기금액 1천만
    await dialog.getByTestId(/periodic-annual/).first().fill("10000000");

    await page.getByRole("dialog").getByRole("button", { name: "닫기" }).click();
    await expect(dialog).toBeHidden();

    await nextSteps(page, 3);
    await calcAndWaitResult(page);
    await expect(page.getByText("200,000,000").first()).toBeVisible({ timeout: 30_000 });
  });

  test("PP-1 유기정기금 만기 5년 → 45,797,069", async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto("/calc/inheritance-tax");
    // 평가기준일 2024-01-01, 만기 2029-01-01 → 잔존 5년
    await fillDateAndVerify(page, { year: "2024", month: "1", day: "1" });
    await addHeir(page, "heir", "child");
    await page.getByRole("button", { name: /^다음/ }).click();

    await page.getByRole("button", { name: /상속재산 추가/ }).click();
    await page.getByRole("button", { name: /정기금받을권리/ }).first().click();
    const dialog = page.getByTestId("estate-edit-dialog");
    await expect(dialog).toBeVisible();

    // 종류 기본 = 유기정기금. 1년분 1천만 + 만기일 2029-01-01
    await dialog.getByTestId(/periodic-annual/).first().fill("10000000");
    const maturity = dialog.getByTestId(/periodic-maturity/);
    await fillScopeDate(maturity, { year: "2029", month: "1", day: "1" });

    await page.getByRole("dialog").getByRole("button", { name: "닫기" }).click();
    await expect(dialog).toBeHidden();

    await nextSteps(page, 3);
    await calcAndWaitResult(page);
    await expect(page.getByText("45,797,069").first()).toBeVisible({ timeout: 30_000 });
  });
});
