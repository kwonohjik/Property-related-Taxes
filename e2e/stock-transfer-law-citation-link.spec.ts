/**
 * E2E: 주식양도세 결과뷰 법조문 링크 배지(LawArticleModal) → 조문 HTML 팝업
 *
 * 검증 대상: Phase 3에서 추가한 결과뷰 분류배지(TAX_CATEGORY_LABEL → CATEGORY_LAW_MAP)·
 *   RuleBadges(RULE_BADGE_LAW_MAP). LawArticleModal은 전 세목 공용 — 팝업 헤더는
 *   parseLawRef(props) 기반(법제처 API 무관 즉시 렌더).
 *
 * 진입: 주식양도세 마법사. 비상장 계산 → 결과뷰 분류배지 §94①3 나목.
 *   계산 플로우 헬퍼는 stock-transfer-securities-tax.spec.ts와 동일(비상장 E-2 경로).
 *
 * SLAW-1: 비상장 분류배지(§94①3 나목) 클릭 → 조문 팝업 헤더 "소득세법 제94조"
 * SLAW-2: 분류배지 팝업 → ESC 닫힘
 *
 * 비고: 조문 본문은 법제처 API(KOREAN_LAW_OC) 의존 → 팝업 헤더(법령명·조문번호, props 기반)만 단정.
 *       본문 텍스트는 비단정(property/transfer-law-citation-link.spec.ts 동일 철학).
 * 정책: [[feedback_browser_verify_with_playwright]] · [[feedback_e2e_worktree_port_isolation]]
 * worktree 실행: E2E_PORT=3104 npx playwright test e2e/stock-transfer-law-citation-link.spec.ts
 *   ⚠️ stale 서버 주의 — lsof -ti :3104 | xargs kill 후 실행.
 */
import { test, expect, type Page } from "@playwright/test";

// ─────────────────────────────────────────────────────────────────
// 공통 헬퍼 (stock-transfer-securities-tax.spec.ts와 동일 플로우)
// ─────────────────────────────────────────────────────────────────

async function gotoStockTransferTax(page: Page) {
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => sessionStorage.clear());
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  await page.getByPlaceholder("종목명을 입력하세요").waitFor({ state: "visible", timeout: 30_000 });
}

async function fillStep1(
  page: Page,
  opts: {
    securityName: string;
    marketLabel: string;
    transferDate: string;
    acquisitionDate: string;
    shareCount: string;
    totalIssuedShares: string;
  },
) {
  const [tyear, tmonth, tday] = opts.transferDate.split("-");
  const [ayear, amonth, aday] = opts.acquisitionDate.split("-");

  await page.getByPlaceholder("종목명을 입력하세요").fill(opts.securityName);
  await page.getByRole("radio", { name: opts.marketLabel }).first().click();

  const yearInputs = page.locator('input[type="text"][aria-label="연도"]');
  const monthInputs = page.locator('input[type="text"][aria-label="월"]');
  const dayInputs = page.locator('input[type="text"][aria-label="일"]');

  await yearInputs.nth(0).fill(ayear);
  await monthInputs.nth(0).fill(amonth);
  await dayInputs.nth(0).fill(aday);
  await yearInputs.nth(1).fill(tyear);
  await monthInputs.nth(1).fill(tmonth);
  await dayInputs.nth(1).fill(tday);

  const shareCountInput = page
    .locator('[data-slot="field-card"]')
    .filter({ hasText: "양도 주식수" })
    .locator("input")
    .first();
  await shareCountInput.fill(opts.shareCount);

  const totalSharesInput = page
    .locator('[data-slot="field-card"]')
    .filter({ hasText: "발행주식 총수" })
    .locator("input")
    .first();
  await totalSharesInput.fill(opts.totalIssuedShares);
}

