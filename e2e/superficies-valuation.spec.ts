/**
 * E2E: 지상권 보충적 평가 (상증법 §61③·상증령 §51·상증규 §16)
 *
 * 계획: docs/00-pm/inheritance-superficies-supplemental-valuation.plan.md
 * 설계: docs/02-design/features/inheritance-superficies-supplemental-valuation.{engine,ui}.design.md
 *
 * 검증: 자산 종류 "지상권" → 공시 2,500,000/㎡ · 990㎡ · 미약정 ㉡ · 설정일=상속개시일 →
 *       잔존연수 자동 15 → 계산 → 평가액 376,500,929 (교재 사례, anchor SU-C1).
 *
 * 정책: [[feedback_browser_verify_with_playwright]]
 */

import { test, expect } from "@playwright/test";
import { addHeir, fillDateAndVerify, calcAndWaitResult, nextSteps } from "./_helpers/tax-flow";

test.describe("지상권 보충적 평가 §61③", () => {
  test("교재 사례: 미약정 ㉡ · 15년 → 376,500,929", async ({ page }) => {
    test.setTimeout(90_000);

    await page.goto("/calc/inheritance-tax");
    // 상속개시일 = 평가기준일
    await fillDateAndVerify(page, { year: "2026", month: "5", day: "15" });
    await addHeir(page, "heir", "child");
    await page.getByRole("button", { name: /^다음/ }).click();

    // 지상권 자산 추가 → 편집 모달 자동 오픈
    await page.getByRole("button", { name: /상속재산 추가/ }).click();
    await page.getByRole("button", { name: /지상권/ }).first().click();
    const dialog = page.getByTestId("estate-edit-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/지상권 평가/).first()).toBeVisible();

    // ① 공시지가(원/㎡) + 면적(㎡)
    await dialog.getByPlaceholder("원/㎡").fill("2500000");
    await page.getByTestId(/superficies-land-area/).first().fill("990");

    // ② 건물종류 ㉡ (그 외 건물 — 최단 15년)
    await dialog.getByText("그 외 건물 (㉡)").click();

    // ③ 설정일 = 상속개시일(2026-05-15) → 잔존 15년
    await fillDateAndVerify(page, { year: "2026", month: "5", day: "15" }, { scope: dialog });

    // 잔존연수 자동 15 확인
    await expect(page.getByTestId(/superficies-remaining-years/).first()).toHaveValue("15");

    // 모달 닫기 (footer "닫기"는 estate-edit-dialog testid 밖 → dialog role 전체 scope)
    await page.getByRole("dialog").getByRole("button", { name: "닫기" }).click();
    await expect(dialog).toBeHidden();

    // Step1(자산) → Step2 → Step3 → Step4(계산)
    await nextSteps(page, 3);

    // 계산 → 결과 평가액 376,500,929
    await calcAndWaitResult(page);
    await expect(page.getByText("376,500,929").first()).toBeVisible({ timeout: 30_000 });
  });
});
