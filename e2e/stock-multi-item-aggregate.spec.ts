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

import { test, expect } from "@playwright/test";

import { gotoStockTransferTax, fillItemThroughStep3 } from "./_helpers/stock-item-fill";

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
   * MI-E2E-5 (Phase E · A-3) — **불완전 종목이 목록에 들어가면 계산이 종목을 지목해 막는다.**
   *
   * 🔄 **경로가 바뀌었다 (F-8b, 2026-09-25).** 종전에는 「종목명·시장만 넣고 사이드바로 ③에
   *    점프」해 확정 게이트(종목명+시장 2개)를 통과시켰다. 그 점프는 이제 `handleStepJump`가
   *    막는다 — ③에 가려면 ①②가 유효해야 한다.
   *
   * 🔑 **그래도 불완전 종목은 만들 수 있다.** 확정 게이트는 여전히 2개뿐이고, ③ 자신의
   *    필수(신고일)는 비운 채 「확정」을 누를 수 있다. 즉 이 테스트의 **주제**
   *    (`validateFilingItems`가 몇 번째 종목인지 지목한다)는 그대로 살아 있고,
   *    **수단**만 바뀌었다. 종전 수단으로 다시 쓰면 게이트 회귀를 놓친다
   *    ([[feedback_shared_assertion_reversal_erases_sibling_net]]).
   *
   * 종전에는 그대로 계산돼 엔진이 `transferDate.getTime is not a function` 으로 터졌고
   * (500), 사용자는 어느 종목이 문제인지 알 수 없었다.
   */
  test("MI-E2E-5: 불완전 종목을 확정하면 계산이 **종목을 지목해** 막힌다", async ({ page }) => {
    test.setTimeout(180_000);
    await gotoStockTransferTax(page);

    // 1) ①②는 유효하게 채워 ③까지 간 뒤, **신고일을 비운 채** 확정한다.
    await fillItemThroughStep3(page, "빈종목", { y: "2024", m: "02", d: "01" });
    const filingYear = page.locator('input[type="text"][aria-label="연도"]').nth(0);
    await filingYear.click();
    await filingYear.press("ControlOrMeta+a");
    await filingYear.press("Backspace");
    await expect(filingYear).toHaveValue("");

    await expect(page.getByTestId("stock-item-add")).toBeEnabled();
    await page.getByTestId("stock-item-add").click();

    // 2) 목록에 「입력 미완료」 배지
    await expect(page.getByText("입력 미완료")).toBeVisible();

    // 3) 두 번째 종목은 완전하게 채운다 — 편집기가 유효해야 「결과 보기」에 도달한다.
    await fillItemThroughStep3(page, "정상종목", { y: "2024", m: "09", d: "01" });

    // 4) 계산 시도 → 순번과 종목명으로 지목해 차단 (종전에는 500)
    await page.getByRole("button", { name: "결과 보기" }).click();
    await expect(page.getByText(/1번째 종목 「빈종목」/)).toBeVisible({ timeout: 15_000 });
  });
});
