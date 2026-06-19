import { test, expect } from "@playwright/test";
import { fillDateAndVerify } from "./_helpers/tax-flow";

/**
 * E2E: 증여세 비과세 Step에 상속세 §12·§16·§17 항목이 노출되지 않는다 (버그 수정).
 * 정책: [[feedback_browser_verify_with_playwright]] · [[feedback_e2e_worktree_port_isolation]]
 */
test.describe("증여세 비과세 체크리스트 세목 분기", () => {
  test("GE-1: 증여 비과세 Step → gift 항목(§46) 노출, 상속 §12 항목 미노출", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto("/calc/gift-tax");

    // Step0: 증여일 + 증여자 select (donor 필수)
    await fillDateAndVerify(page, { year: "2025", month: "3", day: "15" });
    await page.locator("select").first().selectOption({ index: 1 });
    await page.getByRole("button", { name: /^다음/ }).click(); // → Step1 증여재산

    // Step1: 현금 자산 추가 (cash — 자산명 불필요)
    await page.getByRole("button", { name: /증여재산 추가/ }).click();
    await page.getByRole("button", { name: /현금$/ }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // 평가액(금액) 입력
    await dialog.getByRole("textbox").first().fill("100000000");
    // 모달 확인/닫기
    await page.getByRole("button", { name: /확인|저장|닫기/ }).first().click();

    await page.getByRole("button", { name: /^다음/ }).click(); // → Step2 비과세·합산

    // 증여 §46 비과세 항목 노출
    await expect(page.getByText("생활비·교육비·치료비")).toBeVisible();
    await expect(page.getByText("상증법 §46")).toBeVisible();
    // 상속세 전용 §12·§16·§17 항목·헤더 미노출
    await expect(page.getByText("금양임야")).toHaveCount(0);
    await expect(page.getByText("공익법인 출연")).toHaveCount(0);
    await expect(page.getByText("상증법 §12")).toHaveCount(0);
  });
});
