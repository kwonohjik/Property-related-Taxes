/**
 * E2E: 증여세 사전증여 입력 필드 정리 (gift-prior-gift-field-cleanup)
 *
 * 계획서: docs/00-pm/gift-prior-gift-field-cleanup.plan.md
 * 정책: [[feedback_browser_verify_with_playwright]] · [[feedback_e2e_preexisting_failures]]
 *
 * 증여세 모드 사전증여 모달 정리 검증:
 *   GPC-1: "수증인과의 관계"·"기납부 증여세" 제거 + 증여자 select 노출,
 *          증여자+가액 입력 → ⑤·⑦ 자동 prefill(store commit) → 끝까지 계산(D1 validate 통과)
 *   GPC-2: 조특법 특례(창업§30의5) 회차 → §47 카드 숨김(D2) + ⑤·⑦ 없이 계산 통과
 *
 * worktree 실행: E2E_PORT=3100
 */
import { test, expect, type Page } from "@playwright/test";
import {
  fillDateAndVerify,
  calcAndWaitResult,
  closePriorGiftModal,
} from "./_helpers/tax-flow";

// 현금 증여재산 1건 추가 (증여세 — 자산명 입력 후 시가)
async function addCashAsset(
  page: Page,
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
  const valueInput = dialog
    .getByRole("textbox", { name: /시가|증여가액|금액/ })
    .first();
  if (await valueInput.isVisible().catch(() => false)) {
    await valueInput.fill(opts.amount);
  } else {
    await dialog.getByRole("textbox").first().fill(opts.amount);
  }
  await dialog.getByRole("button", { name: "닫기" }).click();
  await expect(page.getByTestId("estate-edit-dialog")).toBeHidden();
}

// 사전증여 모달 열기 + 증여자·증여일·가액 입력 (모달 Locator 반환, 닫지 않음)
async function openPriorGiftAndFill(
  page: Page,
  opts: { donor: string; amount: string },
) {
  await page.getByRole("button", { name: /사전증여 추가/ }).click();
  const dialog = page.getByTestId("prior-gift-edit-dialog");
  await expect(dialog).toBeVisible({ timeout: 5_000 });

  await dialog
    .getByTestId("gift-prior-donor-select")
    .selectOption(opts.donor);
  await dialog.getByRole("textbox", { name: "연도" }).fill("2020");
  await dialog.getByRole("textbox", { name: "월" }).fill("8");
  await dialog.getByRole("textbox", { name: "일" }).fill("10");

  const amountInput = dialog.getByPlaceholder("금액 입력").first();
  await amountInput.fill(opts.amount);
  await amountInput.press("Tab");
  return dialog;
}

test.describe("증여세 사전증여 입력 필드 정리", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/calc/gift-tax");
  });

  test("GPC-1: 수증인관계·기납부 증여세 제거 + 증여자 통합 + ⑤·⑦ prefill → 계산 통과(D1)", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    // Step0: 증여일 + 증여자(기본 father)
    await fillDateAndVerify(page, { year: "2025", month: "1", day: "15" });
    await page.getByRole("button", { name: /^다음/ }).click();

    // Step1: 현금 증여재산 5억
    await addCashAsset(page, { name: "증여현금", amount: "500000000" });
    await page.getByRole("button", { name: /^다음/ }).click(); // → Step2

    // Step2: 사전증여 추가 → 모달 검증
    const dialog = await openPriorGiftAndFill(page, {
      donor: "father",
      amount: "150000000",
    });

    // 정리: 제거된 필드 부재
    await expect(dialog.getByText("수증인과의 관계")).toHaveCount(0);
    await expect(dialog.getByText(/기납부 증여세/)).toHaveCount(0);
    // 통합: 증여자 select + 일반 증여이므로 §47 카드 노출
    await expect(
      dialog.getByText(/증여자 \(동일인 그룹 판정\)/),
    ).toBeVisible();
    await expect(dialog.getByText(/동일인 합산 정보/)).toBeVisible();

    await closePriorGiftModal(page);

    // Step2 → Step3 (prefill된 ⑤·⑦로 validate 통과 = D1)
    await page.getByRole("button", { name: /^다음/ }).click();

    // 끝까지 계산 → 결과 렌더 (validate 차단되면 결과 미렌더로 실패)
    await calcAndWaitResult(page, { taxType: "gift" });
  });

  test("GPC-2: 조특법 특례(창업§30의5) 회차 → §47 카드 숨김 + ⑤·⑦ 없이 계산 통과(D2)", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await fillDateAndVerify(page, { year: "2025", month: "1", day: "15" });
    await page.getByRole("button", { name: /^다음/ }).click();

    await addCashAsset(page, { name: "증여현금", amount: "500000000" });
    await page.getByRole("button", { name: /^다음/ }).click(); // → Step2

    const dialog = await openPriorGiftAndFill(page, {
      donor: "father",
      amount: "150000000",
    });

    // 특례 선택 전 §47 카드 노출
    await expect(dialog.getByText(/동일인 합산 정보/)).toBeVisible();

    // 조특법 특례 — 창업자금 §30의5 선택
    await dialog.getByText("창업자금 §30의5").click();

    // D2: 특례 회차는 §47 합산 제외 → §47 카드(⑤·⑦) 숨김
    await expect(dialog.getByText(/동일인 합산 정보/)).toHaveCount(0);

    await closePriorGiftModal(page);
    await page.getByRole("button", { name: /^다음/ }).click();

    // 특례 회차는 ⑤·⑦ 없이도 validate 통과(D2) → 계산 결과 렌더
    await calcAndWaitResult(page, { taxType: "gift" });
  });
});
