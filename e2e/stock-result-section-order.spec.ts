/**
 * E2E: 주식 결과 화면 — 섹션 순서 ① 의뢰인 카드 → ② 출력 항목 선택 → ③ 신고서 → ④ 나머지
 *
 * 제보 —「모든 결과탭의 화면 출력 순서를 [의뢰인 카드][출력 항목 선택][신고서 양식]
 * 기타 부속 명세서가 되도록 순서를 조정해」
 *
 * ⚠️ 이 spec 은 종전에 **정반대**를 고정하고 있었다(「신고서가 패널보다 위」 — 직전 제보).
 *   방향을 뒤집되 **「신고서가 렌더된다」는 축은 남긴다** — 단언을 통째로 지우면 형제
 *   안전망까지 사라진다(memory `feedback_shared_assertion_reversal_erases_sibling_net`).
 *
 * ## 왜 E2E 인가
 *
 * 순서는 **두 파일에 걸쳐** 정해진다 — 합산 요약 카드는 `StockTransferTaxCalculator` 가
 * `Step4` **앞**에서 렌더하고, 의뢰인 카드·출력 패널·신고서는 `StockTransferTaxResultView`
 * 안에 있다. 한쪽만 고치면 순서가 어긋난다. 단위 테스트로는 이 결합을 볼 수 없다.
 *
 * ⚠️ 결과뷰는 **비과세·메인 두 분기**가 각자 이 순서를 적는다 — 한쪽만 고치면 비과세 케이스가
 *   조용히 옛 순서로 남는다. SO-1·SO-2 는 둘 다 메인 분기를 지나므로 그 갭은 여전히 열려 있다.
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
  test("SO-1: 다종목 합산 — 의뢰인 카드 → 출력 패널 → 신고서 → 합산 요약 순이다", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await gotoStockTransferTax(page);
    await fillItemThroughStep3(page, "첫째종목", { y: "2024", m: "02", d: "01" });
    await page.getByTestId("stock-item-add").click();
    await fillItemThroughStep3(page, "둘째종목", { y: "2024", m: "09", d: "01" });

    await page.getByRole("button", { name: "결과 보기" }).click();
    await expect(page.getByText(/다자산 합산 \(2종목\)/)).toBeVisible({ timeout: 60_000 });

    const cardY = await topOf(page, '[data-print-id="taxpayer-header"]');
    const panelY = await topOf(page, 'text=출력 항목 선택');
    const filingY = await topOf(page, '[data-print-section="stock-form-table"]');
    const summaryY = await topOf(page, 'text=다종목 합산');

    expect(cardY, `의뢰인 카드 ${cardY} vs 출력 패널 ${panelY}`).toBeLessThan(panelY);
    expect(panelY, `출력 패널 ${panelY} vs 신고서 ${filingY}`).toBeLessThan(filingY);
    expect(filingY, `신고서 ${filingY} vs 합산 요약 ${summaryY}`).toBeLessThan(summaryY);
  });

  test("SO-2: 단건 — 의뢰인 카드 → 출력 패널 → 신고서 순이다", async ({ page }) => {
    test.setTimeout(300_000);
    await gotoStockTransferTax(page);
    await fillItemThroughStep3(page, "단건종목", { y: "2024", m: "02", d: "01" });

    await page.getByRole("button", { name: "결과 보기" }).click();
    await expect(page.locator('[data-print-section="stock-form-table"]')).toBeVisible({
      timeout: 60_000,
    });

    const cardY = await topOf(page, '[data-print-id="taxpayer-header"]');
    const panelY = await topOf(page, 'text=출력 항목 선택');
    const filingY = await topOf(page, '[data-print-section="stock-form-table"]');
    expect(cardY, `의뢰인 카드 ${cardY} vs 출력 패널 ${panelY}`).toBeLessThan(panelY);
    expect(panelY, `출력 패널 ${panelY} vs 신고서 ${filingY}`).toBeLessThan(filingY);
  });
});
