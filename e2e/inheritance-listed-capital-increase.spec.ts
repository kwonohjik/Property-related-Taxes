/**
 * E2E: PR-L3 — §63②3호 상장법인 증자 신주(미상장) 평가
 *
 * 시나리오:
 *   T-L3-A: 상장주식 카드에 §63②3호 ToggleCard 표시 (기본 OFF)
 *   T-L3-1: §63②3호 ON → 배당차액 3,000 입력 → preview "(50,000 − 3,000) × 100주" + 평가액 4,700,000
 *   T-L3-2: 단서 ON → 배당차액 입력 비활성 → preview 차감 0 (가목 동일 5,000,000)
 *   T-L3-3: §63②3호 OFF(기본) → 기존 동작 5,000,000 (배당차액 행 없음)
 *
 * ★ 검증: §63②3호 차감(§57③·§18②)이 입력 preview에 반영 + 단서(배당기산일 동일→0) UI 배선.
 *   (perShare·totalValue numeric은 엔진 anchor 10건으로 별도 고정 — e2e는 UI 배선·차감 표시만.)
 *
 * Plan: docs/00-pm/inheritance-stock-capital-increase-new-shares-section-63-2-3.plan.md
 * UI Design: §8. 진입 헬퍼는 inheritance-listed-stock-section22-toggle.spec.ts 패턴 재사용.
 * 정책: [[feedback_browser_verify_with_playwright]]
 */
import { test, expect, type Page } from "@playwright/test";

async function gotoStep0(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill("2026");
  await page.getByLabel("월").first().fill("5");
  await page.getByLabel("일").first().fill("15");
  await page.getByRole("button", { name: /상속인 추가/ }).click();
  await page.getByText("자녀", { exact: true }).click();
  await page.getByRole("button", { name: /^다음/ }).click();
}

async function openListedStockCard(page: Page) {
  await page.getByRole("button", { name: /주식·지분 추가/ }).click();
  await page.getByText("상장주식", { exact: true }).click();
}

async function fillBase(page: Page) {
  // UX 개편 후 testid 기반 selector
  await page.getByTestId("ls-security-info-shares").fill("100");
  await page.getByTestId("ls-avg-price").fill("50000");
}

const TOGGLE_TITLE = /§63②3호 — 상장법인 증자 신주/;

test.describe("PR-L3: §63②3호 상장법인 증자 신주(미상장)", () => {
  test("T-L3-A: 상장주식 카드에 §63②3호 토글 표시 (기본 OFF)", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep0(page);
    await openListedStockCard(page);
    await expect(page.getByText(TOGGLE_TITLE)).toBeVisible();
  });

  test("T-L3-3: 기본 OFF — 5,000,000 (배당차액 행 없음)", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep0(page);
    await openListedStockCard(page);
    await fillBase(page);
    await expect(page.getByText("50,000 × 100주")).toBeVisible();
    await expect(page.getByText("상장주식 평가액")).toBeVisible();
  });

  test("T-L3-1: §63②3호 ON + 배당차액 3,000 → 4,700,000", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep0(page);
    await openListedStockCard(page);
    await fillBase(page);
    await page.getByText(TOGGLE_TITLE).click();
    // 배당차액 입력 (토글 ON 후 노출된 CurrencyInput — 콤마 입력란)
    await page.getByText("배당차액 (원/주)").click();
    await page.locator('input[inputmode="numeric"]').last().fill("3000");
    await expect(page.getByText("(50,000 − 3,000) × 100주")).toBeVisible();
    await expect(page.getByText("§63②3호 평가액")).toBeVisible();
  });

  test("T-L3-2: 단서 ON → 배당차액 비활성 → 가목 동일(차감 0)", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep0(page);
    await openListedStockCard(page);
    await fillBase(page);
    await page.getByText(TOGGLE_TITLE).click();
    // 단서 토글 ON
    await page.getByText(/배당기산일을 기존 상장주식과 동일/).click();
    // 차감 0 → (50,000 − 0) × 100주
    await expect(page.getByText("(50,000 − 0) × 100주")).toBeVisible();
  });
});
