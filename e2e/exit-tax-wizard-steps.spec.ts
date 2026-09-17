/**
 * E2E: 국외전출세(§118의9) 마법사 — **단계 배치**와 계산 도달
 *
 * 계획서: `docs/00-pm/exit-tax-wizard-step-realign.plan.md` Q-3
 *
 * 🔴 **이 트랙의 첫 E2E 다.** 종전에는 국외전출세 spec 이 0건이라, 단계 이동이 실제 브라우저에서
 *   도는지 확인할 방법이 없었다(계획서 §7 — 안전망 0).
 *
 * 고정하는 것:
 *   ET-E1 단계 배치 — 보유 종목은 2단계 · 실양도·외국납부세액은 3단계 · 국내 금액칸 부재
 *   ET-E2 게이트 위치 — 종목 0건이면 **2단계에서** 막힌다(그 화면에 「+ 종목 추가」가 있다)
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

/** Step1 — 거주자 요건 · 출국일 · 대주주 */
async function fillStep1(page: Page) {
  await page.getByPlaceholder("종목명을 입력하세요").fill("전출 케이스");
  await page.getByRole("radio", { name: "국외전출세 (§118의9)" }).first().click();

  await fillByLabel(page, "출국일 전 10년 중 국내 거주 연수", "10");
  // 출국일 — 이 화면의 유일한 DateInput
  await page.locator('input[type="text"][aria-label="연도"]').nth(0).fill("2025");
  await page.locator('input[type="text"][aria-label="월"]').nth(0).fill("06");
  await page.locator('input[type="text"][aria-label="일"]').nth(0).fill("01");
  // 대주주 토글
  await page.getByText("직전 연도말 대주주 해당").first().click();
}

test.describe("국외전출세 마법사 단계 배치", () => {
  test("ET-E1: 보유 종목은 2단계 · 정산은 3단계 · 국내 금액칸 없음", async ({ page }) => {
    test.setTimeout(120_000);
    await gotoStockTransferTax(page);
    await fillStep1(page);

    // 1단계에 보유 종목 섹션이 **없다**
    await expect(page.getByText("보유 종목 — 간주양도 대상")).toHaveCount(0);

    // ── Step 2 ──
    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByText("보유 종목 — 간주양도 대상 (§178의9)")).toBeVisible({ timeout: 10_000 });
    // 국내 전용 금액칸이 뜨지 않는다 (종전에는 여기서 같은 금액을 또 입력하게 했다)
    await expect(page.getByText("양도가액 합계", { exact: true })).toHaveCount(0);

    // 종목 1건 입력
    await page.getByRole("button", { name: "+ 종목 추가" }).click();
    await page.getByPlaceholder("종목명 입력").first().fill("삼성전자");
    await page.getByPlaceholder("보유 주식수 (주)").first().fill("1000");
    await page.getByPlaceholder("1주당 취득가액").first().fill("50000");
    await page.locator('input[type="text"][aria-label="연도"]').nth(0).fill("2020");
    await page.locator('input[type="text"][aria-label="월"]').nth(0).fill("01");
    await page.locator('input[type="text"][aria-label="일"]').nth(0).fill("02");
    await page.getByPlaceholder("출국일 실제 거래가액 (주당)").first().fill("80000");

    // ── Step 3 ──
    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByText("실양도 정보 — 경정청구용")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("외국납부세액 있음 (§118의13)")).toBeVisible();
    await expect(page.getByText("보유현황 신고 (§118의15)")).toBeVisible();
    // 🔴 기본공제 안내는 §118의10④ — §103①2호가 아니다
    await expect(page.getByText(/§118의10④/)).toBeVisible();
    await expect(page.getByText("주식 등 그룹 기본공제 250만원 (§103①2호)")).toHaveCount(0);
    // 국내 필요경비 칸이 없다
    await expect(page.getByText("필요경비 합계", { exact: true })).toHaveCount(0);
  });

  test("ET-E2: 🔴 종목 0건은 **2단계에서** 막힌다 (추가 버튼이 있는 화면)", async ({ page }) => {
    test.setTimeout(120_000);
    await gotoStockTransferTax(page);
    await fillStep1(page);

    // 1단계는 통과한다 — 게이트가 여기 있으면 「+ 종목 추가」 없이 막혀 사용자가 풀 수 없다
    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByText("보유 종목 — 간주양도 대상 (§178의9)")).toBeVisible({ timeout: 10_000 });

    // 2단계에서 종목 없이 「다음」 → 막힌다 + 같은 화면에 추가 수단이 있다
    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByText(/보유 종목을 최소 1건 입력하세요/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "+ 종목 추가" })).toBeVisible();
  });
});
