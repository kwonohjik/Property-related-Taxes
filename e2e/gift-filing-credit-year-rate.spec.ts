import { test, expect } from "@playwright/test";
import { addLandAsset, fillDateAndVerify, nextSteps, calcAndWaitResult } from "./_helpers/tax-flow";

/**
 * E2E: 증여세 §69 신고세액공제율 연도별 결과 표시 (filing-credit-year-rate).
 *
 * 엔진은 상속개시일/증여일 기준 연도별 율(10/7/5/3) 적용. 결과 세액공제 카드의
 * "신고세액공제 (N%)" 라벨이 증여일에 따라 동적으로 바뀌는지 검증.
 *   - 2018 증여 → 5% (법률 제14388호 부칙)
 *   - 2025 증여 → 3% (현행, 무회귀)
 *
 * 정책: [[feedback_browser_verify_with_playwright]] · [[feedback_e2e_worktree_port_isolation]]
 */
test.describe("증여세 §69 신고세액공제율 연도별 표시", () => {
  async function runToResult(page: import("@playwright/test").Page, year: string) {
    await page.goto("/calc/gift-tax");
    // Step0: 증여일 (증여자는 기본값 — 율은 증여일만 의존)
    await fillDateAndVerify(page, { year, month: "5", day: "2" });
    await page.getByRole("button", { name: /^다음/ }).click(); // → Step1

    // Step1: 토지 7억 (1000㎡ × 700,000원/㎡) — 산출세액 > 0 → 신고세액공제 발생
    //   자산명은 모달 안에 있어 keepModalOpen으로 모달 유지 후 입력 → 직접 닫기.
    await addLandAsset(page, {
      area: "1000",
      unitPrice: "700000",
      addButtonName: /증여재산 추가/,
      keepModalOpen: true,
    });
    // 토지는 자산명 필수 (cash·financial·deposit만 면제) — 모달 안 입력
    const editDialog = page.getByRole("dialog");
    await editDialog.getByPlaceholder(/본가 토지/).fill("증여 토지");
    await editDialog.getByRole("button", { name: "닫기" }).click();
    await expect(page.getByTestId("estate-edit-dialog")).toBeHidden();

    await nextSteps(page, 2); // → 공제·세액공제 (마지막)
    await calcAndWaitResult(page, { taxType: "gift" });
  }

  test("FCY-1: 2018 증여 → 신고세액공제 (5%) 표시", async ({ page }) => {
    test.setTimeout(90_000);
    await runToResult(page, "2018");
    await expect(page.getByText(/신고세액공제 \(5%\)/).first()).toBeVisible();
    await expect(page.getByText(/신고세액공제 \(3%\)/)).toHaveCount(0);
  });

  test("FCY-2: 2025 증여 → 신고세액공제 (3%) 표시 (현행 무회귀)", async ({ page }) => {
    test.setTimeout(90_000);
    await runToResult(page, "2025");
    await expect(page.getByText(/신고세액공제 \(3%\)/).first()).toBeVisible();
    await expect(page.getByText(/신고세액공제 \(5%\)/)).toHaveCount(0);
  });
});
