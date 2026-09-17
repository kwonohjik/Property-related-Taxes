/**
 * E2E: 주식 결과 화면 — **신고서 양식 표가 맨 앞**이다
 *
 * 제보 —「주식 다자산 합산 결과탭에서 신고서 양식이 맨 첫번째 위치하도록 수정해줘」
 *
 * ## 왜 E2E 인가
 *
 * 순서는 **두 파일에 걸쳐** 정해진다 — 합산 요약 카드는 `StockTransferTaxCalculator` 가
 * `Step4` **앞**에서 렌더하고, 출력 패널·신고서는 `StockTransferTaxResultView` 안에 있다.
 * 한쪽만 고치면 신고서가 여전히 두 번째다. 단위 테스트로는 이 결합을 볼 수 없다.
 *
 * 🔑 판정은 **y 좌표**로 한다. DOM 순서는 flex/grid `order` 로 뒤집힐 수 있어 「화면에서
 *   먼저 보이는가」를 증명하지 못한다.
 */

import { test, expect } from "@playwright/test";

import { gotoStockTransferTax, fillItemThroughStep3 } from "./_helpers/stock-item-fill";

/** 요소의 화면상 세로 위치 — 보이지 않으면 실패시킨다(0 을 「맨 위」로 오독하지 않게). */
async function topOf(page: import("@playwright/test").Page, sel: string) {
  const box = await page.locator(sel).first().boundingBox();
  expect(box, `보이지 않는다: ${sel}`).not.toBeNull();
  return box!.y;
}

test.describe("주식 결과 화면 — 섹션 순서", () => {
  test("SO-1: 다종목 합산 — 신고서 표가 출력 패널·합산 요약 카드보다 위에 있다", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await gotoStockTransferTax(page);
    await fillItemThroughStep3(page, "첫째종목", { y: "2024", m: "02", d: "01" });
    await page.getByTestId("stock-item-add").click();
    await fillItemThroughStep3(page, "둘째종목", { y: "2024", m: "09", d: "01" });

    await page.getByRole("button", { name: "결과 보기" }).click();
    await expect(page.getByText(/다자산 합산 \(2종목\)/)).toBeVisible({ timeout: 60_000 });

    const filingY = await topOf(page, '[data-print-section="stock-form-table"]');
    const panelY = await topOf(page, 'text=출력 항목 선택');
    const summaryY = await topOf(page, 'text=다종목 합산');

    expect(filingY, `신고서 ${filingY} vs 출력 패널 ${panelY}`).toBeLessThan(panelY);
    expect(filingY, `신고서 ${filingY} vs 합산 요약 ${summaryY}`).toBeLessThan(summaryY);
  });

  test("SO-2: 단건 — 신고서 표가 출력 패널보다 위에 있다", async ({ page }) => {
    test.setTimeout(300_000);
    await gotoStockTransferTax(page);
    await fillItemThroughStep3(page, "단건종목", { y: "2024", m: "02", d: "01" });

    await page.getByRole("button", { name: "결과 보기" }).click();
    await expect(page.locator('[data-print-section="stock-form-table"]')).toBeVisible({
      timeout: 60_000,
    });

    const filingY = await topOf(page, '[data-print-section="stock-form-table"]');
    const panelY = await topOf(page, 'text=출력 항목 선택');
    expect(filingY, `신고서 ${filingY} vs 출력 패널 ${panelY}`).toBeLessThan(panelY);
  });
});
