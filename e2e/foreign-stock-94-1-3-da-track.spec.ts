/**
 * E2E: 국외주식 §94①3호다목 트랙 — 폼 → body → 세액 → 결과 카드
 *
 * 계획서: docs/02-design/features/foreign-stock-94-1-3-da-statute-track.plan.md Phase 7
 * 엔진: lib/tax-engine/stock-transfer/foreign-stock.ts
 *
 * ⚠️ **해외주식 전용 E2E가 지금까지 0건이었다.** anchor는 엔진 함수에서 출발하므로
 *    「입력 UI가 실제로 있고, 거기 넣은 값이 request body를 거쳐 세액·화면까지 간다」를
 *    증명하지 못한다([[feedback_api_trigger_without_input_path_is_noop]]).
 *
 * ── 시나리오 (환율을 1,000으로 잡아 원화 환산을 암산 가능하게) ──────────────
 *   1,000주 · 1주당 양도 200 USD · 1주당 취득 100 USD · 환율 양도·취득 모두 1,000
 *     양도가액 = 1,000 × 200 × 1,000 = 200,000,000
 *     취득가액 = 1,000 × 100 × 1,000 = 100,000,000
 *     양도차익 = 100,000,000
 *     기본공제 §103①2호 = 2,500,000 → 과세표준 97,500,000
 *     산출세액 = floor(97,500,000 × 20%) = **19,500,000**   ← §104①12호나목
 *       (종전 §55① 누진이었다면 18,685,000 — 두 값이 달라 세율 축을 구별한다)
 *     지방소득세 = floor10(1,950,000) = 1,950,000
 *
 * 실행: E2E_PORT=3210 npx playwright test e2e/foreign-stock-94-1-3-da-track.spec.ts
 * 정책: [[feedback_browser_verify_with_playwright]] · [[feedback_worktree_e2e_port_isolation]]
 */

import { test, expect, type Page } from "@playwright/test";

async function gotoStockTransferTax(page: Page) {
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => sessionStorage.clear());
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  await page.getByPlaceholder("종목명을 입력하세요").waitFor({ state: "visible", timeout: 30_000 });
}

/** FieldCard 라벨로 텍스트 입력 — 주식 spec 공통 셀렉터 */
async function fillByLabel(page: Page, label: string, value: string) {
  await page
    .locator(`div:has(> label:has-text('${label}')) input[type="text"]`)
    .first()
    .fill(value);
}

/** 해외주식 Step 1 공통 입력 — 양도일만 케이스별로 바뀐다 */
async function fillForeignStep1(page: Page, transferDate: [string, string, string]) {
  await page.getByPlaceholder("종목명을 입력하세요").fill("Anchor Corp");
  await page.getByRole("radio", { name: "해외주식" }).first().click();

  // ── 섹션 1: 납세의무 요건 (§118② → §118의2 준용) ──
  await fillByLabel(page, "국내 거주 연수", "10");

  // ── 섹션 2: 기본 양도 정보 — [0] 취득일 · [1] 양도일 ──
  const y = page.locator('input[type="text"][aria-label="연도"]');
  const m = page.locator('input[type="text"][aria-label="월"]');
  const d = page.locator('input[type="text"][aria-label="일"]');
  await y.nth(0).fill("2021");
  await m.nth(0).fill("03");
  await d.nth(0).fill("15");
  await y.nth(1).fill(transferDate[0]);
  await m.nth(1).fill(transferDate[1]);
  await d.nth(1).fill(transferDate[2]);

  await fillByLabel(page, "양도 주식수", "1000");

  // ── 섹션 3: 양도가액 ──
  await fillByLabel(page, "양도일 기준환율", "1000");
  await fillByLabel(page, "1주당 양도가액 (외화)", "200");

  // ── 섹션 4: 취득가액 ──
  await fillByLabel(page, "취득일 기준환율", "1000");
  await fillByLabel(page, "1주당 취득가액 (외화)", "100");
}

