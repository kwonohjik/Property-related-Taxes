/**
 * E2E: 주식 다종목 합산신고 — §103①2호 공동 기본공제 + 별지 제84호서식 종목별 열
 *
 * 계획서: docs/02-design/features/foreign-stock-118-6-limit-bc-apportionment.plan.md (Phase 5~7)
 *
 * ## 무엇을 증명하는가
 *
 * 엔진·API는 PR #1223·#1224에서 완성됐지만 **사용자가 도달할 경로가 없었다**
 * (클라이언트가 `items`를 한 번도 보내지 않았다). 이 spec은 실제 브라우저에서 종목을 2건
 * 입력해 **합산 경로가 실제로 호출되고 서식이 종목별 열로 렌더되는지**를 본다.
 *
 * 🔑 종목 확정 버튼은 **마지막 입력 단계(3단계)**에 있다 — 양도가액은 2단계, 필요경비·신고는
 *    3단계라 1단계에서 확정하면 금액이 빈 종목이 목록에 들어간다.
 *
 * 실행: E2E_PORT=3200 npx playwright test e2e/stock-multi-item-aggregate.spec.ts
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
  await page.locator(`div:has(> label:has-text('${label}')) input[type="text"]`).first().fill(value);
}

/** 1단계 — 비상장 종목 (취득 2021-01-02 / 양도 지정일 · 100주) */
async function fillStep1(page: Page, name: string, t: { y: string; m: string; d: string }) {
  await page.getByPlaceholder("종목명을 입력하세요").fill(name);
  await page.getByRole("radio", { name: "비상장" }).first().click();

  const y = page.locator('input[type="text"][aria-label="연도"]');
  const m = page.locator('input[type="text"][aria-label="월"]');
  const d = page.locator('input[type="text"][aria-label="일"]');
  await y.nth(0).fill("2021");
  await m.nth(0).fill("01");
  await d.nth(0).fill("02");
  await y.nth(1).fill(t.y);
  await m.nth(1).fill(t.m);
  await d.nth(1).fill(t.d);

  await page
    .locator('[data-slot="field-card"]')
    .filter({ hasText: "양도 주식수" })
    .locator("input")
    .first()
    .fill("100");
  await page
    .locator('[data-slot="field-card"]')
    .filter({ hasText: "발행주식 총수" })
    .locator("input")
    .first()
    .fill("1000000");
}

/** 1 → 2 → 3단계 완주. 양도소득 50,000,000이 나오게 채운다. */
async function fillItemThroughStep3(page: Page, name: string, t: { y: string; m: string; d: string }) {
  await fillStep1(page, name, t);

  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByText("양도·취득가액").first()).toBeVisible({ timeout: 10_000 });
  await fillByLabel(page, "양도가액 합계", "100000000");
  await fillByLabel(page, "1주당 취득가액", "500000");

  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByText("필요경비·신고").first()).toBeVisible({ timeout: 10_000 });

  // 신고일 — validate가 요구한다. 신고 단위 필드라 종목 확정 시 승계되지만,
  // 첫 종목에서는 직접 채워야 한다(anchor MI-1-2가 승계를 별도로 고정한다).
  await page.locator('input[type="text"][aria-label="연도"]').nth(0).fill("2025");
  await page.locator('input[type="text"][aria-label="월"]').nth(0).fill("02");
  await page.locator('input[type="text"][aria-label="일"]').nth(0).fill("28");
}

