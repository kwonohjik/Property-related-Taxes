/**
 * E2E: 분할 매수·분할 양도 모드 — 제보 사례를 결과까지 (D-2·D-3·D-4)
 *
 * 계획서: docs/00-pm/stock-split-lots-ui-bugfix.plan.md
 *
 * 종전에는 분할 양도 모드(매도 건 입력)를 **결과까지 모는 spec이 0건**이었다. 그래서 폼 기본
 * 입력 방식이 「합계 직접 입력」으로 바뀐 뒤(2026-08·09) 분할 모드가 새 폼에서 항상
 * 「Validation failed」로 끝나는 것을 아무 게이트도 잡지 못했다.
 *
 * SPL-1: 매수 3건(매매 8,000@10,000 · 매매 8,000@12,000 · 증여 4,000@5,000) + 매도 10,000@20,000
 *        선입선출 → Step2 자동 산출(200,000,000 / 104,000,000) · 결과 계산 성공 · 취득가액 104,000,000
 *
 * SPL-2: 매수 #2 를 「유상증자」로 바꿔도 결과 동일(엔진에는 매매) · 매수 #3 「무상증자(비과세분)」은
 *        자본조정 안내와 함께 다음 단계로 못 간다 (PR-2 · A안)
 *
 * 실행: E2E_PORT=3217 npx playwright test e2e/stock-transfer-split-lots.spec.ts
 */

import { test, expect, type Page, type Locator } from "@playwright/test";

async function gotoStockTransferTax(page: Page) {
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => sessionStorage.clear());
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  await page.getByPlaceholder("종목명을 입력하세요").waitFor({ state: "visible", timeout: 30_000 });
}

async function fillDate(scope: Locator, ymd: string) {
  const [y, m, d] = ymd.split("-");
  await scope.locator('input[type="text"][aria-label="연도"]').first().fill(y);
  await scope.locator('input[type="text"][aria-label="월"]').first().fill(m);
  await scope.locator('input[type="text"][aria-label="일"]').first().fill(d);
}

/** 매수 lot 카드 (`AcquisitionLotCard` — 외곽 ⓐ 박스는 amber-200, 카드는 amber-300) */
const acqCard = (page: Page, n: number) =>
  page.locator("div.border-amber-300").filter({ hasText: `매수 #${n}` });
/** 매도 lot 카드 */
const trnCard = (page: Page, n: number) =>
  page.locator("div.border-emerald-300").filter({ hasText: `매도 #${n}` });

async function fillAcqLot(page: Page, n: number, date: string, shares: string, price: string) {
  const card = acqCard(page, n);
  await fillDate(card, date);
  await card.locator('[data-slot="field-card"]').filter({ hasText: "주식수" }).locator("input").first().fill(shares);
  await card.locator(`div:has(> label:has-text('1주당 단가')) input[type="text"]`).first().fill(price);
}


async function selectCause(page: Page, n: number, label: string) {
  await acqCard(page, n).getByRole("combobox").click();
  await page.getByRole("option", { name: label, exact: true }).click();
}

