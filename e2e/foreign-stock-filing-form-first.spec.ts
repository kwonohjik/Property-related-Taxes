/**
 * E2E: 국외주식 결과 화면 — ② 출력 항목 선택 → ③ 신고서 양식 → ④ 결과 카드
 *
 * 제보 —「해외주식 양도소득세 결과탭 첫번째 출력물을 신고서 양식이 출력되도록 수정해줘」
 *
 * ## 이건 순서 문제가 아니라 **부재** 문제였다
 *
 * 직전 작업(`stock-result-section-order.spec.ts`)이 고친 것은 `StockTransferTaxResultView`
 * 경로다. 국외주식 **단건**은 그 결과뷰를 아예 타지 않는다 — `Step4` 가
 * `marketType === "foreign_stock"` 분기에서 `ForeignStockResultCard` **하나만** 렌더했고,
 * 별지 제84호서식은 **한 번도 렌더되지 않았다**. 그래서 SO-2 가 초록인데도 국외주식 화면에는
 * 신고서가 없었다.
 *
 * 🔑 판정은 **y 좌표**로 한다(SO-1·SO-2 와 같은 이유 — DOM 순서는 `order` 로 뒤집힌다).
 *   보이지 않으면 실패시킨다.
 */

import { test, expect, type Page } from "@playwright/test";

// 🔑 헬퍼는 `foreign-stock-expense-exchange-rate.spec.ts` 와 **같은 구현**이다 — 해외주식 진입은
//   sessionStorage 를 비우고 두 번 goto 해야 이전 spec 의 폼이 남지 않는다.
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

async function reachStep3(page: Page) {
  await gotoStockTransferTax(page);
  await page.getByPlaceholder("종목명을 입력하세요").fill("FX Corp");
  await page.getByRole("radio", { name: "해외주식" }).first().click();
  await fillByLabel(page, "국내 거주 연수", "10");

  const y = page.locator('input[type="text"][aria-label="연도"]');
  const m = page.locator('input[type="text"][aria-label="월"]');
  const d = page.locator('input[type="text"][aria-label="일"]');
  await y.nth(0).fill("2021");
  await m.nth(0).fill("03");
  await d.nth(0).fill("15");
  await y.nth(1).fill("2025");
  await m.nth(1).fill("09");
  await d.nth(1).fill("30");
  await fillByLabel(page, "양도 주식수", "1000");

  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByText("양도가액 — 원화 환산 (§178의5)")).toBeVisible({ timeout: 10_000 });
  await fillByLabel(page, "양도일 기준환율", "1000");
  await fillByLabel(page, "1주당 양도가액 (외화)", "200");
  await fillByLabel(page, "취득일 기준환율", "1000");
  await fillByLabel(page, "1주당 취득가액 (외화)", "100");

  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByText("필요경비·신고").first()).toBeVisible({ timeout: 10_000 });
  await page.locator('input[type="text"][aria-label="연도"]').nth(0).fill("2025");
  await page.locator('input[type="text"][aria-label="월"]').nth(0).fill("11");
  await page.locator('input[type="text"][aria-label="일"]').nth(0).fill("30");
}

/** 요소의 화면상 세로 위치 — 보이지 않으면 실패시킨다(0 을 「맨 위」로 오독하지 않게). */
async function topOf(page: Page, sel: string) {
  const box = await page.locator(sel).first().boundingBox();
  expect(box, `보이지 않는다: ${sel}`).not.toBeNull();
  return box!.y;
}

