/**
 * E2E: §165⑤ 환산비율 분자·분모 80% 하한(§165④1 단서) — 프리뷰 표시
 *
 * 엔진 anchor는 `__tests__/tax-engine/stock-transfer/post-listing-165-5-floor80.anchor.test.ts`
 * (PLF-1~PLF-6)가 담당한다. 여기서 지키는 것은 **화면의 산수가 맞는가**다.
 *
 * ⚠️ 하한이 걸리면 가중평균과 최종 평가액이 갈린다. 산식 한 줄만 그리면
 *    「50×3/5 + 200×2/5 = 160」 처럼 **눈에 보이는 계산이 틀린 화면**이 된다.
 *    ⇒ 가중평균(110)과 하한 적용(160)을 **두 줄**로 나눠 그려야 한다.
 *
 *   F-1: 하한 발동 → 가중평균 줄 + 「순자산가치 × 80%」 줄이 함께 뜬다
 *   F-2: 하한 미발동 → 하한 줄이 뜨지 않는다 (F-1의 음성 대조군)
 *
 * 정책: [[feedback_browser_verify_with_playwright]] · [[feedback_negative_assertion_needs_mutation_probe]]
 */

import { test, expect, type Page } from "@playwright/test";

const FLOOR_HINT = /소득세법 시행령 §165④1 단서/;

async function gotoStockTransferTax(page: Page) {
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => sessionStorage.clear());
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  await page.getByPlaceholder("종목명을 입력하세요").waitFor({ state: "visible", timeout: 30_000 });
}

async function fillByLabel(page: Page, label: string, value: string) {
  await page.locator(`div:has(> label:has-text('${label}')) input[type="text"]`).first().fill(value);
}

/** Step1 — 코스닥 · 취득 2018-03-15 / 양도 2025-02-26(하한 연혁 안) */
async function fillStep1(page: Page) {
  await page.getByPlaceholder("종목명을 입력하세요").fill("하한검증주식");
  await page.getByRole("radio", { name: "코스닥" }).first().click();

  const y = page.locator('input[type="text"][aria-label="연도"]');
  const m = page.locator('input[type="text"][aria-label="월"]');
  const d = page.locator('input[type="text"][aria-label="일"]');
  await y.nth(0).fill("2018");
  await m.nth(0).fill("03");
  await d.nth(0).fill("15");
  await y.nth(1).fill("2025");
  await m.nth(1).fill("02");
  await d.nth(1).fill("26");

  await page.locator('[data-slot="field-card"]').filter({ hasText: "양도 주식수" }).locator("input").first().fill("1000");
  await page.locator('[data-slot="field-card"]').filter({ hasText: "발행주식 총수" }).locator("input").first().fill("100000");
}

/** Step2 진입 → 환산취득가 → 취득 후 상장 ON → simple 모드 4필드 입력 */
async function fillStep2(
  page: Page,
  v: { listingNI: string; listingNA: string; acqNI: string; acqNA: string },
) {
  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByText("양도·취득가액").first()).toBeVisible({ timeout: 10_000 });
  await fillByLabel(page, "양도가액 합계", "44750000");
  await page.getByRole("radio", { name: "환산취득가" }).first().click();

  await page
    .locator('[data-slot="toggle-card"]')
    .filter({ hasText: "취득 후 상장" })
    .getByRole("switch")
    .first()
    .click();

  // ⚠️ `div:has(> label:has-text(...))`는 「양도일 이전 1개월 종가평균」을 잘못 잡는다
  //    (부분일치라 인접 안내 문구까지 걸린다). 접근성 이름 exact로 고정한다.
  const box = (name: string) => page.getByRole("textbox", { name, exact: true });
  await box("상장일 이후 1개월 종가평균").fill("10000");
  await box("상장일 직전 사업연도 1주당 순손익가치").fill(v.listingNI);
  await box("상장일 직전 사업연도 1주당 순자산가치").fill(v.listingNA);
  await box("취득일 직전 사업연도 1주당 순손익가치").fill(v.acqNI);
  await box("취득일 직전 사업연도 1주당 순자산가치").fill(v.acqNA);
}

test.describe("§165⑤ 환산 분자·분모 80% 하한 — 프리뷰", () => {
  test("F-1: 하한 발동 → 가중평균 110과 하한 160이 두 줄로 나뉘어 보인다", async ({ page }) => {
    test.setTimeout(120_000);
    await gotoStockTransferTax(page);
    await fillStep1(page);
    // 상장연도 순손익 50 / 순자산 200 → 가중평균 110, 하한 200×80% = 160
    await fillStep2(page, { listingNI: "50", listingNA: "200", acqNI: "100", acqNA: "100" });

    const preview = page.locator("div").filter({ hasText: "환산취득가 미리보기" }).last();
    // [2] 가중평균 줄은 **110** 그대로 (산식과 결과가 일치해야 한다)
    await expect(preview.getByText(/50×3\/5 \+ 200×2\/5 =/)).toBeVisible({ timeout: 10_000 });
    await expect(preview.getByText(/순자산가치 200 × 80% =/)).toBeVisible();
    await expect(preview.getByText(FLOOR_HINT)).toBeVisible();
    // 환산비율은 하한 적용 후 값으로 계산된다 — 100 ÷ 160 = 0.625
    await expect(preview.getByText(/환산비율 = 100 ÷ 160/)).toBeVisible();
  });

  test("F-2: 하한 미발동 → 하한 줄이 없다 (F-1의 음성 대조군)", async ({ page }) => {
    test.setTimeout(120_000);
    await gotoStockTransferTax(page);
    await fillStep1(page);
    // ⚠️ 이 케이스가 없으면 F-1의 문구가 **항상** 떠도 통과한다.
    // 상장 순손익 300 / 순자산 100 → 220 · 취득 순손익 200 / 순자산 100 → 160
    // (하한은 둘 다 80이라 미발동. 상장≠취득으로 두어 산식 문구 중복 매칭도 피한다.)
    await fillStep2(page, { listingNI: "300", listingNA: "100", acqNI: "200", acqNA: "100" });

    const preview = page.locator("div").filter({ hasText: "환산취득가 미리보기" }).last();
    await expect(preview.getByText(/300×3\/5 \+ 100×2\/5 =/)).toBeVisible({ timeout: 10_000 });
    await expect(preview.getByText(/200×3\/5 \+ 100×2\/5 =/)).toBeVisible();
    await expect(preview.getByText(FLOOR_HINT)).toHaveCount(0);
    await expect(preview.getByText(/환산비율 = 160 ÷ 220/)).toBeVisible();
  });
});