async function fillStep2AndGoToStep3(
  page: Page,
  opts: { transferTotalPrice: string; perShareAcquisitionPrice: string },
) {
  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByText("양도·취득가액").first()).toBeVisible({ timeout: 10_000 });

  const transferPriceInput = page
    .locator("div:has(> label:has-text('양도가액 합계')) input")
    .first();
  await transferPriceInput.fill(opts.transferTotalPrice);

  const acqPriceInput = page
    .locator("div:has(> label:has-text('1주당 취득가액')) input")
    .first();
  await acqPriceInput.fill(opts.perShareAcquisitionPrice);

  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByText("필요경비·신고").first()).toBeVisible({ timeout: 10_000 });
}

async function fillStep3FilingDateAndGoToResult(
  page: Page,
  opts: { filingDate: string },
): Promise<void> {
  const [fyear, fmonth, fday] = opts.filingDate.split("-");

  const yearInput = page.locator('input[type="text"][aria-label="연도"]').nth(0);
  const monthInput = page.locator('input[type="text"][aria-label="월"]').nth(0);
  const dayInput = page.locator('input[type="text"][aria-label="일"]').nth(0);
  await yearInput.fill(fyear);
  await monthInput.fill(fmonth);
  await dayInput.fill(fday);

  const calcResponse = page.waitForResponse(
    (r) => r.url().includes("/api/calc/stock-transfer") && r.request().method() === "POST",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: "결과 보기" }).click();
  const resp = await calcResponse;
  if (!resp.ok()) {
    throw new Error(`주식양도세 계산 API 비정상 응답 ${resp.status()}`);
  }
}

/** 비상장 계산 → 결과뷰 도달 (분류배지 §94①3 나목 노출) */
async function calcUnlistedToResult(page: Page) {
  await gotoStockTransferTax(page);
  await fillStep1(page, {
    securityName: "예제비상장주식",
    marketLabel: "비상장",
    transferDate: "2026-04-10",
    acquisitionDate: "2018-06-01",
    shareCount: "500",
    totalIssuedShares: "5000000",
  });
  await fillStep2AndGoToStep3(page, {
    transferTotalPrice: "25000000",
    perShareAcquisitionPrice: "20000",
  });
  await fillStep3FilingDateAndGoToResult(page, { filingDate: "2026-08-31" });
  await expect(page.getByText(/산출세액|과세표준|양도소득금액/).first()).toBeVisible({
    timeout: 20_000,
  });
}

// ─────────────────────────────────────────────────────────────────
// SLAW-1: 비상장 분류배지 §94①3 나목 → 소득세법 제94조 팝업
// ─────────────────────────────────────────────────────────────────

test.describe("주식양도세 결과뷰 법조문 링크 → 조문 팝업", () => {
  test("SLAW-1: 비상장 분류배지(§94①3 나목) → 소득세법 제94조 팝업 헤더", async ({ page }) => {
    test.setTimeout(120_000);
    await calcUnlistedToResult(page);

    // 분류배지 — LawArticleModal 버튼(label=categoryLabel "§94①3 나목 — 비상장 …", legalBasis="소득세법 §94①3 나목")
    const badge = page.getByRole("button", { name: /§94①3 나목/ }).first();
    await expect(badge).toBeVisible({ timeout: 10_000 });
    await badge.click();

    // 팝업 헤더 — props 기반(parseLawRef: "소득세법 §94①3 나목" → "소득세법 제94조")
    await expect(page.getByRole("dialog").getByText("소득세법 제94조")).toBeVisible();
  });

  test("SLAW-2: 분류배지 팝업 → ESC 닫힘", async ({ page }) => {
    test.setTimeout(120_000);
    await calcUnlistedToResult(page);

    const badge = page.getByRole("button", { name: /§94①3 나목/ }).first();
    await expect(badge).toBeVisible({ timeout: 10_000 });
    await badge.click();

    const title = page.getByRole("dialog").getByText("소득세법 제94조");
    await expect(title).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(title).toBeHidden();
  });
});
