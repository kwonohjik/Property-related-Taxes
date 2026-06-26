/**
 * E2E: 증여자 사망 합산제외 + 곱셈 안분 marginal (gift-prior-deceased-donor)
 *
 * 설계: docs/02-design/features/gift-prior-deceased-donor-aggregation.{plan,engine.design,ui.design}.md
 * 엔진 anchor: __tests__/tax-engine/gift/prior-deceased-cutoff.test.ts (사례3·4 12/12)
 * 정책: [[feedback_browser_verify_with_playwright]] · [[feedback_e2e_preexisting_failures]]
 *
 * 사례3(부 사망 후 모 재차증여) 폼→API→결과 통합 검증:
 *   DGD-1: 사전증여 모달에 사망 토글 노출 → ON → 사망일 DateInput 노출·입력 →
 *          계산 통과(폼→Zod→엔진 도달, validate 차단 없음) → 결과 렌더 + 사망 안분 표기
 *   DGD-2: 사망 토글 OFF(미설정) → 일반 합산 회귀(계산 통과, 사망 표기 없음)
 *
 * worktree 실행: E2E_PORT=3101
 */
import { test, expect, type Page } from "@playwright/test";
import { fillDateAndVerify, calcAndWaitResult } from "./_helpers/tax-flow";

// 현금 증여재산 1건 추가 (gift-prior-gift-field-cleanup.spec.ts 패턴)
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

// 사전증여 추가 — 증여자·증여일·가액 (+옵션 증여자 사망일)
async function addPriorGift(
  page: Page,
  opts: {
    donor: string;
    year: string;
    month: string;
    day: string;
    amount: string;
    deceased?: { year: string; month: string; day: string };
  },
): Promise<void> {
  await page.getByRole("button", { name: /사전증여 추가/ }).click();
  const dialog = page.getByTestId("prior-gift-edit-dialog");
  await expect(dialog).toBeVisible({ timeout: 5_000 });

  await dialog.getByTestId("gift-prior-donor-select").selectOption(opts.donor);
  // 증여일 — 모달 내 첫 DateInput
  await dialog.getByRole("textbox", { name: "연도" }).first().fill(opts.year);
  await dialog.getByRole("textbox", { name: "월" }).first().fill(opts.month);
  await dialog.getByRole("textbox", { name: "일" }).first().fill(opts.day);
  // 가액 (일반 증여 — donor+가액에서 ⑤·⑦ 자동 prefill)
  const amountInput = dialog.getByPlaceholder("금액 입력").first();
  await amountInput.fill(opts.amount);
  await amountInput.press("Tab");

  if (opts.deceased) {
    // 사망 토글 ON → children DateInput(두 번째 연/월/일) 노출
    const deceasedSwitch = dialog.getByRole("switch", {
      name: /금번 증여 전 사망/,
    });
    await expect(deceasedSwitch).toBeVisible();
    await deceasedSwitch.click();
    await dialog
      .getByRole("textbox", { name: "연도" })
      .nth(1)
      .fill(opts.deceased.year);
    await dialog
      .getByRole("textbox", { name: "월" })
      .nth(1)
      .fill(opts.deceased.month);
    await dialog
      .getByRole("textbox", { name: "일" })
      .nth(1)
      .fill(opts.deceased.day);
  }

  await page.getByRole("dialog").getByRole("button", { name: "닫기" }).click();
  await expect(dialog).toHaveCount(0);
}

test.describe("증여자 사망 합산제외 + 곱셈 안분", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/calc/gift-tax");
  });

  test("DGD-1: 사망 토글 ON → 사망일 입력 → 계산 통과 → 결과 사망 안분 표기", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    // Step0: 금번 증여일 2023-05-02
    await fillDateAndVerify(page, { year: "2023", month: "5", day: "2" });
    await page.getByRole("button", { name: /^다음/ }).click();

    // Step1: 현금 1.8억
    await addCashAsset(page, { name: "증여현금", amount: "180000000" });
    await page.getByRole("button", { name: /^다음/ }).click(); // → Step2

    // Step2: 사전증여 2건 — 1차 부친(2022-05-02 사망) · 2차 모친
    await addPriorGift(page, {
      donor: "father",
      year: "2018",
      month: "5",
      day: "2",
      amount: "620000000",
      deceased: { year: "2022", month: "5", day: "2" },
    });
    await addPriorGift(page, {
      donor: "mother",
      year: "2020",
      month: "5",
      day: "2",
      amount: "400000000",
    });

    await page.getByRole("button", { name: /^다음/ }).click(); // → Step3

    // 계산 통과 = 사망 토글(donorDeceasedDate)이 폼→Zod→엔진 도달 + validate 차단 없음
    await calcAndWaitResult(page, { taxType: "gift" });

    // §28 증여세액공제 산출근거 펼침 → 사망 안분 표기 (TaxCreditBreakdownCard deceasedExclusion 분기)
    await page
      .getByRole("button", { name: /증여세액공제 산출근거 펼치기/ })
      .click();
    await expect(
      page.getByText(/증여자가 금번 증여 전 사망|생전 증여재산.*합산 제외/).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("DGD-2: 사망 토글 OFF(미설정) → 일반 합산 회귀(계산 통과·사망 표기 없음)", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await fillDateAndVerify(page, { year: "2023", month: "5", day: "2" });
    await page.getByRole("button", { name: /^다음/ }).click();

    await addCashAsset(page, { name: "증여현금", amount: "180000000" });
    await page.getByRole("button", { name: /^다음/ }).click();

    // 사망 토글 미설정 — 일반 부·모 합산
    await addPriorGift(page, {
      donor: "father",
      year: "2018",
      month: "5",
      day: "2",
      amount: "620000000",
    });
    await addPriorGift(page, {
      donor: "mother",
      year: "2020",
      month: "5",
      day: "2",
      amount: "400000000",
    });

    await page.getByRole("button", { name: /^다음/ }).click();
    await calcAndWaitResult(page, { taxType: "gift" });

    // 사망 미설정 → 안분 표기 부재 (현행 합산 동작 보존)
    await expect(
      page.getByText(/증여자가 금번 증여 전 사망/),
    ).toHaveCount(0);
  });
});
