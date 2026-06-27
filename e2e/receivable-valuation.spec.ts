/**
 * E2E: 채권가액 평가 (상증령 §58②·상증칙 §18의2②·§18의3)
 *
 * 계획: docs/02-design/features/inheritance-receivable-valuation.plan.md
 * 설계: docs/02-design/features/inheritance-receivable-valuation.{engine,ui}.design.md
 *
 * 검증:
 *   RC-B1 정리채권 현가할인 — 평가기준일 2022.12.20, 8%, 5회차 → 2,837,396,278 (교재 anchor)
 *   RC-A1 기타채권 단순합산 — 원본 1억 + 미수이자 300만 → 103,000,000
 *
 * 정책: [[feedback_browser_verify_with_playwright]] · ToggleCard=role=switch [[feedback_e2e_gift_modal_chip_switch_selectors]]
 */

import { test, expect, type Locator } from "@playwright/test";
import { addHeir, fillDateAndVerify, calcAndWaitResult, nextSteps } from "./_helpers/tax-flow";

/** 스케줄 행 i의 회수일(연/월/일) 입력 — 행 컨테이너 scope */
async function fillRowDate(
  row: Locator,
  date: { year: string; month: string; day: string },
): Promise<void> {
  await row.getByLabel("연도").first().fill(date.year);
  await row.getByLabel("월").first().fill(date.month);
  await row.getByLabel("일").first().fill(date.day);
}

test.describe("채권가액 평가 §58②", () => {
  test("RC-B1 정리채권 현가할인 → 2,837,396,278", async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto("/calc/inheritance-tax");
    // 상속개시일 = 평가기준일 2022-12-20 (적정할인율 8% · n 산정 기준)
    await fillDateAndVerify(page, { year: "2022", month: "12", day: "20" });
    await addHeir(page, "heir", "child");
    await page.getByRole("button", { name: /^다음/ }).click();

    // 채권 자산 추가 → 편집 모달
    await page.getByRole("button", { name: /상속재산 추가/ }).click();
    await page.getByRole("button", { name: /채권 \(대여금/ }).first().click();
    const dialog = page.getByTestId("estate-edit-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/채권 평가/).first()).toBeVisible();

    // 채권 종류: 정리채권
    await dialog.getByText("정리채권").first().click();

    // 평가방식 토글 ON (장기·변경 채권 현가할인)
    await dialog.getByRole("switch").first().click();

    // 연도별 회수 스케줄 5행 추가
    const schedule = [
      { year: "2031", amount: "1500000000" },
      { year: "2032", amount: "1400000000" },
      { year: "2033", amount: "1300000000" },
      { year: "2034", amount: "1200000000" },
      { year: "2035", amount: "1100000000" },
    ];
    for (let i = 0; i < schedule.length; i++) {
      await dialog.getByTestId("receivable-row-add").click();
      const row = dialog.getByTestId(`receivable-row-${i}`);
      await expect(row).toBeVisible();
      await fillRowDate(row, { year: schedule[i].year, month: "12", day: "20" });
      await dialog.getByTestId(`receivable-row-${i}-amount`).fill(schedule[i].amount);
    }

    // 모달 닫기
    await page.getByRole("dialog").getByRole("button", { name: "닫기" }).click();
    await expect(dialog).toBeHidden();

    // Step1(자산) → 계산
    await nextSteps(page, 3);
    await calcAndWaitResult(page);
    await expect(page.getByText("2,837,396,278").first()).toBeVisible({ timeout: 30_000 });
  });

  test("RC-A1 기타채권 단순합산 → 103,000,000", async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto("/calc/inheritance-tax");
    await fillDateAndVerify(page, { year: "2024", month: "1", day: "1" });
    await addHeir(page, "heir", "child");
    await page.getByRole("button", { name: /^다음/ }).click();

    await page.getByRole("button", { name: /상속재산 추가/ }).click();
    await page.getByRole("button", { name: /채권 \(대여금/ }).first().click();
    const dialog = page.getByTestId("estate-edit-dialog");
    await expect(dialog).toBeVisible();

    // 채권 종류: 대여금 · 모드 simple(기본 — 토글 OFF)
    await dialog.getByText("대여금·대부금").first().click();

    // 원본 1억 + 미수이자 300만
    await dialog.getByTestId(/receivable-principal/).first().fill("100000000");
    await dialog.getByTestId(/receivable-accrued/).first().fill("3000000");

    await page.getByRole("dialog").getByRole("button", { name: "닫기" }).click();
    await expect(dialog).toBeHidden();

    await nextSteps(page, 3);
    await calcAndWaitResult(page);
    await expect(page.getByText("103,000,000").first()).toBeVisible({ timeout: 30_000 });
  });
});