test.describe("주식 다종목 합산신고", () => {
  test("MI-E2E-1: 1단계 목록 카드는 **확정 버튼 없이** 현황만 보인다", async ({ page }) => {
    await gotoStockTransferTax(page);
    await expect(page.getByText(/양도 종목 \(1건\)/)).toBeVisible();
    // 금액을 채우기 전 단계라 확정 버튼이 있으면 안 된다.
    await expect(page.getByTestId("stock-item-add")).toHaveCount(0);
  });

  test("MI-E2E-2: 3단계에서 종목을 확정하면 목록에 쌓이고 1단계로 돌아간다", async ({ page }) => {
    test.setTimeout(120_000);
    await gotoStockTransferTax(page);
    await fillItemThroughStep3(page, "첫째종목", { y: "2024", m: "02", d: "01" });

    const addBtn = page.getByTestId("stock-item-add");
    await expect(addBtn).toBeEnabled();
    await addBtn.click();

    // 1단계로 복귀 + 목록 1건 + 편집기는 2번째 종목
    await expect(page.getByPlaceholder("종목명을 입력하세요")).toHaveValue("");
    await expect(page.getByText(/양도 종목 \(2건\)/)).toBeVisible();
    await expect(page.getByTestId("stock-item-edit-0")).toBeVisible();
  });

  test("MI-E2E-3: 확정한 종목을 삭제하면 목록에서 빠진다", async ({ page }) => {
    test.setTimeout(120_000);
    await gotoStockTransferTax(page);
    await fillItemThroughStep3(page, "삭제될종목", { y: "2024", m: "03", d: "01" });
    await page.getByTestId("stock-item-add").click();
    await expect(page.getByTestId("stock-item-remove-0")).toBeVisible();

    await page.getByTestId("stock-item-remove-0").click();

    await expect(page.getByTestId("stock-item-remove-0")).toHaveCount(0);
    await expect(page.getByText(/양도 종목 \(1건\)/)).toBeVisible();
  });

  test("MI-E2E-4: 2종목 계산 → items 전송 · 기본공제 1회 · 서식 종목별 열", async ({ page }) => {
    test.setTimeout(180_000);
    await gotoStockTransferTax(page);

    // 종목 1 (2월 양도 — §103②로 기본공제를 가져간다)
    await fillItemThroughStep3(page, "첫째종목", { y: "2024", m: "02", d: "01" });
    await page.getByTestId("stock-item-add").click();

    // 종목 2 (9월 양도)
    await fillItemThroughStep3(page, "둘째종목", { y: "2024", m: "09", d: "01" });

    const calcResponse = page.waitForResponse(
      (r) => r.url().includes("/api/calc/stock-transfer") && r.request().method() === "POST",
      { timeout: 60_000 },
    );
    await page.getByRole("button", { name: "결과 보기" }).click();
    const resp = await calcResponse;
    expect(resp.ok()).toBeTruthy();

    // ⑬ 클라이언트가 **items 배열**을 보낸다 (종전에는 단건 body였다)
    const reqBody = JSON.parse(resp.request().postData() ?? "{}");
    expect(Array.isArray(reqBody.items)).toBe(true);
    expect(reqBody.items).toHaveLength(2);
    expect(reqBody.deductionMode).toBe("aggregate");

    // §103①2호 — 기본공제 250만원이 **한 번만**
    const json = await resp.json();
    expect(json.result.basicDeductionByGroup.stock).toBe(2_500_000);

    // 다종목 합산 요약 카드 + 별지 제84호서식 종목별 열
    await expect(page.getByText(/다종목 합산 \(2건\)/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/다자산 합산 \(2종목\)/)).toBeVisible();

    // ⑥ 사이드바가 **신고 전체**를 말한다 — 종전에는 편집 중 1건만 보였다(Phase D · A-1)
    await expect(page.getByText("2건 합산")).toBeVisible();
    await expect(page.getByText("양도소득금액 합계")).toBeVisible();

    // ⑦ 증권거래세 합계 — 엔진은 계산했는데 화면에 나온 적이 없었다(Phase D · A-2)
    await expect(page.getByText("증권거래세 합계 (정보성)")).toBeVisible();
    await expect(page.getByText(/별도로 납부/)).toBeVisible();
  });

  /**
   * MI-E2E-5 (Phase E · A-3) — **불완전 종목이 목록에 들어가는 경로가 실재한다.**
   *
   * 「다음」 버튼은 단계별 validate 를 거치지만 **사이드바 스텝 클릭은 그냥 점프**한다
   * (`onStepClick={(i) => setStep(i)}`). 종목명·시장만 넣고 3단계로 점프하면 확정 게이트
   * (종목명+시장 2개)를 통과해 **금액도 날짜도 빈 종목**이 목록에 쌓인다.
   *
   * 종전에는 그대로 계산돼 엔진이 `transferDate.getTime is not a function` 으로 터졌고
   * (500), 사용자는 어느 종목이 문제인지 알 수 없었다.
   */
  test("MI-E2E-5: 불완전 종목을 확정하면 계산이 **종목을 지목해** 막힌다", async ({ page }) => {
    test.setTimeout(180_000);
    await gotoStockTransferTax(page);

    // 1) 정상 종목 1건 확정
    await fillItemThroughStep3(page, "정상종목", { y: "2024", m: "02", d: "01" });
    await page.getByTestId("stock-item-add").click();

    // 2) 종목명·시장만 넣고 **사이드바로 3단계 점프** — validate 를 우회한다
    await page.getByPlaceholder("종목명을 입력하세요").fill("빈종목");
    await page.getByRole("radio", { name: "비상장" }).first().click();
    await page.getByRole("button", { name: /필요경비·신고/ }).first().click();
    await expect(page.getByTestId("stock-item-add")).toBeEnabled();
    await page.getByTestId("stock-item-add").click();

    // 3) 목록에 「입력 미완료」 배지
    await expect(page.getByText("입력 미완료")).toBeVisible();

    // 4) 계산 시도 → 순번과 종목명으로 지목해 차단 (종전에는 500)
    await page.getByRole("button", { name: /필요경비·신고/ }).first().click();
    await page.getByRole("button", { name: "결과 보기" }).click();
    await expect(page.getByText(/2번째 종목 「빈종목」/)).toBeVisible({ timeout: 15_000 });
  });
});
