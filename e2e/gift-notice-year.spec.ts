/**
 * E2E: 증여세 마법사 — 기준시가 공시연도 자동 선택
 *
 * 검증: 증여일을 입력하면 자산 카드 기준시가 연도 select 기본값이
 *       증여일 기준(주택 고시 cutoff 0429)으로 자동 설정되는가.
 *       (상속세와 동일 컴포넌트 PropertyValuationForm + valuationDate={form.giftDate})
 *
 * 계획: docs/00-pm/standard-price-notice-year-auto.plan.md
 */
import { test, expect, type Page } from "@playwright/test";

/** 증여일 입력 → 증여자 관계·증여자 선택 → 증여재산 단계 진입 → 아파트 카드 추가 */
async function gotoGiftAptCard(page: Page, year: string, month: string, day: string) {
  await page.goto("/calc/gift-tax");

  // Step0: 증여일
  await page.getByLabel("연도").first().fill(year);
  await page.getByLabel("월").first().fill(month);
  await page.getByLabel("일").first().fill(day);

  // 증여자와 수증자의 관계 (button)
  await page.getByRole("button", { name: /직계존속.*성인/ }).click();
  // 증여자(donor §47) native select — 명시 선택 (validateStep: form.donor 필수)
  await page.locator("select").first().selectOption({ index: 1 });

  // 증여재산 단계로
  await page.getByRole("button", { name: /^다음/ }).click();

  // 증여재산 추가 → 아파트·공동주택
  await page.getByRole("button", { name: /증여재산 추가/ }).click();
  await page.getByRole("button", { name: /아파트.*공동주택/ }).click();
}

/** 기준시가 연도 select (공시가격 조회 버튼과 같은 행) */
function noticeYearSelect(page: Page) {
  return page.locator('div:has(> button:has-text("공시가격 조회")) > select').first();
}

test.describe("증여세 기준시가 공시연도 자동 선택", () => {
  test("증여일 2023-03-10 → 공시연도 기본값 2022 (주택 cutoff 0429 이전)", async ({ page }) => {
    await gotoGiftAptCard(page, "2023", "3", "10");
    await expect(noticeYearSelect(page)).toHaveValue("2022");
  });

  test("증여일 2023-06-01 → 공시연도 기본값 2023 (cutoff 이후)", async ({ page }) => {
    await gotoGiftAptCard(page, "2023", "6", "1");
    await expect(noticeYearSelect(page)).toHaveValue("2023");
  });
});
