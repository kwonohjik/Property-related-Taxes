/**
 * E2E: 주식 다종목 합산 — **이력 저장·복원 규약**
 *
 * 계획서: `docs/00-pm/stock-history-aggregate-filing.plan.md` §2 G-B·G-E · §4.1 (PR-1)
 *
 * ## 왜 E2E여야 하는가 — vitest로는 못 잡는다
 *
 * 착수 중 실측(계획서 §3 P-7): `StockTransferTaxCalculator`의 저장 배선을 **결함 상태로 원복**
 * 했는데 PR-1의 vitest anchor **33건이 전부 초록**이었다. anchor는 record 형태를 직접 주입해
 * leaf를 검증하므로 「컴포넌트가 그 leaf를 실제로 쓰는가」는 보지 못한다
 * ([[feedback_library_anchor_does_not_prove_component_uses_it]]).
 *
 * ⇒ 이 spec이 **그 배선의 유일한 안전망**이다.
 *
 * 종전 결함: 2종목을 합산 계산하면 이력에 **마지막 종목 한 건**만 남고 납부세액에는 그 종목의
 * per-item 세액(차손이면 0)이 저장됐다 — 앞 종목은 통째로 사라졌다.
 *
 * 실행: npx playwright test e2e/stock-multi-history-record.spec.ts
 */
import { test, expect } from "@playwright/test";

import { gotoStockTransferTax, fillItemThroughStep3 } from "./_helpers/stock-item-fill";

/** 2종목을 확정·계산하고 결과 화면의 **합계 결정세액** 텍스트를 돌려준다. */
async function calcTwoItems(page: import("@playwright/test").Page): Promise<string> {
  await gotoStockTransferTax(page);

  await fillItemThroughStep3(page, "첫째종목", { y: "2024", m: "02", d: "01" });
  await page.getByTestId("stock-item-add").click();
  await fillItemThroughStep3(page, "둘째종목", { y: "2024", m: "09", d: "01" });

  const calcResponse = page.waitForResponse(
    (r) => r.url().includes("/api/calc/stock-transfer") && r.request().method() === "POST",
    { timeout: 60_000 },
  );
  await page.getByRole("button", { name: "결과 보기" }).click();
  await calcResponse;

  const total = page.getByTestId("stock-aggregate-total-final-tax");
  await expect(total).toBeVisible({ timeout: 30_000 });
  // 결과 화면은 `won()`으로 「원」을 붙이고 이력 카드는 `toLocaleString()`이라 붙이지 않는다.
  // 비교 축을 **숫자**로 통일한다 — 표기 차이로 깨지면 결함이 아니라 셀렉터 문제가 된다.
  const text = ((await total.textContent()) ?? "").replace(/[^0-9,]/g, "");
  expect(text).not.toBe("");
  return text;
}

test.describe("주식 다종목 — 이력 저장·복원", () => {
  test("SH-1: 합산 계산의 이력이 **신고서 전체**로 저장된다", async ({ page }) => {
    test.setTimeout(180_000);
    const totalOnResult = await calcTwoItems(page);

    await page.goto("/history");
    await page.waitForLoadState("networkidle");

    const card = page.locator("li, article, div").filter({ hasText: "다종목" }).first();
    await expect(card).toBeVisible({ timeout: 30_000 });

    // ① 제목이 다종목임을 드러낸다 — 단건과 라벨로 구분된다
    await expect(page.getByText(/\(다종목\)/).first()).toBeVisible();
    // ② 대표 종목 + 외 N건
    await expect(page.getByText(/첫째종목 외 1건/).first()).toBeVisible();
    // ③ 🔴 납부세액이 **합산 총액**이다 — 종전에는 마지막 종목 per-item 세액이 저장됐다
    await expect(page.getByText(`납부세액: ${totalOnResult}`).first()).toBeVisible();
  });

  test("SH-2: 그 이력을 편집하면 **종목 2건이 모두** 복원된다", async ({ page }) => {
    test.setTimeout(180_000);
    await calcTwoItems(page);

    await page.goto("/history");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "편집" }).first().click();

    // 마법사 1단계 — 확정 목록 1건 + 편집기 1건 = 2건
    await expect(page.getByText(/양도 종목 \(2건\)/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("stock-item-edit-0")).toBeVisible();
    // 편집기에는 **마지막** 종목이 올라온다
    await expect(page.getByPlaceholder("종목명을 입력하세요")).toHaveValue("둘째종목");
  });

  test("SH-3: 단건 이력을 편집하면 직전 세션의 확정 목록이 **비워진다**", async ({ page }) => {
    test.setTimeout(180_000);
    // 다종목 상태를 만든다(확정 1건 + 편집기 1건) — sessionStorage에 savedItems가 남는다
    await gotoStockTransferTax(page);
    await fillItemThroughStep3(page, "잔재종목", { y: "2024", m: "02", d: "01" });
    await page.getByTestId("stock-item-add").click();
    await expect(page.getByText(/양도 종목 \(2건\)/)).toBeVisible({ timeout: 30_000 });

    // 단건 이력을 하나 만들어 둔다 — 같은 세션에서 계산해 저장되게 한다
    await gotoStockTransferTax(page); // sessionStorage.clear() 로 목록이 초기화된다
    await fillItemThroughStep3(page, "단건종목", { y: "2024", m: "05", d: "01" });
    const calcResponse = page.waitForResponse(
      (r) => r.url().includes("/api/calc/stock-transfer") && r.request().method() === "POST",
      { timeout: 60_000 },
    );
    await page.getByRole("button", { name: "결과 보기" }).click();
    await calcResponse;

    // 다시 다종목 상태로 오염시킨다
    await page.goto("/calc/stock-transfer-tax");
    await page.waitForLoadState("networkidle");
    await fillItemThroughStep3(page, "오염종목", { y: "2024", m: "03", d: "01" });
    await page.getByTestId("stock-item-add").click();
    await expect(page.getByText(/양도 종목 \(2건\)/)).toBeVisible({ timeout: 30_000 });

    // 🔴 단건 이력을 편집 — 목록이 비워져야 한다(종전에는 오염종목이 그대로 남아 합산됐다)
    await page.goto("/history");
    await page.waitForLoadState("networkidle");
    await page
      .locator("li, article, div")
      .filter({ hasText: "단건종목" })
      .getByRole("button", { name: "편집" })
      .first()
      .click();

    await expect(page.getByText(/양도 종목 \(1건\)/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("stock-item-edit-0")).toHaveCount(0);
    await expect(page.getByPlaceholder("종목명을 입력하세요")).toHaveValue("단건종목");
  });
});
