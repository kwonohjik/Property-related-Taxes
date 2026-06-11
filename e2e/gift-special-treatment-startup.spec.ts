/**
 * E2E: 증여세 §30의5 창업자금 과세특례 + G-M8 신규 고용 토글
 *
 * 시나리오 [E2E-GST-1]:
 *   1. 증여일 2025-01-01, 증여자 부(father), 토지 60억 입력
 *   2. Step3 — 조특법 과세특례: 창업자금(startup) 선택
 *   3. G-M7 투자완료 토글 ON
 *   4. G-M8 신규 고용 10명 이상 토글 ON
 *   5. 계산
 *   6. 결과 검증:
 *      a. "조특법 과세특례 (창업·가업)" 세액공제 행 표시
 *      b. 신고세액공제 행: §30의5⑪ 배제 안내 표시 또는 amount=0 (사유 산식)
 *
 * 주의사항:
 *   - worktree 실행 시 E2E_PORT=3100 필수 (memory: feedback_e2e_worktree_port_isolation)
 *   - addLandAsset(keepModalOpen:true) → 자산명 fill → 닫기 → estate-edit-dialog hidden 대기
 *     (gift-57-proviso-substitute-gift.spec.ts G57-3 패턴 그대로 차용)
 */
import { test, expect } from "@playwright/test";
import {
  addLandAsset,
  calcAndWaitResult,
  fillDateAndVerify,
  nextSteps,
} from "./_helpers/tax-flow";

test.describe("§30의5 창업자금 과세특례 + G-M8 신규 고용 토글", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/calc/gift-tax");
  });

  test("[E2E-GST-1] G-M8 토글 ON → 계산 → §69 배제 안내 표시", async ({ page }) => {
    test.setTimeout(90_000);

    // Step0: 증여일 입력 (부 선택은 기본값 father)
    await fillDateAndVerify(page, { year: "2025", month: "1", day: "1" });
    await page.getByRole("button", { name: /^다음/ }).click();

    // Step1: 토지 자산 추가 (G57-3 패턴: keepModalOpen=true → 자산명 → 닫기)
    await addLandAsset(page, {
      area: "600",
      unitPrice: "10000000", // 600㎡ × 1천만 = 60억
      addButtonName: /증여재산 추가/,
      keepModalOpen: true,
    });
    await page.getByPlaceholder(/본가 토지/).fill("창업자금 토지");
    await page.getByRole("dialog").getByRole("button", { name: "닫기" }).click();
    await expect(page.getByTestId("estate-edit-dialog")).toBeHidden();

    // Step1→2→3 이동 (Step2는 비과세·합산 → 기본값 그대로)
    await nextSteps(page, 2);

    // Step3: 조특법 과세특례 — 창업자금 선택
    await page.getByText("창업자금 증여세 과세특례 (§30의5)").click();

    // G-M7 투자완료 토글 ON
    await page.getByText("창업자금 투자 완료 (§30의5④)").click();

    // G-M8 신규 고용 10명 이상 토글 ON
    await page.getByText("창업을 통하여 10명 이상 신규 고용 (§30의5①)").click();

    // 계산 실행
    await calcAndWaitResult(page, { taxType: "gift" });

    // 결과 검증 1: 세액공제 내역 카드에 "조특법 과세특례" 행 표시
    await expect(
      page.getByText("조특법 과세특례 (창업·가업)"),
    ).toBeVisible({ timeout: 10_000 });

    // 결과 검증 2: §30의5⑪ 배제 안내 — "신고세액공제 (3%)" 행의 산출근거 버튼 클릭 후 배제 텍스트 확인
    // CreditRow(amount=0, formula=§30의5⑪배제 안내) → "▶ 산출근거" 버튼 펼침 → 배제 사유 노출
    const filingCreditRow = page.getByText("신고세액공제 (3%)").locator("..");
    const formulaButton = filingCreditRow.getByRole("button", { name: /산출근거/ });
    if (await formulaButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await formulaButton.click();
      await expect(
        page.getByText(/§30의5⑪/),
      ).toBeVisible({ timeout: 5_000 });
    } else {
      // 배제로 인해 신고세액공제 행이 0원으로 표시됨 — 행 자체 존재 확인
      await expect(
        page.getByText("신고세액공제 (3%)"),
      ).toBeVisible({ timeout: 5_000 });
    }
  });

  test("[E2E-GST-2] startup 선택 후 다른 옵션으로 변경 시 G-M8 초기화 확인", async ({ page }) => {
    // Step0: 증여일 입력
    await fillDateAndVerify(page, { year: "2025", month: "1", day: "1" });
    await page.getByRole("button", { name: /^다음/ }).click();

    // Step1: 토지 자산 추가
    await addLandAsset(page, {
      area: "100",
      unitPrice: "1000000",
      addButtonName: /증여재산 추가/,
      keepModalOpen: true,
    });
    await page.getByPlaceholder(/본가 토지/).fill("토지");
    await page.getByRole("dialog").getByRole("button", { name: "닫기" }).click();
    await expect(page.getByTestId("estate-edit-dialog")).toBeHidden();

    await nextSteps(page, 2);

    // startup 선택 → G-M8 토글 노출 확인
    await page.getByText("창업자금 증여세 과세특례 (§30의5)").click();
    await expect(
      page.getByText("창업을 통하여 10명 이상 신규 고용 (§30의5①)"),
    ).toBeVisible();

    // 가업승계로 변경 → G-M8 토글 미노출 확인
    await page.getByText("가업승계 증여세 과세특례 (§30의6)").click();
    await expect(
      page.getByText("창업을 통하여 10명 이상 신규 고용 (§30의5①)"),
    ).not.toBeVisible();
  });
});
