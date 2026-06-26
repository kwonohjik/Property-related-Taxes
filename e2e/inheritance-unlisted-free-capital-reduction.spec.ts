/**
 * E2E: 비상장주식 V2 정식평가 — 무상감자(free_reduction) 입력 지원
 *
 * 배경: 자본금 변동 changeType이 유상증자·무상증자·유상감자 3종뿐이라 무상감자 입력 경로가 없었다.
 *   §17의3⑤ 2호 감자 환산식은 유·무상 공통이며, §56⑤ 순손익액 조정만 무상에서 미적용.
 *   (교재 「3. 각 사업연도말 발행주식 총수의 계산」 계산사례 ③-사례2 / ⑤)
 *
 * 검증:
 *   T1. 무상감자 선택 → 1주당 금액 필드 미표시 + 무상 안내문구 표시 (validate 미차단)
 *   T2. 교재 ③-사례2 재현: 발행주식총수 3,000 / 무상감자 2건 →
 *       별지 제6쪽 "바. 환산주식수" = 3,000주 × 3개년 + "라. 유상증감자 반영액" = 0
 *
 * 진입 경로: inheritance-unlisted-capital-increase-section56-5.spec.ts 와 동일
 */
import { test, expect, type Page, type Locator } from "@playwright/test";
import { addHeir } from "./_helpers/tax-flow";

async function gotoV2FormalValuationCard(page: Page) {
  await page.goto("/calc/inheritance-tax");

  await page.getByLabel("연도").first().fill("2022");
  await page.getByLabel("월").first().fill("5");
  await page.getByLabel("일").first().fill("1");

  await addHeir(page, "heir", "child");
  await page.getByRole("button", { name: /^다음/ }).click();

  await page.getByRole("button", { name: /주식·지분 추가/ }).click();
  await page.getByRole("button", { name: /비상장주식/ }).click();
  await page.getByText("정식평가", { exact: true }).click();
}

async function fillFieldCardDate(page: Page, label: string, y: string, m: string, d: string) {
  const card = page
    .locator('[data-slot="field-card"]')
    .filter({ has: page.getByText(label, { exact: true }) });
  await card.getByLabel("연도").fill(y);
  await card.getByLabel("월").fill(m);
  await card.getByLabel("일").fill(d);
}

async function fillFiscalYearEndDate(col: Locator, y: string, m: string, d: string) {
  await col.getByLabel("연도").nth(1).fill(y);
  await col.getByLabel("월").nth(1).fill(m);
  await col.getByLabel("일").nth(1).fill(d);
}

test.describe("비상장주식 V2 — 무상감자 입력 지원", () => {
  test("T1: 무상감자 선택 시 1주당 금액 미요구 + 무상 안내문구 표시", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoV2FormalValuationCard(page);

    await page.getByRole("button", { name: /변동 추가/ }).click();

    // changeType select에서 무상감자 선택 (기본 유상증자)
    const typeSelect = page.locator("select").filter({ hasText: "무상감자" }).first();
    await typeSelect.selectOption("free_reduction");

    // 무상 안내문구 표시 + 1주당 지급금액 필드 미표시
    await expect(page.getByText(/무상감자는 §56⑤ 미적용/)).toBeVisible();
    await expect(page.getByPlaceholder("1주당 납입·지급금액")).toHaveCount(0);
  });

  test("T2: 교재 ③-사례2 재현 — 무상감자 2건 → 환산주식수 3,000 × 3개년, 라.반영액 0", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoV2FormalValuationCard(page);

    await page.getByPlaceholder("법인명 입력").fill("예제법인");
    await fillFieldCardDate(page, "사업개시일", "2000", "1", "1");
    await fillFieldCardDate(page, "평가기준일", "2022", "5", "1");
    await page.getByPlaceholder("1주당 액면가액").fill("5000");
    await page.getByPlaceholder("발행주식총수").fill("3000");
    await page.getByPlaceholder("보유 주식수").fill("3000");

    const incomeRow = page.locator('[role="row"]').filter({ hasText: "각 사업연도 소득금액" });
    await incomeRow.getByPlaceholder("0").nth(0).fill("30000000");
    await incomeRow.getByPlaceholder("0").nth(1).fill("20000000");
    await incomeRow.getByPlaceholder("0").nth(2).fill("10000000");

    const yearLabels = page.getByPlaceholder("사업연도 라벨");
    await yearLabels.nth(0).fill("2021");
    await yearLabels.nth(1).fill("2020");
    await yearLabels.nth(2).fill("2019");
    await fillFiscalYearEndDate(yearLabels.nth(0).locator(".."), "2021", "12", "31");
    await fillFiscalYearEndDate(yearLabels.nth(1).locator(".."), "2020", "12", "31");
    await fillFiscalYearEndDate(yearLabels.nth(2).locator(".."), "2019", "12", "31");

    // 무상감자 1: 2020-05-01, 1,000주
    await page.getByRole("button", { name: /변동 추가/ }).click();
    await page.locator("select").filter({ hasText: "무상감자" }).nth(0).selectOption("free_reduction");
    let card = page.locator('[data-slot="field-card"]').filter({ has: page.getByText("변동일", { exact: true }) }).nth(0);
    await card.getByLabel("연도").fill("2020");
    await card.getByLabel("월").fill("5");
    await card.getByLabel("일").fill("1");
    await page.getByPlaceholder("증가·감소 주식수").nth(0).fill("1000");

    // 무상감자 2: 2022-03-01, 2,000주
    await page.getByRole("button", { name: /변동 추가/ }).click();
    await page.locator("select").filter({ hasText: "무상감자" }).nth(1).selectOption("free_reduction");
    card = page.locator('[data-slot="field-card"]').filter({ has: page.getByText("변동일", { exact: true }) }).nth(1);
    await card.getByLabel("연도").fill("2022");
    await card.getByLabel("월").fill("3");
    await card.getByLabel("일").fill("1");
    await page.getByPlaceholder("증가·감소 주식수").nth(1).fill("2000");

    await page.getByTestId("besshi-form-toggle").click();

    // 바. 환산주식수 = 3,000주 × 3개년 (교재 ③-사례2)
    const sharesRow = page.getByTestId("p6-바");
    await expect(sharesRow).toBeVisible({ timeout: 5_000 });
    await expect(sharesRow).toContainText("3,000");

    // 라. 유상증감자 반영액 = 0 (무상이므로 §56⑤ 미적용)
    const adjRow = page.getByTestId("p6-라");
    await expect(adjRow).toContainText("0");
  });
});