test.describe("국외주식 결과 화면 — 섹션 순서", () => {
  test("FF-1: 신고서 표가 렌더되고 출력 패널 뒤·결과 카드 앞에 있다", async ({ page }) => {
    test.setTimeout(180_000);
    await reachStep3(page);

    await page.getByRole("button", { name: "결과 보기" }).click();
    await expect(page.getByText(/해외주식 양도소득세 결과/)).toBeVisible({ timeout: 60_000 });

    const panelY = await topOf(page, 'text=출력 항목 선택');
    const filingY = await topOf(page, '[data-print-section="stock-form-table"]');
    const cardY = await topOf(page, 'text=/해외주식 양도소득세 결과/');

    // 국외 트랙에는 의뢰인 카드(①)가 없다 — 국내 결과뷰 전용 컴포넌트다.
    expect(panelY, `출력 패널 ${panelY} vs 신고서 ${filingY}`).toBeLessThan(filingY);
    expect(filingY, `신고서 ${filingY} vs 결과 카드 ${cardY}`).toBeLessThan(cardY);
  });

  test("FF-2: 신고서 표에 국외주식 값이 실린다 (빈 껍데기가 아니다)", async ({ page }) => {
    test.setTimeout(180_000);
    await reachStep3(page);

    await page.getByRole("button", { name: "결과 보기" }).click();
    const table = page.locator('[data-print-section="stock-form-table"]');
    await expect(table).toBeVisible({ timeout: 60_000 });

    // 양도가액 200 × 1,000주 × 환율 1,000 = 200,000,000 / 취득가액 100,000,000
    await expect(table).toContainText("200,000,000");
    await expect(table).toContainText("100,000,000");
    // 내부 enum id 노출 금지 — 분류 라벨이 사람 말이어야 한다
    await expect(table).not.toContainText("foreign_stock");
  });

  /**
   * FF-3: 서식에 실리는 **근거 조문이 국외주식 것**이다.
   *
   * 서식은 `StockTransferResult` 한 타입만 읽으므로 국내 기준 라벨이 그대로 따라온다.
   * 20%는 §104①11호나목2)(국내 비대주주)에도 §104①12호나목(국외)에도 있어 **세율 값만으로는
   * 갈리지 않는다** — 값이 맞아도 조문이 틀릴 수 있어 별도 단언이 필요하다.
   */
  test("FF-3: 세율·누진공제·신고기한 근거가 §104①12호·§110① 이다 (§104①11·예정신고 아님)", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await reachStep3(page);

    await page.getByRole("button", { name: "결과 보기" }).click();
    const table = page.locator('[data-print-section="stock-form-table"]');
    await expect(table).toBeVisible({ timeout: 60_000 });

    // 세율 — 국외주식 전용 호
    await expect(table).toContainText("§104①12 나목");
    // 국내 주식 호가 섞이면 안 된다 (23·24행 둘 다)
    await expect(table).not.toContainText("§104①11");

    // 신고기한 — §105① 본문 괄호가 3호다목을 빼므로 **예정신고 의무가 없다**
    await expect(table).toContainText("§110①");
    await expect(table).not.toContainText("예정신고: 반기 말일");
  });

  /**
   * FF-4: 가산세가 서식 26행에 **도달한다** — 25 + 26 = 29.
   *
   * 🔴 종전에는 어댑터가 가산세를 0으로 버려 `25행 19,500,000 / 26행 0 / 29행 21,450,000`으로
   *   **차액이 어느 행에도 없었다**. 단위 anchor(`foreign-stock-filing-penalty.anchor.test.ts`)는
   *   어댑터에서 출발하므로 「사용자가 그 값을 넣을 수 있는가」를 증명하지 못한다 — 이 spec 이
   *   폼(과소신고 라디오) → 엔진 → 서식까지 **실제 경로**를 따라간다.
   */
  test("FF-4: 과소신고를 고르면 가산세가 서식 26행에 실린다 (25 + 26 = 29)", async ({ page }) => {
    test.setTimeout(180_000);
    await reachStep3(page);

    await page.getByRole("radio", { name: /과소신고/ }).first().click();
    await page.getByRole("button", { name: "결과 보기" }).click();

    const table = page.locator('[data-print-section="stock-form-table"]');
    await expect(table).toBeVisible({ timeout: 60_000 });

    // 과세표준 97,500,000 × 20% = 19,500,000 → 과소신고 10% = 1,950,000
    await expect(table).toContainText("1,950,000");
    // 29행 결정세액 = 19,500,000 + 1,950,000
    await expect(table).toContainText("21,450,000");
  });
});
