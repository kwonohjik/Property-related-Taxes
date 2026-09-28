/**
 * §43² 1년 합산 — 사용이익 2축(§37·§42 무상) 브라우저 왕복.
 * 설계 `docs/00-pm/gift43-2-use-axes.plan.md` · 엔진·배관 anchor는 vitest(`sec43-2-use-axes*`).
 * 당해 이익이 기준금액 바로 아래 — 선행 이익이 없으면 0, 1년 이내 선행 이익을 넣으면 **당해분만** 과세(정책 (a)).
 */
import { test, expect, type Page } from "@playwright/test";

async function openDetail(page: Page, type: string) {
  await page.goto("/calc/gift-deemed");
  await page.getByTestId(`deemed-type-${type}`).click();
  const gd = page.getByTestId("deemed-detail-dialog").getByTestId("deemed-gift-date");
  await gd.getByLabel("연도").fill("2026");
  await gd.getByLabel("월").fill("3");
  await gd.getByLabel("일", { exact: true }).fill("2");
}
const closeDetail = (page: Page) => page.getByTestId("deemed-detail-confirm").click();

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

test.describe("§43² 1년 합산 — 사용이익 2축", () => {
  test("[SU-E2E-1] §37① 무상사용 90,978,879 + 선행 1천만 → 당해 90,978,879 과세 (1억 기준)", async ({ page }) => {
    await openDetail(page, "free_realestate");
    await page.getByLabel("부동산 가액", { exact: true }).fill("1200000000");
    await closeDetail(page);
    await expectAggregation(page, "free", "10000000", "90,978,879");
  });

  test("[SU-E2E-2] §37② 무상담보 9,200,000 + 선행 80만 → 당해 9,200,000 과세 (1천만원 기준)", async ({ page }) => {
    await openDetail(page, "free_realestate");
    await page.getByTestId("free-subtype-collateral").click();
    await page.getByLabel("차입금", { exact: true }).fill("200000000");
    await page.getByLabel("실제 지급이자", { exact: true }).fill("0");
    await closeDetail(page);
    await expectAggregation(page, "free", "800000", "9,200,000");
  });

  test("[SU-E2E-3] §42 무상 8백만 + 선행 3백만 → 당해 8,000,000 과세 · 저가로 바꾸면 표가 사라진다", async ({ page }) => {
    await openDetail(page, "property_service_use");
    await page.getByLabel("재산사용·용역 시가 상당액", { exact: true }).fill("8000000");
    await closeDetail(page);
    await expectAggregation(page, "psu", "3000000", "8,000,000");

    await page.getByTestId("deemed-edit-btn").click();
    await page.getByTestId("psu-subtype-low_price").click();
    await expect(page.getByTestId("psu-prior-tx-table")).toHaveCount(0);
  });
});