test.describe("분할 매수·분할 양도", () => {
  test("SPL-1: 제보 사례 선입선출 — Step2 자동 산출 · 결과 취득가액 104,000,000", async ({ page }) => {
    test.setTimeout(150_000);
    await gotoStockTransferTax(page);

    await page.getByPlaceholder("종목명을 입력하세요").fill("분할양도예제");
    await page.getByRole("radio", { name: "비상장" }).first().click();
    await page.getByRole("radio", { name: "분할 양도" }).first().click();

    // ⓐ 매수 3건
    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: /매수 행 추가/ }).click();
    }
    await fillAcqLot(page, 1, "2024-01-10", "8000", "10000");
    await fillAcqLot(page, 2, "2025-02-10", "8000", "12000");
    await fillAcqLot(page, 3, "2025-12-24", "4000", "5000");
    await acqCard(page, 3).getByRole("combobox").click();
    await page.getByRole("option", { name: "증여", exact: true }).click();

    // ⓑ 매도 1건
    await page.getByRole("button", { name: /매도 행 추가/ }).click();
    const sale = trnCard(page, 1);
    await fillDate(sale, "2026-05-11");
    await sale.locator('[data-slot="field-card"]').filter({ hasText: "주식수" }).locator("input").first().fill("10000");
    await sale.locator(`div:has(> label:has-text('1주당 단가')) input[type="text"]`).first().fill("20000");

    // D-2: 매도 행의 양도일 세 칸이 카드 안에 다 보인다(3열 배치에서는 오른쪽으로 밀려 잘렸다)
    const dateField = sale.locator('[data-slot="field-card"]').filter({ hasText: "양도일" }).first();
    const fieldBox = (await dateField.boundingBox())!;
    const dayBox = (await sale.locator('input[aria-label="일"]').first().boundingBox())!;
    expect(dayBox.x + dayBox.width).toBeLessThanOrEqual(fieldBox.x + fieldBox.width);

    await page.getByText("선입선출법", { exact: true }).click();
    await page
      .locator('[data-slot="field-card"]')
      .filter({ hasText: "발행주식 총수" })
      .locator("input")
      .first()
      .fill("100000");

    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByText("양도·취득가액").first()).toBeVisible({ timeout: 10_000 });

    // D-3: Step2 는 빈 입력칸 대신 1단계에서 산출한 값을 보여준다
    await expect(page.getByTestId("split-preview-transfer-total")).toHaveText("200,000,000");
    await expect(page.getByTestId("split-preview-acquisition-total")).toHaveText("104,000,000");

    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByText("필요경비·신고").first()).toBeVisible({ timeout: 10_000 });
    await fillDate(page.locator("body"), "2026-07-31"); // 신고일 (3단계 첫 날짜 칸)

    const calcResponse = page.waitForResponse(
      (r) => r.url().includes("/api/calc/stock-transfer") && r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: "결과 보기" }).click();
    const resp = await calcResponse;
    // D-4: 종전에는 400 「Validation failed」(입력 방식 기본값 total 이 분할 방어선에 걸림)
    expect(resp.status()).toBe(200);
    const json = await resp.json();
    expect(json.result.lotMatchingDetail.method).toBe("fifo");
    expect(json.result.transferPrice).toBe(200_000_000);
    expect(json.result.acquisitionPrice).toBe(104_000_000);
    await expect(page.getByText("Validation failed")).toHaveCount(0);
  });
  test("SPL-2: 유상증자 lot 은 매매와 같은 결과 · 비과세 무상주 lot 은 안내 + 진행 차단", async ({ page }) => {
    test.setTimeout(150_000);
    await gotoStockTransferTax(page);
    await page.getByPlaceholder("종목명을 입력하세요").fill("증자원인예제");
    await page.getByRole("radio", { name: "비상장" }).first().click();
    await page.getByRole("radio", { name: "분할 양도" }).first().click();
    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: /매수 행 추가/ }).click();
    }
    await fillAcqLot(page, 1, "2024-01-10", "8000", "10000");
    await fillAcqLot(page, 2, "2025-02-10", "8000", "12000");
    await fillAcqLot(page, 3, "2025-12-24", "4000", "5000");
    await selectCause(page, 2, "유상증자");
    await selectCause(page, 3, "무상증자 (의제배당 비과세분)");
    await expect(page.getByTestId("lot-bonus-untaxed-notice")).toContainText("자본조정");

    await page.getByRole("button", { name: /매도 행 추가/ }).click();
    const sale = trnCard(page, 1);
    await fillDate(sale, "2026-05-11");
    await sale.locator('[data-slot="field-card"]').filter({ hasText: "주식수" }).locator("input").first().fill("10000");
    await sale.locator(`div:has(> label:has-text('1주당 단가')) input[type="text"]`).first().fill("20000");
    await page.getByText("선입선출법", { exact: true }).click();
    await page.locator('[data-slot="field-card"]').filter({ hasText: "발행주식 총수" }).locator("input").first().fill("100000");

    // 비과세 무상주가 남아 있으면 2단계로 가지 못한다
    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByTestId("split-preview-acquisition-total")).toHaveCount(0);

    // 과세분으로 바꾸면(액면가 500) 진행 — 선입선출은 매수 #1·#2만 쓰므로 취득가액 104,000,000
    await selectCause(page, 3, "무상증자 (의제배당 과세분)");
    await expect(page.getByTestId("lot-bonus-untaxed-notice")).toHaveCount(0);
    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByTestId("split-preview-acquisition-total")).toHaveText("104,000,000");
  });
});