test.describe("국외주식 §94①3호다목 — 세율 20% · 2020 이전 차단", () => {
  test("F-1: 20% 단일세율이 UI→body→세액→결과 카드까지 도달한다", async ({ page }) => {
    test.setTimeout(120_000);
    await gotoStockTransferTax(page);
    await fillForeignStep1(page, ["2025", "09", "30"]);

    // ── Step 2 → Step 3 (해외주식은 입력이 Step 1에 모여 있다) ──
    await page.getByRole("button", { name: /^다음/ }).click();
    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByText("필요경비·신고").first()).toBeVisible({ timeout: 10_000 });
    await page.locator('input[type="text"][aria-label="연도"]').nth(0).fill("2025");
    await page.locator('input[type="text"][aria-label="월"]').nth(0).fill("11");
    await page.locator('input[type="text"][aria-label="일"]').nth(0).fill("30");

    // ── 계산 ──
    const calcResponse = page.waitForResponse(
      (r) => r.url().includes("/api/calc/stock-transfer") && r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: "결과 보기" }).click();
    const resp = await calcResponse;
    expect(resp.ok()).toBeTruthy();

    // ⑬ request body — 해외주식 트랙으로 갔는가
    const reqBody = JSON.parse(resp.request().postData() ?? "{}");
    expect(reqBody.marketType).toBe("foreign_stock");
    expect(reqBody.yearsResidentInKorea).toBe(10);
    expect(reqBody.transferExchangeRate).toBe(1000);

    // 세액 — §104①12호나목 20%
    const json = await resp.json();
    expect(json.result.transferPriceKrw).toBe(200_000_000);
    expect(json.result.acquisitionPriceKrw).toBe(100_000_000);
    expect(json.result.basicDeduction).toBe(2_500_000);
    expect(json.result.taxBase).toBe(97_500_000);
    expect(json.result.appliedRate).toBe(0.2);
    expect(json.result.progressiveDeduction).toBe(0);
    expect(json.result.incomeTax).toBe(19_500_000);
    // 🔑 구별력: §55① 누진(35% − 15,440,000)이었다면 18,685,000이었다
    expect(json.result.incomeTax).not.toBe(18_685_000);
    expect(json.result.localIncomeTax).toBe(1_950_000);

    // ⑦ 결과 화면이 근거 조문을 §104①12호나목으로 표시한다
    await expect(page.getByText("세율 적용 (§104①12호나목)")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("기본공제 (§103①2호)")).toBeVisible();
    // 부정 단언 — 위 두 줄이 양성 대조군이다
    await expect(page.getByText("§118의5")).toHaveCount(0);
    await expect(page.getByText("기본공제 (§118의7)")).toHaveCount(0);
  });

  test("F-2: 2019-12-31 양도는 차단되어 계산으로 넘어가지 못한다", async ({ page }) => {
    test.setTimeout(120_000);
    await gotoStockTransferTax(page);
    await fillForeignStep1(page, ["2019", "12", "31"]);

    /**
     * ⑧ validate가 Step 1에서 막는다 — 「다음」을 눌러도 Step 2로 가지 못하고
     * 차단 사유가 화면에 뜬다. (⑫ Zod 차단은 anchor R-5b가 별도로 잠근다.)
     */
    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByText(/2020-01-01 이전 양도는 지원하지 않습니다/)).toBeVisible({
      timeout: 10_000,
    });
    /**
     * 여전히 Step 1에 있다.
     * ⚠️ 스텝 제목("양도·취득가액")은 **스텝퍼 라벨로도** 렌더돼 항상 보인다 —
     *    구별력이 없으므로 **Step 1에만 있는 필드**로 판정한다.
     */
    await expect(page.getByText("국내 거주 연수").first()).toBeVisible();
  });

  test("F-3: [양성 대조군] 2020-01-01 양도는 통과한다 — F-2가 다른 이유로 막힌 게 아니다", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await gotoStockTransferTax(page);
    await fillForeignStep1(page, ["2020", "01", "01"]);

    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByText(/2020-01-01 이전 양도는 지원하지 않습니다/)).toHaveCount(0);
    // Step 2로 넘어갔다 — Step 1 전용 필드가 사라진다(스텝퍼 라벨은 구별력이 없다)
    await expect(page.getByText("국내 거주 연수").first()).toBeHidden({ timeout: 10_000 });
  });
});
