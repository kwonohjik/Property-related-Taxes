import { test, expect, type Page } from "@playwright/test";

/**
 * E2E: 「상증령」§29의3① 단서 + 현물출자 ⑧ 공란 검사 — 화면에서 엔진까지 왕복.
 * 엔진·⑧ 규칙은 `__tests__/tax-engine/gift-deemed/contribution-29-3-proviso.anchor.test.ts`.
 */

async function openContribution(page: Page) {
  await page.goto("/calc/gift-deemed");
  await page.getByTestId("deemed-type-contribution").click();
  const dialog = page.getByTestId("deemed-detail-dialog");
  await dialog.getByLabel("연도").fill("2025");
  await dialog.getByLabel("월").fill("7");
  await dialog.getByLabel("일", { exact: true }).fill("1");
  return dialog;
}

test.describe("현물출자 §39의3 — 「상증령」§29의3① 단서 · 공란 검사", () => {
  test("결손법인 고가 현물출자 — 전 0 · 인수가 20,000 · 비율 100% → 후 6,666 · 13,334 × 50,000 = 666,700,000", async ({ page }) => {
    const dialog = await openContribution(page);
    await dialog.getByTestId("con-case-high").click();
    await dialog.getByLabel("현물출자 전 1주당 평가가액", { exact: true }).fill("0");
    await dialog.getByPlaceholder("현물출자 전 발행주식총수").fill("100000");
    await dialog.getByLabel("신주 1주당 인수가액", { exact: true }).fill("20000");
    await dialog.getByPlaceholder("현물출자 주식수").fill("50000");
    await dialog.getByPlaceholder("인수 신주수").fill("50000");
    // 지분비율 칸은 FieldCard 라벨이 input과 연결돼 있지 않다 — 다이얼로그 안 유일한 소수 입력으로 잡는다
    //   (`gift-deemed-43-2-capital-axes.spec.ts`와 같은 방식)
    await dialog.locator('input[inputmode="decimal"]').fill("100");
    await page.getByTestId("deemed-detail-confirm").click();
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-result-value")).toContainText("666,700,000");
  });

  test("단서 영역 — 전 0 · 인수가 0이면 후도 0 ⇒ 이익 없음, 사유는 §29의3① 단서", async ({ page }) => {
    const dialog = await openContribution(page);
    await dialog.getByLabel("현물출자 전 1주당 평가가액", { exact: true }).fill("0");
    await dialog.getByPlaceholder("현물출자 전 발행주식총수").fill("100000");
    await dialog.getByLabel("신주 1주당 인수가액", { exact: true }).fill("0");
    await dialog.getByPlaceholder("현물출자 주식수").fill("50000");
    await dialog.getByPlaceholder("배정받은 신주수").fill("50000");
    await page.getByTestId("deemed-detail-confirm").click();
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-exclusion")).toContainText("§29의3① 단서");
  });

  test("인수가 공란이면 계산하지 않는다 — 종전에는 0으로 들어가 저가 333,300,000(정상 166,650,000) 과다", async ({ page }) => {
    const dialog = await openContribution(page);
    await dialog.getByLabel("현물출자 전 1주당 평가가액", { exact: true }).fill("10000");
    await dialog.getByPlaceholder("현물출자 전 발행주식총수").fill("100000");
    await dialog.getByPlaceholder("현물출자 주식수").fill("50000");
    await dialog.getByPlaceholder("배정받은 신주수").fill("50000");
    await page.getByTestId("deemed-detail-confirm").click();
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByText("신주 1주당 인수가액을 입력하세요").first()).toBeVisible();
    await expect(page.getByTestId("deemed-result-value")).toHaveCount(0);
  });
});
