/**
 * E2E: 증여세 §30의5 창업자금 과세특례 + G-M8 신규 고용 토글
 *
 * 시나리오 [E2E-GST-1]:
 *   1. 증여일 2025-01-01, 증여자 부(father), 현금 60억 입력
 *      (창업자금은 소법 §94① 재산 제외 — 토지는 특례 귀속 불가 차단되므로 현금 사용)
 *   2. Step3 — 조특법 과세특례: 창업자금(startup) 선택
 *   3. G-M7 투자완료 토글 ON
 *   4. G-M8 신규 고용 10명 이상 토글 ON (한도 100억 → 초과 없음)
 *   5. 계산
 *   6. 결과 검증: finalTax 550,000,000 ((60억−5억)×10%, LE-C anchor 동일)
 *      + 신고세액공제 §30의5⑪ 배제 안내
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


// 헬퍼: 현금 자산 추가 (gift-special-stream.spec.ts 패턴 차용)
async function addCashAsset(
  page: Parameters<typeof fillDateAndVerify>[0],
  opts: { name: string; amount: string },
): Promise<void> {
  await page.getByRole("button", { name: /증여재산 추가/ }).click();
  await page.getByRole("button", { name: /현금$/ }).first().click();
  await expect(page.getByTestId("estate-edit-dialog")).toBeVisible();
  const dialog = page.getByRole("dialog");
  const nameInput = dialog.getByPlaceholder(/자산명|이름/);
  if (await nameInput.isVisible().catch(() => false)) {
    await nameInput.fill(opts.name);
  }
  const valueInput = dialog.getByRole("textbox", { name: /시가|증여가액|금액/ }).first();
  if (await valueInput.isVisible().catch(() => false)) {
    await valueInput.fill(opts.amount);
  } else {
    await dialog.getByRole("textbox").first().fill(opts.amount);
  }
  await dialog.getByRole("button", { name: "닫기" }).click();
  await expect(page.getByTestId("estate-edit-dialog")).toBeHidden();
}

test.describe("§30의5 창업자금 과세특례 + G-M8 신규 고용 토글", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/calc/gift-tax");
  });

  test("[E2E-GST-1] G-M8 토글 ON → 계산 → §69 배제 안내 표시", async ({ page }) => {
    test.setTimeout(90_000);

    // Step0: 증여일 입력 (부 선택은 기본값 father)
    await fillDateAndVerify(page, { year: "2025", month: "1", day: "1" });
    await page.getByRole("button", { name: /^다음/ }).click();

    // Step1: 현금 자산 60억 (창업자금 — 소법 §94① 재산 제외 카테고리)
    await addCashAsset(page, { name: "창업자금", amount: "6000000000" });

    // Step1→2→3 이동 (Step2는 비과세·합산 → 기본값 그대로)
    await nextSteps(page, 2);

    // Step4: 조특법 과세특례 칩 펼침 → 창업자금 선택
    await page.getByText("조특법 과세특례 (§30의5·6)").click();
    await page.getByText("창업자금 증여세 과세특례 (§30의5)").click();

    // G-M7 투자완료 토글 ON
    await page.getByText("창업자금 투자 완료 (§30의5④)").click();

    // G-M8 신규 고용 10명 이상 토글 ON
    await page.getByText("창업을 통하여 10명 이상 신규 고용 (§30의5①)").click();

    // 계산 실행
    await calcAndWaitResult(page, { taxType: "gift" });

    // 결과 검증 1: 특례 스트림 세액 표시 — (60억 − 5억) × 10% = 550,000,000
    // (구 "조특법 과세특례 (창업·가업)" CreditRow는 PR #120 deprecated(0)로 자동 숨김 — 2-스트림 카드로 대체)
    await expect(page.getByText("550,000,000").first()).toBeVisible({ timeout: 10_000 });

    // 결과 검증 2: §69 배제 안내 — PR #120 이후 2-스트림 카드 내부 표시
    await expect(
      page.getByText(/신고세액공제\(§69\) 배제/).first(),
    ).toBeVisible({ timeout: 5_000 });
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

    // 조특 칩 펼침 → startup 선택 → G-M8 토글 노출 확인
    await page.getByText("조특법 과세특례 (§30의5·6)").click();
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
