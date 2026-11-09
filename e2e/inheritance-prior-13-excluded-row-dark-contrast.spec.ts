/**
 * 상속세 사전증여 명세표 — 「§13 합산 기간 도과」 참고 행의 다크 모드 대비.
 *
 * 도과 행은 일반(특례 아닌) 사전증여가 상속인 10년·비상속인 5년을 넘을 때만 나온다.
 * `inheritance-special-prior-13.spec.ts`의 창업자금은 기간 무관 가산이라 이 행에 오지 않는다 —
 * 그래서 머리글(`dark:text-gray-400`)·흐림 행(`dimmed`)은 그 spec으로 닿지 않았다.
 *
 * 머리글·흐림 행 글자는 `dark:text-gray-500`이었고 수정 전 컴포넌트로 이 spec을 돌리면 실측 3.03으로 실패한다
 * (수정 후 통과). 게이트(`check-dark-pairs.mjs` ⑦)는 최악 바탕 가정이라, 실제 렌더 대비는 이 spec이 잰다.
 */
import { test, expect, type Page } from "@playwright/test";
import { expectDarkContrast } from "./_helpers/dark-contrast";
import {
  addHeir,
  addLandAsset,
  calcAndWaitResult,
  fillDateAndVerify,
  closePriorGiftModal,
} from "./_helpers/tax-flow";

async function gotoStep3AddPriorGift(page: Page): Promise<void> {
  await page.goto("/calc/inheritance-tax");
  await fillDateAndVerify(page, { year: "2024", month: "1", day: "1" });
  await addHeir(page, "heir", "child");
  await page.getByRole("button", { name: /^다음/ }).click();
  await addLandAsset(page, { area: "100", unitPrice: "7000000" });
  await page.getByRole("button", { name: /^다음/ }).click();
  await page.getByRole("button", { name: /^다음/ }).click();
  await page.getByRole("button", { name: /사전증여 추가/ }).click();
}

test("도과 참고 행 — 다크 모드 글자 대비 4.5 이상", async ({ page }) => {
  test.setTimeout(120_000);
  await gotoStep3AddPriorGift(page);

  // 2012-01-01 증여 → 상속개시 2024-01-01 기준 12년 전 → 10년 cutoff 도과(특례 아님)
  const giftCard = page.getByTestId("prior-gift-edit-dialog");
  await expect(giftCard).toBeVisible({ timeout: 5_000 });
  await fillDateAndVerify(page, { year: "2012", month: "1", day: "1" }, { scope: giftCard });
  const amount = giftCard.locator('input[placeholder="금액 입력"]').first();
  await amount.click();
  await amount.fill("100000000");
  await expect(amount).toHaveValue(/100/);

  await closePriorGiftModal(page);
  await page.getByRole("button", { name: /^다음/ }).click();
  await calcAndWaitResult(page, { taxType: "inheritance", timeout: 40_000 });

  // 명세 카드 펼치기
  const title = page.getByText("사전증여재산 명세 (상증법 §13)").first();
  await expect(title).toBeVisible();
  await title.locator("xpath=ancestor::div[contains(@class,'rounded-lg')]//button").first().click();

  // 도과 참고 섹션 — 머리글·흐림 행 포함
  const notice = page.getByText(/§13 합산 기간 도과 — 참고 표시/);
  await expect(notice).toBeVisible();
  await expectDarkContrast(page, notice.locator("xpath=ancestor::div[contains(@class,'border-t')][1]"));
});
