/**
 * §43² 1년 합산 — 자본거래 4축(§38·§39의2·§39의3·§40) 브라우저 왕복.
 * 설계 `docs/00-pm/gift43-2-capital-axes.plan.md` · 엔진·배관 anchor는 vitest(`sec43-2-capital-axes*`).
 *
 * 모든 사례는 당해 이익이 금액기준 **바로 아래**다 — 선행 이익이 없으면 0, 1년 이내 선행 이익을 넣으면
 * **당해분만** 과세되고(합계가 아니다) 산출근거에 「§43② 1년 합산 금액기준」 행이 뜬다(정책 (a)).
 */
import { test, expect, type Page } from "@playwright/test";

const GIFT_DATE: [string, string, string] = ["2026", "3", "2"];

async function openDetail(page: Page, type: string) {
  await page.goto("/calc/gift-deemed");
  await page.getByTestId(`deemed-type-${type}`).click();
  const gd = page.getByTestId("deemed-detail-dialog").getByTestId("deemed-gift-date");
  await gd.getByLabel("연도").fill(GIFT_DATE[0]);
  await gd.getByLabel("월").fill(GIFT_DATE[1]);
  await gd.getByLabel("일", { exact: true }).fill(GIFT_DATE[2]);
}
const closeDetail = (page: Page) => page.getByTestId("deemed-detail-confirm").click();
const decimal = (page: Page) => page.getByTestId("deemed-detail-dialog").locator('input[inputmode="decimal"]');

/** 계산 → 미달 확인 → 편집 → 선행 행 1건(2025-09-01) → 재계산 → 당해분 과세 */
async function expectAggregation(page: Page, prefix: string, prior: string, expected: string) {
  await page.getByTestId("deemed-calc-btn").click();
  await expect(page.getByTestId("deemed-exclusion")).toBeVisible();

  await page.getByTestId("deemed-edit-btn").click();
  await page.getByTestId(`${prefix}-pt-add`).click();
  const d = page.getByTestId(`${prefix}-pt-date-0`);
  await d.getByLabel("연도").fill("2025");
  await d.getByLabel("월").fill("9");
  await d.getByLabel("일", { exact: true }).fill("1");
  await page.getByTestId(`${prefix}-pt-benefit-0`).fill(prior);
  await closeDetail(page);
  await page.getByTestId("deemed-calc-btn").click();
  await expect(page.getByTestId("deemed-result-value")).toContainText(expected);
  await expect(page.getByText("§43② 1년 합산 금액기준").first()).toBeVisible();
}

test.describe("§43² 1년 합산 — 자본거래 4축", () => {
  test("[SA-E2E-1] §38 주식 외 재산 교부 2억 + 선행 1.2억 → 당해 200,000,000 과세", async ({ page }) => {
    await openDetail(page, "merger");
    await page.getByTestId("mrg-case-non_stock").click();
    await page.getByLabel("액면가액", { exact: true }).fill("5000");
    await page.getByLabel("합병당사법인 1주당 평가가액", { exact: true }).fill("3000");
    await page.getByLabel("대주주등 주식수", { exact: true }).fill("100000");
    await closeDetail(page);
    await expectAggregation(page, "mrg", "120000000", "200,000,000");
  });

  test("[SA-E2E-2] §39의2 저가소각 2억 + 선행 1.5억 → 당해 200,000,000 과세", async ({ page }) => {
    await openDetail(page, "capital_decrease");
    await page.getByLabel("감자주식 1주당 평가액", { exact: true }).fill("10000");
    await page.getByLabel("소각 시 지급한 1주당 금액", { exact: true }).fill("8000");
    await page.getByLabel("총감자 주식수", { exact: true }).fill("200000");
    await decimal(page).fill("50");
    await page.getByLabel("대주주등 특수관계인 감자 주식수", { exact: true }).fill("200000");
    await closeDetail(page);
    await expectAggregation(page, "cd", "150000000", "200,000,000");
  });

  test("[SA-E2E-3] §39의3 고가인수 2억 + 선행 1.5억 → 당해 200,000,000 과세", async ({ page }) => {
    await openDetail(page, "contribution");
    await page.getByTestId("con-case-high").click();
    await page.getByLabel("현물출자 전 1주당 평가가액", { exact: true }).fill("10000");
    await page.getByLabel("현물출자 전 발행주식총수", { exact: true }).fill("100000");
    await page.getByLabel("신주 1주당 인수가액", { exact: true }).fill("12000");
    await page.getByLabel("현물출자 주식수", { exact: true }).fill("100000");
    await page.getByLabel("인수 신주수", { exact: true }).fill("200000");
    await decimal(page).fill("100");
    await closeDetail(page);
    await expectAggregation(page, "con", "150000000", "200,000,000");
  });

  test("[SA-E2E-4] §40①1호 인수 5천만 + 선행 6천만 → 당해 50,000,000 과세 (1억 기준)", async ({ page }) => {
    await openDetail(page, "convertible_bond");
    await page.getByLabel("전환사채등 시가", { exact: true }).fill("1000000000");
    await page.getByLabel("인수·취득가액", { exact: true }).fill("950000000");
    await closeDetail(page);
    await expectAggregation(page, "cb", "60000000", "50,000,000");
  });

  test("[SA-E2E-5] §38 매트릭스 — 갑 행에 1년 이내 합병 이익 1억 → 합계 600,000,000 → 840,000,000", async ({ page }) => {
    await openDetail(page, "merger");
    await page.getByText("다수 대주주·동일인 자기증여 입력").click();
    await page.getByTestId("mrg-over-price").fill("12000");
    await page.getByTestId("mrg-under-price").fill("23400");
    await page.getByTestId("mrg-post-total").fill("380000");
    await page.getByTestId("mrg-ex-numer").fill("1");
    await page.getByTestId("mrg-ex-denom").fill("1");
    await page.getByTestId("mrg-over-add").click();
    await page.getByTestId("mrg-over-name-0").fill("갑");
    await page.getByTestId("mrg-over-shares-0").fill("80000");
    await page.getByTestId("mrg-over-add").click();
    await page.getByTestId("mrg-over-name-1").fill("병");
    await page.getByTestId("mrg-over-shares-1").fill("200000");
    await page.getByTestId("mrg-under-add").click();
    await page.getByTestId("mrg-under-name-0").fill("을");
    await page.getByTestId("mrg-under-shares-0").fill("100000");
    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-result-value")).toContainText("600,000,000");

    await page.getByTestId("deemed-edit-btn").click();
    await page.getByTestId("mrg-over-prior-0").fill("100000000");
    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-result-value")).toContainText("840,000,000");
  });
});
