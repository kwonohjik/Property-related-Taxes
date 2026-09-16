/**
 * E2E: 주식 합산 — **§111③ 확정신고 기납부세액 정산** 전 경로
 *
 * 계획서: `docs/00-pm/stock-history-aggregate-filing.plan.md` §2 G-D · §4.3 (PR-2)
 *
 * ## 왜 E2E여야 하는가
 *
 * 이 축은 ⑤UI → ④전송 → ⑫Zod → ⑭route → 엔진 → ⑦결과까지 **여섯 층**을 지난다.
 * vitest anchor 는 각 층을 따로 검증할 뿐 「그 층들이 실제로 이어져 있는가」를 못 본다 —
 * PR-1의 P-7 실측에서 배선을 통째로 끊어도 anchor 33건이 전부 초록이었다
 * ([[feedback_library_anchor_does_not_prove_component_uses_it]]).
 *
 * ⚠️ ⑫⑬⑭는 TypeScript 가 못 잡는 구간이다 — 누락되면 값이 **침묵 strip** 되어 정산이
 *    조용히 사라진다. `postData` 단언이 그 지점의 유일한 안전망이다.
 *
 * 실행: npx playwright test e2e/stock-preliminary-paid-settlement.spec.ts
 */
import { test, expect } from "@playwright/test";

import { gotoStockTransferTax, fillItemThroughStep3 } from "./_helpers/stock-item-fill";

/** 3단계에서 확정신고를 고르고 기납부세액을 채운다. */
async function chooseFinalFilingWithPrepaid(
  page: import("@playwright/test").Page,
  national: string,
  local: string,
) {
  await page.getByRole("radio", { name: "확정신고" }).first().click();
  await page
    .locator('div:has(> label:has-text("기납부 양도소득세 (국세)")) input[type="text"]')
    .first()
    .fill(national);
  await page
    .locator('div:has(> label:has-text("기납부 지방소득세")) input[type="text"]')
    .first()
    .fill(local);
}

test.describe("주식 합산 — §111③ 기납부세액 정산", () => {
  test("PS-1: 확정신고 + 2종목이면 기납부 입력란이 나타난다", async ({ page }) => {
    test.setTimeout(180_000);
    await gotoStockTransferTax(page);

    // 종목 1건만 있을 때는 나오지 않는다 — §173⑤3호의 요건이 「2회 이상 양도」다
    await fillItemThroughStep3(page, "첫째종목", { y: "2024", m: "02", d: "01" });
    await page.getByRole("radio", { name: "확정신고" }).first().click();
    await expect(page.getByText("예정신고 기납부세액 (§111③)")).toHaveCount(0);

    // 2건째를 확정하면 나타난다
    await page.getByTestId("stock-item-add").click();
    await fillItemThroughStep3(page, "둘째종목", { y: "2024", m: "09", d: "01" });
    await page.getByRole("radio", { name: "확정신고" }).first().click();
    await expect(page.getByText("예정신고 기납부세액 (§111③)")).toBeVisible({ timeout: 15_000 });
  });

  test("PS-2: 🔴 예정신고로 되돌리면 입력란이 사라진다 (§111③은 확정신고납부 규정)", async ({ page }) => {
    test.setTimeout(180_000);
    await gotoStockTransferTax(page);
    await fillItemThroughStep3(page, "첫째종목", { y: "2024", m: "02", d: "01" });
    await page.getByTestId("stock-item-add").click();
    await fillItemThroughStep3(page, "둘째종목", { y: "2024", m: "09", d: "01" });

    await page.getByRole("radio", { name: "확정신고" }).first().click();
    await expect(page.getByText("예정신고 기납부세액 (§111③)")).toBeVisible({ timeout: 15_000 });

    await page.getByRole("radio", { name: "예정신고" }).first().click();
    await expect(page.getByText("예정신고 기납부세액 (§111③)")).toHaveCount(0);
  });

  test("PS-3: 🔴 입력값이 ⑬body에 실려 ⑦결과 정산 행으로 돌아온다 (침묵 strip 방지)", async ({ page }) => {
    test.setTimeout(180_000);
    await gotoStockTransferTax(page);
    await fillItemThroughStep3(page, "첫째종목", { y: "2024", m: "02", d: "01" });
    await page.getByTestId("stock-item-add").click();
    await fillItemThroughStep3(page, "둘째종목", { y: "2024", m: "09", d: "01" });
    await chooseFinalFilingWithPrepaid(page, "3000000", "300000");

    const calcResponse = page.waitForResponse(
      (r) => r.url().includes("/api/calc/stock-transfer") && r.request().method() === "POST",
      { timeout: 60_000 },
    );
    await page.getByRole("button", { name: "결과 보기" }).click();
    const resp = await calcResponse;
    expect(resp.ok()).toBeTruthy();

    // ⑬ — items **밖**에 신고 단위로 실린다
    const body = JSON.parse(resp.request().postData() ?? "{}");
    expect(body.preliminaryPaidTax).toBe(3_000_000);
    expect(body.preliminaryPaidLocalTax).toBe(300_000);

    // ⑦ — 결과 카드에 정산 블록
    const settlement = page.getByTestId("stock-aggregate-settlement");
    await expect(settlement).toBeVisible({ timeout: 30_000 });
    await expect(settlement).toContainText("3,000,000");

    // 🔴 이번에 납부할 세액 = 결정세액 − 기납부 (결정세액 자체는 그대로다)
    const totalText = ((await page.getByTestId("stock-aggregate-total-final-tax").textContent()) ?? "")
      .replace(/[^0-9]/g, "");
    const dueText = ((await page.getByTestId("stock-aggregate-settlement-due").textContent()) ?? "")
      .replace(/[^0-9]/g, "");
    expect(Number(totalText)).toBeGreaterThan(0);
    expect(Number(dueText)).toBeLessThan(Number(totalText));
  });

  test("PS-4: 기납부 없이 계산하면 정산 블록이 없다 (음성 대조)", async ({ page }) => {
    test.setTimeout(180_000);
    await gotoStockTransferTax(page);
    await fillItemThroughStep3(page, "첫째종목", { y: "2024", m: "02", d: "01" });
    await page.getByTestId("stock-item-add").click();
    await fillItemThroughStep3(page, "둘째종목", { y: "2024", m: "09", d: "01" });

    const calcResponse = page.waitForResponse(
      (r) => r.url().includes("/api/calc/stock-transfer") && r.request().method() === "POST",
      { timeout: 60_000 },
    );
    await page.getByRole("button", { name: "결과 보기" }).click();
    const resp = await calcResponse;
    const body = JSON.parse(resp.request().postData() ?? "{}");
    expect(body.preliminaryPaidTax).toBeUndefined();

    await expect(page.getByTestId("stock-aggregate-total-final-tax")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("stock-aggregate-settlement")).toHaveCount(0);
  });
});
