/**
 * E2E: 국외전출세 — **2026 이전 출국 회귀 기준선** (2027.1.1. 개정 대응 U0 · X-1)
 *
 * 계획서: `docs/02-design/features/stock-transfer-exit-tax-2027.ui.plan.md` §8.1 X-1
 *
 * ## 왜
 *
 * 2027.1.1. 이후 출국분에 국외주식(§94①3다)·§118의11 1호/2호 세율이 추가된다. 그 era 분기가
 * 들어가도 **2026.12.31. 이전 출국은 화면·세액이 종전 그대로**여야 한다(D-2 — 새 요소는 era에서만 마운트).
 * 이 spec은 개정 전 화면의 기준선이다 — U1 이후에도 **수정 없이 통과**해야 한다.
 *
 * ## 시료 (교재 사례 갑 — `exit-tax-textbook-departure-2026.anchor.test.ts`)
 *
 * 코스닥 A · 취득 10,000 × 10,000주 = 100,000,000 · 출국일 시가 50,000 × 10,000주 = 500,000,000
 * → 양도차익 400,000,000 − 기본공제 2,500,000 = 과세표준 397,500,000 · 산출세액 84,375,000.
 * 실제 양도(2027.3.1., 450,000,000) → 조정공제 (500,000,000 − 450,000,000) × 25% = 12,500,000.
 *
 * ## 한계 (실측 2026-11-27)
 *
 * 교재의 외국납부세액 30,000,000(→ 납부 41,875,000)은 **화면으로 넣을 수 없다**. 3단계
 * 「외국납부세액 있음」 ToggleCard는 `checked = !!etForeignTaxPaid`인데 `onCheckedChange(true)`가
 * 아무것도 하지 않아, 켜도 입력칸(자식)이 마운트되지 않는다. 그래서 외국납부 경로는 엔진 anchor
 * (`exit-tax-textbook-departure-2026.anchor.test.ts`)가 맡고, 여기서는 **실양도 → 조정공제**까지 본다.
 */

import { test, expect, type Page } from "@playwright/test";

async function fillByLabel(page: Page, label: string, value: string) {
  await page
    .locator(`div:has(> label:has-text('${label}')) input[type="text"]`)
    .first()
    .fill(value);
}

/** 연/월/일 aria-label 입력 — `nth`번째 DateInput */
async function fillDate(page: Page, nth: number, y: string, m: string, d: string) {
  await page.locator('input[type="text"][aria-label="연도"]').nth(nth).fill(y);
  await page.locator('input[type="text"][aria-label="월"]').nth(nth).fill(m);
  await page.locator('input[type="text"][aria-label="일"]').nth(nth).fill(d);
}

/** 보유 종목 카드의 시장 버튼 4개 그리드 */
const MARKET_BUTTONS = 'div:has(> label:text-is("시장")) button';

/** 세션을 비우고 마법사를 hydration까지 기다려 연다 */
async function openWizard(page: Page) {
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => sessionStorage.clear());
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  await page.getByPlaceholder("종목명을 입력하세요").waitFor({ state: "visible", timeout: 60_000 });
}

/** 1단계(국외전출세 · 거주 10년 · 출국일 · 대주주) → 2단계 진입 + 「+ 종목 추가」 */
async function reachHoldingCard(page: Page, departure: [string, string, string]) {
  await openWizard(page);
  await page.getByPlaceholder("종목명을 입력하세요").fill("전출 케이스");
  await page.getByRole("radio", { name: "국외전출세 (§118의9)" }).first().click();
  await fillByLabel(page, "출국일 전 10년 중 국내 거주 연수", "10");
  await fillDate(page, 0, ...departure); // 이 화면의 유일한 DateInput
  await page.getByText("직전 연도말 대주주 해당").first().click();
  await page.getByRole("button", { name: /^다음/ }).click();

  await expect(page.getByText("보유 종목 — 간주양도 대상 (§178의9)")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "+ 종목 추가" }).click();
}

/**
 * 코스닥 A 1건을 채우고 3단계 → 결과.
 * `actual: true`면 3단계에서 실양도일(2027-03-01)·실양도 1주당 단가(45,000)를 넣는다.
 */
