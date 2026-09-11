/**
 * E2E: 주식양도세 Step3 ② 기본공제 — **기타자산 그룹 게이트**
 *
 * 계획서: docs/00-pm/stock-basic-deduction-group-gate.plan.md §4-6
 *
 * ## 왜 E2E인가 — RTL이 못 보는 층
 *
 * RTL anchor(`__tests__/components/calc/stock-basic-deduction-gate.anchor.test.tsx`)는
 * Step3에 **폼 객체를 직접 주입**한다. 실제 결함은 그 앞에 있다 —
 * **Step1에서 고른 값이 Step2를 건너 Step3의 노출을 바꾸는가**. 특히 E-4(기타자산에서
 * 플래그를 켠 뒤 코스피로 되돌리는 §94② 경로)는 마법사를 실제로 걸어야 재현된다.
 *
 * E-1: 코스피 → 두 칸 비노출
 * E-2: 기타자산 → 필드 1만 노출 (필드 2는 9호 미해당이라 닫힘)
 * E-3: 기타자산 + nbl 60% → 두 칸 모두 노출
 * E-4: 기타자산에서 과점주주 ON → 코스피로 되돌림(§94② 발동) → 필드 1 노출
 *
 * 정책: [[feedback_browser_verify_with_playwright]] · [[feedback_negative_anchor_needs_positive_twin]]
 * 로케이터: CurrencyInput label은 htmlFor 미연결 → `div:has(> label:has-text(...))` 패턴
 *          (같은 파일의 형제 spec `stock-transfer-securities-tax.spec.ts`와 동일).
 */

import { test, expect, type Page } from "@playwright/test";

const FIELD_1 = "같은 해 부동산 그룹에서 이미 사용한 기본공제";
const FIELD_2 = "같은 해 양도한 부동산 중 비사업용 토지 과세표준";

async function gotoStockTransferTax(page: Page) {
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => sessionStorage.clear());
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  await page.getByPlaceholder("종목명을 입력하세요").waitFor({ state: "visible", timeout: 30_000 });
}

/** Step1 필수 입력(종목명·일자·주식수) — 시장 선택은 호출부가 먼저 한다. */
async function fillStep1Basics(page: Page, name: string) {
  await page.getByPlaceholder("종목명을 입력하세요").fill(name);

  const years = page.locator('input[type="text"][aria-label="연도"]');
  const months = page.locator('input[type="text"][aria-label="월"]');
  const days = page.locator('input[type="text"][aria-label="일"]');
  // nth(0) = 취득일(AcquisitionInfoBlock), nth(1) = 양도일
  await years.nth(0).fill("2015");
  await months.nth(0).fill("01");
  await days.nth(0).fill("15");
  await years.nth(1).fill("2026");
  await months.nth(1).fill("03");
  await days.nth(1).fill("10");

  await page
    .locator('[data-slot="field-card"]')
    .filter({ hasText: "양도 주식수" })
    .locator("input")
    .first()
    .fill("1000");
  await page
    .locator('[data-slot="field-card"]')
    .filter({ hasText: "발행주식 총수" })
    .locator("input")
    .first()
    .fill("100000");
}

/** 과점주주(§94①4 다목) 토글 ON — ToggleCard는 card-level locator로 잡는다. */
async function turnOnBlockShareholder(page: Page) {
  const sw = page
    .locator('[data-slot="toggle-card"]')
    .filter({ hasText: /과점주주/ })
    .getByRole("switch")
    .first();
  await sw.waitFor({ state: "visible", timeout: 10_000 });
  await sw.click();
}

/**
 * 비사업용토지 비율(%) 입력 — §104①9호 판정 축.
 *
 * ⚠️ `filter({hasText})`는 **바깥 FieldCard까지** 매칭한다(기타자산 블록 전체가 FieldCard다).
 *   `.first()`를 쓰면 ToggleCard의 숨은 checkbox가 잡혀 `Input of type "checkbox" cannot be
 *   filled`로 죽는다(실측). ⇒ **가장 안쪽 카드(`.last()`) + `input[type="text"]`**로 좁힌다.
 */
