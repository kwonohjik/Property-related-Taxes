/**
 * E2E: 전환사채 등의 평가 (상증법 §63①2호·상증령 §58의2)
 *
 * 계획: docs/02-design/features/inheritance-gift-cb-valuation.plan.md
 * 설계: docs/02-design/features/inheritance-gift-cb-valuation.{engine,ui}.design.md
 *
 * 검증 (비거래소 전환사채, 교재 사례 A):
 *   CB-1 전환금지(Ⅰ 2009.11.1) → 512,493,150
 *   CB-2 전환가능(Ⅱ 2010.4.1) → 1,993,835,617
 *
 * 정책: [[feedback_browser_verify_with_playwright]] · ToggleCard=role=switch [[feedback_e2e_gift_modal_chip_switch_selectors]]
 */

import { test, expect, type Locator } from "@playwright/test";
import { addHeir, fillDateAndVerify, calcAndWaitResult, nextSteps } from "./_helpers/tax-flow";

async function fillDateField(
  scope: Locator,
  date: { year: string; month: string; day: string },
): Promise<void> {
  await scope.getByLabel("연도").first().fill(date.year);
  await scope.getByLabel("월").first().fill(date.month);
  await scope.getByLabel("일").first().fill(date.day);
}

test.describe("전환사채 등의 평가 §58의2", () => {
  test("CB-1 비거래소 전환사채 전환금지 → 512,493,150", async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto("/calc/inheritance-tax");
    await fillDateAndVerify(page, { year: "2009", month: "11", day: "1" });
    await addHeir(page, "heir", "child");
    await page.getByRole("button", { name: /^다음/ }).click();

    await page.getByRole("button", { name: /상속재산 추가/ }).click();
    await page.getByRole("button", { name: /전환사채등/ }).first().click();
    const dialog = page.getByTestId("estate-edit-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/전환사채등 평가/).first()).toBeVisible();

    // 증권 종류: 전환사채 (기본값이나 명시)
    await dialog.getByText("전환사채", { exact: true }).first().click();

    // 거래소 거래 OFF(기본) → 비거래소 B 입력 노출
    await dialog.getByTestId(/cb-principal/).first().fill("500000000");
    await dialog.getByTestId(/cb-coupon-rate/).first().fill("3");
    await dialog.getByTestId(/cb-maturity/).first().fill("3");
    await fillDateField(dialog.getByTestId(/cb-interest-base-date/), {
      year: "2009",
      month: "1",
      day: "1",
    });

    await page.getByRole("dialog").getByRole("button", { name: "닫기" }).click();
    await expect(dialog).toBeHidden();

    await nextSteps(page, 3);
    await calcAndWaitResult(page);
    await expect(page.getByText("512,493,150").first()).toBeVisible({ timeout: 30_000 });
  });

  test("CB-2 비거래소 전환사채 전환가능 → 1,993,835,617", async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto("/calc/inheritance-tax");
    await fillDateAndVerify(page, { year: "2010", month: "4", day: "1" });
    await addHeir(page, "heir", "child");
    await page.getByRole("button", { name: /^다음/ }).click();

    await page.getByRole("button", { name: /상속재산 추가/ }).click();
    await page.getByRole("button", { name: /전환사채등/ }).first().click();
    const dialog = page.getByTestId("estate-edit-dialog");
    await expect(dialog).toBeVisible();

    await dialog.getByText("전환사채", { exact: true }).first().click();

    await dialog.getByTestId(/cb-principal/).first().fill("500000000");
    await dialog.getByTestId(/cb-coupon-rate/).first().fill("3");
    await dialog.getByTestId(/cb-maturity/).first().fill("3");
    await fillDateField(dialog.getByTestId(/cb-interest-base-date/), {
      year: "2009",
      month: "12",
      day: "31",
    });

    // 주식전환 가능 토글 ON (switch: 0=거래소, 1=상환할증, 2=주식전환)
    await dialog.getByRole("switch").nth(2).click();

    await dialog.getByTestId(/cb-conv-share-value/).first().fill("2000000000");
    await dialog.getByTestId(/cb-face-value/).first().fill("5000");
    await dialog.getByTestId(/cb-prior-dividend-rate/).first().fill("5");
    await dialog.getByTestId(/cb-share-count/).first().fill("100000");
    await fillDateField(dialog.getByTestId(/cb-dividend-base-date/), {
      year: "2010",
      month: "4",
      day: "1",
    });

    await page.getByRole("dialog").getByRole("button", { name: "닫기" }).click();
    await expect(dialog).toBeHidden();

    await nextSteps(page, 3);
    await calcAndWaitResult(page);
    await expect(page.getByText("1,993,835,617").first()).toBeVisible({ timeout: 30_000 });
  });
});