async function reachResult(page: Page, departure: [string, string, string], actual = false) {
  await reachHoldingCard(page, departure);
  await page.getByPlaceholder("종목명 입력").first().fill("코스닥 A");
  await page.locator(MARKET_BUTTONS, { hasText: "코스닥" }).click();
  await page.getByPlaceholder("보유 주식수 (주)").first().fill("10000");
  await page.getByPlaceholder("1주당 취득가액").first().fill("10000");
  await fillDate(page, 0, "2015", "01", "01"); // 취득일 — 이 단계의 유일한 DateInput
  await page.getByPlaceholder("출국일 실제 거래가액 (주당)").first().fill("50000");
  await page.getByRole("button", { name: /^다음/ }).click();

  await expect(page.getByText("실양도 정보 — 경정청구용")).toBeVisible({ timeout: 10_000 });
  if (actual) {
    await fillDate(page, 0, "2027", "03", "01"); // 실양도일 — 이 단계의 유일한 DateInput
    await page
      .locator(`div:has(> label:has-text('실양도 1주당 단가')) input[type="text"]`)
      .first()
      .fill("45000");
  }
  await page.getByRole("button", { name: "결과 보기" }).click();
  await expect(page.getByText("산출세액 계산 (§118의10~§118의11)")).toBeVisible({ timeout: 60_000 });
}

/** 결과 카드의 한 행 — 라벨 span과 같은 줄의 값까지 */
const rowOf = (page: Page, label: string) =>
  page.locator(`div.flex:has(> span:text-is("${label}"))`).first();

for (const [tag, departure] of [
  ["2026-09-01", ["2026", "09", "01"]],
  ["2026-12-31", ["2026", "12", "31"]],
] as const) {
  test.describe(`국외전출세 2026 이전 출국 회귀 — 출국일 ${tag}`, () => {
    test(`X1-A ${tag}: 시장 버튼 4개 · 국외주식 없음`, async ({ page }) => {
      test.setTimeout(180_000);
      await reachHoldingCard(page, [...departure]);

      const buttons = page.locator(MARKET_BUTTONS);
      await expect(buttons).toHaveCount(4);
      await expect(buttons).toHaveText(["코스피", "코스닥", "코넥스", "비상장"]);
      await expect(page.getByText("국외주식")).toHaveCount(0);
      await expect(page.getByText(/제외 사유|제외 판정/)).toHaveCount(0);
    });

    test(`X1-B ${tag}: 결과 — 산출세액 84,375,000 · 현행 세율 문구 · 호별 줄 없음`, async ({ page }) => {
      test.setTimeout(180_000);
      await reachResult(page, [...departure]);

      await expect(rowOf(page, "합산 양도차익 (전 종목 양도차익 합계)")).toContainText("400,000,000");
      await expect(rowOf(page, "과세표준 = 양도차익 − 기본공제")).toContainText("397,500,000");
      await expect(rowOf(page, "산출세액 = 과세표준 × 세율 − 누진공제")).toContainText("84,375,000");
      // 현행 단일 누진 세율 문구 — 2027 개정 전에는 호별(1호/2호) 줄이 없다
      await expect(page.getByText(/과세표준 3억 이하 20%, 초과분 25%/).first()).toBeVisible();
      await expect(page.getByText(/2호 가목|2호 나목|호별/)).toHaveCount(0);
      // 보유현황 서식(제104호)의 안내문은 「국외주식등」을 이미 언급한다 — 시장 라벨만 exact로 본다
      await expect(page.getByText("국외주식", { exact: true })).toHaveCount(0);
    });
  });
}

test("X1-C 2026-09-01: 실양도 450,000,000 → 조정공제 12,500,000 · 경정 후 최종세액 71,875,000", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await reachResult(page, ["2026", "09", "01"], true);

  await expect(rowOf(page, "산출세액 = 과세표준 × 세율 − 누진공제")).toContainText("84,375,000");
  await expect(
    page.locator('div.flex:has(> span:text-matches("^조정공제 \\\\(§118의12\\\\)"))').first(),
  ).toContainText("12,500,000");
  // 84,375,000 − 12,500,000 − 외국납부세액공제 0
  await expect(
    page.locator('div.flex:has(> span:text-matches("^경정 후 최종세액"))').first(),
  ).toContainText("71,875,000");
});
