/**
 * E2E: 국외주식·국외전출세 결과 화면 — **출력 항목 선택 패널**
 *
 * 제보 —「인쇄 항목 선택 패널 부재 - 진행해」
 *
 * ## 종전 상태
 *
 * 패널은 `StockTransferTaxResultView`(국내·다종목) 안에만 있었다. 국외 두 트랙은 `Step4`가
 * 전용 카드로 직접 분기하므로 패널을 **한 번도 렌더하지 않았고**, 인쇄하면 화면 전체가 그대로
 * 나갔다(선택 불가).
 *
 * 🔑 판정은 **`print:hidden` 클래스**로 한다. 화면 표시는 선택과 **무관**하게 불변이므로
 *   (설계 §1.2 — 미선택도 화면엔 보인다) `toBeVisible`로는 인쇄 대상 여부가 증명되지 않는다.
 *
 * ⚠️ 선택은 기본이 **전체 미선택**이다 — 먼저 「전체 선택」을 눌러야 인쇄 대상이 생긴다
 *   (memory `feedback_print_media_needs_section_selection`).
 */

import { test, expect, type Page } from "@playwright/test";

async function fillByLabel(page: Page, label: string, value: string) {
  await page
    .locator(`div:has(> label:has-text('${label}')) input[type="text"]`)
    .first()
    .fill(value);
}

async function resetAndStart(page: Page) {
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => sessionStorage.clear());
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  await page.getByPlaceholder("종목명을 입력하세요").waitFor({ state: "visible", timeout: 30_000 });
}

/** 국외주식 — 결과까지 */
async function reachForeignStockResult(page: Page) {
  await resetAndStart(page);
  await page.getByPlaceholder("종목명을 입력하세요").fill("FX Corp");
  await page.getByRole("radio", { name: "해외주식" }).first().click();
  await fillByLabel(page, "국내 거주 연수", "10");
  const y = page.locator('input[type="text"][aria-label="연도"]');
  const m = page.locator('input[type="text"][aria-label="월"]');
  const d = page.locator('input[type="text"][aria-label="일"]');
  await y.nth(0).fill("2021"); await m.nth(0).fill("03"); await d.nth(0).fill("15");
  await y.nth(1).fill("2025"); await m.nth(1).fill("09"); await d.nth(1).fill("30");
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
  await page.getByRole("button", { name: "결과 보기" }).click();
}

/** 국외전출세 — 결과까지 */
async function reachExitTaxResult(page: Page) {
  await resetAndStart(page);
  await page.getByPlaceholder("종목명을 입력하세요").fill("전출 케이스");
  await page.getByRole("radio", { name: "국외전출세 (§118의9)" }).first().click();
  await fillByLabel(page, "출국일 전 10년 중 국내 거주 연수", "10");
  await page.locator('input[type="text"][aria-label="연도"]').nth(0).fill("2025");
  await page.locator('input[type="text"][aria-label="월"]').nth(0).fill("06");
  await page.locator('input[type="text"][aria-label="일"]').nth(0).fill("01");
  await page.getByText("직전 연도말 대주주 해당").first().click();

  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByText("보유 종목 — 간주양도 대상 (§178의9)")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "+ 종목 추가" }).click();
  await page.getByPlaceholder("종목명 입력").first().fill("삼성전자");
  await page.getByPlaceholder("보유 주식수 (주)").first().fill("1000");
  await page.getByPlaceholder("1주당 취득가액").first().fill("50000");
  await page.locator('input[type="text"][aria-label="연도"]').nth(0).fill("2020");
  await page.locator('input[type="text"][aria-label="월"]').nth(0).fill("01");
  await page.locator('input[type="text"][aria-label="일"]').nth(0).fill("02");
  await page.getByPlaceholder("출국일 실제 거래가액 (주당)").first().fill("80000");

  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByText("실양도 정보 — 경정청구용")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "결과 보기" }).click();
}

const printId = (id: string) => `[data-print-id="${id}"]`;

test.describe("국외 트랙 — 출력 항목 선택", () => {
  test("PS-1: 국외주식 — 패널이 있고, 전체 선택하면 두 섹션이 인쇄 대상이 된다", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await reachForeignStockResult(page);

    await expect(page.getByText("출력 항목 선택")).toBeVisible({ timeout: 60_000 });

    // 기본은 전체 미선택 — 인쇄 대상이 하나도 없다
    await expect(page.locator(printId("filing-form"))).toHaveClass(/print:hidden/);
    await expect(page.locator(printId("calculation"))).toHaveClass(/print:hidden/);

    await page.getByRole("button", { name: "전체 선택" }).first().click();
    await expect(page.locator(printId("filing-form"))).not.toHaveClass(/print:hidden/);
    await expect(page.locator(printId("calculation"))).not.toHaveClass(/print:hidden/);
  });

  test("PS-2: 국외주식 — 신고서만 고르면 결과 카드는 인쇄에서 빠진다", async ({ page }) => {
    test.setTimeout(180_000);
    await reachForeignStockResult(page);
    await expect(page.getByText("출력 항목 선택")).toBeVisible({ timeout: 60_000 });

    await page.getByRole("checkbox", { name: /주식 신고서 양식 표/ }).first().check();

    await expect(page.locator(printId("filing-form"))).not.toHaveClass(/print:hidden/);
    // 🔑 화면에는 그대로 보인다 — 선택은 **인쇄 대상만** 제어한다(설계 §1.2)
    await expect(page.locator(printId("calculation"))).toBeVisible();
    await expect(page.locator(printId("calculation"))).toHaveClass(/print:hidden/);
  });

  test("PS-3: 국외전출세 — 보유현황 신고서가 **별도 항목**으로 고를 수 있다", async ({ page }) => {
    test.setTimeout(180_000);
    await reachExitTaxResult(page);
    await expect(page.getByText("출력 항목 선택")).toBeVisible({ timeout: 60_000 });

    // 별지 제104호서식은 별지 제84호서식과 **다른 서식**이라 따로 선택된다
    await page.getByRole("checkbox", { name: /국외전출자 보유현황 신고서/ }).first().check();

    await expect(page.locator(printId("exit-holding-report"))).not.toHaveClass(/print:hidden/);
    await expect(page.locator(printId("filing-form"))).toHaveClass(/print:hidden/);
  });

  test("PS-4: 국외주식 화면에는 보유현황 신고서 항목이 **없다** (거짓 선택 방지)", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await reachForeignStockResult(page);
    await expect(page.getByText("출력 항목 선택")).toBeVisible({ timeout: 60_000 });

    // 국외전출세 전용 서식이라 이 화면에 데이터가 없다 — 고를 수 있으면 「선택했는데
    // 아무것도 안 나오는」 거짓 선택이 된다.
    await expect(page.getByText("국외전출자 보유현황 신고서 (별지 제104호서식)")).toHaveCount(0);
  });
});