async function fillNblRatio(page: Page, percent: string) {
  await page
    .locator('[data-slot="field-card"]')
    .filter({ hasText: "자산총액 중 비사업용토지 가액 비율" })
    .last()
    .locator('input[type="text"]')
    .first()
    .fill(percent);
}

/** Step1 → Step2 → Step3. Step2는 금액만 채운다. */
async function goToStep3(page: Page) {
  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByText("양도·취득가액").first()).toBeVisible({ timeout: 10_000 });

  await page
    .locator("div:has(> label:has-text('양도가액 합계')) input")
    .first()
    .fill("500000000");
  await page
    .locator("div:has(> label:has-text('1주당 취득가액')) input")
    .first()
    .fill("100000");

  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByText("필요경비·신고").first()).toBeVisible({ timeout: 10_000 });
}

test.describe("Step3 ② 기본공제 — 기타자산 그룹 게이트", () => {
  test("E-1: 코스피 — 두 칸 모두 비노출 + 주식 그룹 안내", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoStockTransferTax(page);

    await page.getByRole("radio", { name: "코스피" }).first().click();
    await fillStep1Basics(page, "코스피종목");
    await goToStep3(page);

    // 섹션 자체는 있다 — 주식 그룹도 250만원을 받는다(자동).
    await expect(page.getByText("기본공제 (§103①)")).toBeVisible();
    await expect(page.getByText("주식 등 그룹 기본공제 250만원 (§103①2호)")).toBeVisible();
    await expect(page.getByText(FIELD_1)).toHaveCount(0);
    await expect(page.getByText(FIELD_2)).toHaveCount(0);
  });

  test("E-2: 기타자산 — 필드 1만 노출 (9호 미해당이라 필드 2는 닫힘)", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoStockTransferTax(page);

    await page.getByRole("radio", { name: "기타자산" }).first().click();
    await turnOnBlockShareholder(page);
    await fillStep1Basics(page, "기타자산종목");
    await goToStep3(page);

    await expect(page.getByText("부동산·기타자산 그룹 기본공제 250만원 (§103①1호)")).toBeVisible();
    await expect(page.getByText(FIELD_1)).toBeVisible();
    await expect(page.getByText(FIELD_2)).toHaveCount(0);
  });

  test("E-3: 기타자산 + 비사업용토지 60% — 두 칸 모두 노출", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoStockTransferTax(page);

    await page.getByRole("radio", { name: "기타자산" }).first().click();
    await turnOnBlockShareholder(page);
    await fillNblRatio(page, "60"); // §104①9호 임계 50% 이상
    await fillStep1Basics(page, "비사업용과다법인");
    await goToStep3(page);

    await expect(page.getByText(FIELD_1)).toBeVisible();
    await expect(page.getByText(FIELD_2)).toBeVisible();
  });

  test("E-4: 기타자산에서 플래그 ON → 코스피로 되돌림(§94② 발동) — 필드 1 노출", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await gotoStockTransferTax(page);

    // ① 기타자산으로 들어가 과점주주 플래그를 켠다
    await page.getByRole("radio", { name: "기타자산" }).first().click();
    await turnOnBlockShareholder(page);

    // ② 코스피로 되돌린다 — 플래그를 비우는 전환 patch가 없으므로 그대로 남는다.
    //    §94②(`stock-classification.ts:349`)가 3호+4호 동시충족을 4호로 몰아
    //    기본공제 그룹이 §103①1호가 된다 ⇒ 칸이 **열려 있어야** 한다.
    await page.getByRole("radio", { name: "코스피" }).first().click();
    await fillStep1Basics(page, "코스피과점주주");
    await goToStep3(page);

    await expect(page.getByText("부동산·기타자산 그룹 기본공제 250만원 (§103①1호)")).toBeVisible();
    await expect(page.getByText(FIELD_1)).toBeVisible();
  });
});
