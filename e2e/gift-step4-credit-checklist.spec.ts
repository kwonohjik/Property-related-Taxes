import { test, expect } from "@playwright/test";
import { fillDateAndVerify, nextSteps } from "./_helpers/tax-flow";

/**
 * E2E: 증여세 Step4(공제·세액공제) 칩 컴팩트 — 기본 접힘 + 칩 클릭 펼침.
 * 정책: [[feedback_browser_verify_with_playwright]] · [[feedback_e2e_worktree_port_isolation]]
 */
test.describe("증여세 Step4 공제·세액공제 칩 체크리스트", () => {
  test("GC-1: Step4 진입 → 칩 패널·신고세액공제 노출, 입력 블록 기본 접힘 → 칩 클릭 펼침", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto("/calc/gift-tax");

    // Step0: 증여일 + 증여자
    await fillDateAndVerify(page, { year: "2025", month: "3", day: "15" });
    await page.locator("select").first().selectOption({ index: 1 });
    await page.getByRole("button", { name: /^다음/ }).click(); // → Step1

    // Step1: 현금 자산
    await page.getByRole("button", { name: /증여재산 추가/ }).click();
    await page.getByRole("button", { name: /현금$/ }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox").first().fill("100000000");
    await dialog.getByRole("button", { name: "닫기" }).click();

    await nextSteps(page, 2); // Step1 → Step2(비과세) → Step3? — UI 4단계: 공제·세액공제

    // 칩 패널 + 그룹 헤더 노출
    await expect(page.getByText("공제·세액공제 항목 선택")).toBeVisible();
    await expect(page.getByText(/상증법 §53의2·§55/)).toBeVisible();
    await expect(page.getByText(/§59·§30의5·6·§70/)).toBeVisible();
    // 신고세액공제 상시 노출
    await expect(
      page.getByText("법정신고기한 내 신고 (§69 신고세액공제 3%)"),
    ).toBeVisible();

    // 입력 블록 기본 접힘 — 외국납부 hint 미노출
    await expect(
      page.getByText("해외 소재 증여재산에 대해 납부한 외국 세액"),
    ).toHaveCount(0);

    // 외국납부 칩 클릭 → 입력 펼침
    await page.getByText("외국납부세액 (§59)").click();
    await expect(
      page.getByText("해외 소재 증여재산에 대해 납부한 외국 세액"),
    ).toBeVisible();
  });
});
