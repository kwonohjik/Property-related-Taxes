/**
 * E2E: 주식 이월과세 §97의2① 본체(필요경비) — 폼 → 계산 → 결과
 *
 * 계획서: docs/02-design/features/stock-carryover-97-2-necessary-expense.plan.md Phase 6
 * 엔진: lib/tax-engine/stock-transfer/stock-carryover.ts
 *
 * ⚠️ **anchor가 증명하지 못하는 것을 여기서 증명한다** — 「입력 UI가 실제로 존재하고,
 *    거기 넣은 값이 request body를 거쳐 세액까지 간다」. anchor는 폼 객체에서 출발하므로
 *    **UI가 없어도 통과한다**(메모리 `feedback_api_trigger_without_input_path_is_noop`).
 *
 * 시나리오 — 비상장 비대주주(20% 단일세율) · 10,000주 · 양도 1주당 100,000 (10억)
 *   증여 2025-06-01 → 양도 2025-12-01 (1년 이내) · 증여자 취득 2015-03-01 · 배우자 생존
 *   증여 당시 평가액 1주당 80,000 (8억) · **증여자 취득가액 1주당 30,000 (3억)**
 *
 *   A(①적용)  : 소득 7억 → 과표 697,500,000 × 20% = **139,500,000**
 *   B(①미적용): 소득 2억 → 과표 197,500,000 × 20% =    39,500,000
 *   ⇒ A ≥ B 이므로 §97의2②3호가 발동하지 않는다 → **A 채택**
 *
 * 실행: E2E_PORT=3210 npx playwright test e2e/stock-transfer-carryover-97-2.spec.ts
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

async function fillByLabel(page: Page, label: string, value: string) {
  await page
    .locator(`div:has(> label:has-text('${label}')) input[type="text"]`)
    .first()
    .fill(value);
}

test.describe("주식 이월과세 §97의2① — 필요경비 본체", () => {
  test("C-1: 증여자 취득가액이 UI→body→세액까지 도달한다 (승계 O)", async ({ page }) => {
    test.setTimeout(120_000);
    await gotoStockTransferTax(page);

    // ── Step 1 — 종목·시장·일자·수량 ──
    await page.getByPlaceholder("종목명을 입력하세요").fill("이월과세테스트");
    await page.getByRole("radio", { name: "비상장" }).first().click();

    /**
     * ⚠️ **취득원인을 먼저 고른다** — 「이월과세(증여)」를 고르면 증여자 취득일 카드가
     *    **수증일과 양도일 사이에** 삽입되어 날짜 입력 인덱스가 밀린다.
     *    실제 DOM 순서: [0] 수증일 · [1] 증여자 취득일 · [2] 양도일
     */
    await page.getByRole("radio", { name: "이월과세(증여)" }).first().click();

    const y = page.locator('input[type="text"][aria-label="연도"]');
    const m = page.locator('input[type="text"][aria-label="월"]');
    const d = page.locator('input[type="text"][aria-label="일"]');
    // [0] 수증일 (= 취득일)
    await y.nth(0).fill("2025");
    await m.nth(0).fill("06");
    await d.nth(0).fill("01");
    // [1] 증여자 취득일 (§104②2)
    await y.nth(1).fill("2015");
    await m.nth(1).fill("03");
    await d.nth(1).fill("01");
    // [2] 양도일
    await y.nth(2).fill("2025");
    await m.nth(2).fill("12");
    await d.nth(2).fill("01");

    // §97의2① 본문 관계 요건 — 필수(⑧ validate)
    await page.getByRole("radio", { name: "배우자" }).first().click();

    // §97의2①1호 가목 — 증여자 취득가액 (1주당)
    await fillByLabel(page, "증여자 취득가액", "30000");

    await page
      .locator('[data-slot="field-card"]')
      .filter({ hasText: "양도 주식수" })
      .locator("input")
      .first()
      .fill("10000");
    await page
      .locator('[data-slot="field-card"]')
      .filter({ hasText: "발행주식 총수" })
      .locator("input")
      .first()
      .fill("10000000");

    // ── Step 2 — 양도·취득가액 ──
    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByText("양도·취득가액").first()).toBeVisible({ timeout: 10_000 });
    await fillByLabel(page, "양도가액 합계", "1000000000");
    // 증여 당시 평가액 (수증자 취득가액) — B 시나리오의 취득가액이 된다
    await fillByLabel(page, "1주당 취득가액", "80000");

    // ── Step 3 — 필요경비·신고 ──
    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByText("필요경비·신고").first()).toBeVisible({ timeout: 10_000 });
    await page.locator('input[type="text"][aria-label="연도"]').nth(0).fill("2026");
    await page.locator('input[type="text"][aria-label="월"]').nth(0).fill("02");
    await page.locator('input[type="text"][aria-label="일"]').nth(0).fill("28");

    // ── 계산 ──
    const calcResponse = page.waitForResponse(
      (r) => r.url().includes("/api/calc/stock-transfer") && r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: "결과 보기" }).click();
    const resp = await calcResponse;
    expect(resp.ok()).toBeTruthy();

    // ⑬ request body — 신규 필드가 실제로 실렸는가
    const reqBody = JSON.parse(resp.request().postData() ?? "{}");
    expect(reqBody.acquisitionCause).toBe("carryover_gift");
    expect(reqBody.donorAcquisitionPrice).toBe(30_000);
    expect(reqBody.donorRelation).toBe("spouse");

    // 세액까지 도달했는가 — 승계된 취득가액 3억으로 계산됐다
    const json = await resp.json();
    expect(json.result.acquisitionPrice).toBe(300_000_000);
    expect(json.result.transferIncome).toBe(700_000_000);
    expect(json.result.calculatedTax).toBe(139_500_000);
    // ⑦ 결과 계층이 채택 사유를 설명한다
    expect(
      (json.result.warnings as string[]).some((w) => w.includes("§97의2① 이월과세 적용")),
    ).toBe(true);

    /**
     * ⑦ A/B 비교 카드 — §97의2②3호가 견준 **두 결정세액**이 화면에 나와야 한다.
     * `carryoverDetail`이 route → 결과뷰까지 도달했다는 증명이기도 하다
     * (엔진이 맞아도 명시 매핑에서 조용히 사라질 수 있다 — P-8이 그랬다).
     */
    expect(json.result.carryoverDetail?.outcome).toBe("applied");
    await expect(
      page.getByText("§97의2① 이월과세 — 적용 / 미적용 비교"),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("전체 결정세액").first()).toBeVisible();
    // A/B 1주당 취득가액이 나란히 표시된다 (승계 30,000 vs 증여 당시 80,000)
    await expect(page.getByText("1주당 취득가액").first()).toBeVisible();
  });
});
