import { test, expect, type Page } from "@playwright/test";

/**
 * E2E: 금전무상대출 §41의4② 다년 일수안분 + §43² 1년내 동일거래 합산.
 * 교재 이미지31 사례1·2. 정책 [[feedback_browser_verify_with_playwright]]·[[feedback_e2e_worktree_port_isolation]].
 */

async function openLoan(page: Page) {
  await page.goto("/calc/gift-deemed");
  await page.getByTestId("deemed-type-free_loan").click();
  const dialog = page.getByTestId("deemed-detail-dialog");
  // 모달 증여일은 DOM 첫 DateInput (free_loan은 기간 DateInput 2개도 노출되어 "연도" 다중)
  await dialog.getByLabel("연도").first().fill("2022");
  await dialog.getByLabel("월").first().fill("1");
  await dialog.getByLabel("일", { exact: true }).first().fill("2");
}

async function fillDate(page: Page, wrapTestId: string, y: string, m: string, d: string) {
  const w = page.getByTestId(wrapTestId);
  await w.getByLabel("연도").fill(y);
  await w.getByLabel("월").fill(m);
  await w.getByLabel("일", { exact: true }).fill(d);
}

const confirm = (page: Page) => page.getByTestId("deemed-detail-confirm").click();

test.describe("금전무상대출 §41의4② 다년 + §43² 합산", () => {
  test("[PERIOD-1] 사례1 10억·2022.1.2~2023.12.31·연3% → 1년차 16,000,000 + 2년차 15,956,164", async ({ page }) => {
    await openLoan(page);
    await page.getByPlaceholder("대출금액 (원)").fill("1000000000");
    await page.getByPlaceholder("실제 지급이자 (무이자면 빈칸)").fill("30000000");
    await fillDate(page, "loan-start-date", "2022", "1", "2");
    await fillDate(page, "loan-end-date", "2023", "12", "31");
    await confirm(page);
    await page.getByTestId("deemed-calc-btn").click();
    const period = page.getByTestId("deemed-period-breakdown");
    await expect(period).toBeVisible();
    await expect(period).toContainText("16,000,000");
    await expect(period).toContainText("15,956,164");
  });

  test("[AGG-1] 사례2 ㉮3억3%·㉯1억무상·㉰5억2.6% → 합계 19,400,000 · 증여시기 2023-04-25", async ({ page }) => {
    await openLoan(page);
    await page.getByTestId("loan-multi-toggle").getByRole("switch").click();
    // 행 0 (㉮ 2022.5.4 3억 이자900만)
    await fillDate(page, "loan-item-date-0", "2022", "5", "4");
    const row0 = page.getByTestId("loan-item-0");
    await row0.getByPlaceholder("대출금액 (원)").fill("300000000");
    await row0.getByPlaceholder("실제 지급이자 (무이자면 빈칸)").fill("9000000");
    // 행 1 (㉯ 2022.9.20 1억 무상)
    await page.getByTestId("loan-item-add").click();
    await fillDate(page, "loan-item-date-1", "2022", "9", "20");
    await page.getByTestId("loan-item-1").getByPlaceholder("대출금액 (원)").fill("100000000");
    // 행 2 (㉰ 2023.4.25 5억 이자1,300만)
    await page.getByTestId("loan-item-add").click();
    await fillDate(page, "loan-item-date-2", "2023", "4", "25");
    const row2 = page.getByTestId("loan-item-2");
    await row2.getByPlaceholder("대출금액 (원)").fill("500000000");
    await row2.getByPlaceholder("실제 지급이자 (무이자면 빈칸)").fill("13000000");
    await confirm(page);
    await page.getByTestId("deemed-calc-btn").click();
    const agg = page.getByTestId("loan-aggregation-result");
    await expect(agg).toBeVisible();
    await expect(agg).toContainText("19,400,000");
    await expect(agg).toContainText("2023-04-25");
  });

  test("[회귀] 단건 무상 3억 (기간·다건 없음) → 13,800,000", async ({ page }) => {
    await openLoan(page);
    await page.getByPlaceholder("대출금액 (원)").fill("300000000");
    await confirm(page);
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-result-value")).toContainText("13,800,000");
  });
});
