/**
 * E2E: 영리법인 사전증여 ⑩a 상속인외 증여세 산출세액 — 자동표시 + 라벨 (2026-05-31)
 *
 * 계획서: docs/00-pm/inheritance-prior-gift-corporate-tax-empty-fix.plan.md
 * 정책: [[feedback_browser_verify_with_playwright]] — spec 통과로 브라우저 확인 충족
 *
 * 버그(이미지30): 영리법인 수증자 + 증여재산가액 700m 입력했으나 §3의2② 산출세액 상당액 빈칸.
 * 원인(probe 실증): cgct=0 store 잔재가 fallback(=== undefined)·표시 3곳을 통과 못 함.
 * 수정: fallback 조건 `undefined || <= 0` 확장 + 라벨 "⑩a 상속인외 증여세 산출세액".
 *
 * 시나리오:
 *  CG-1: 가액 700m → 영리법인 수증자 선택 → ⑩a 라벨 + 세액란 150,000,000 표시
 *  CG-2: 영리법인 수증자 먼저 선택(가액 0) → 가액 700m 입력 → 150,000,000 (cgct=0 잔재 없음 — 발생경로 차단)
 */

import { test, expect, type Page } from "@playwright/test";

/** Step0: 상속개시일 + 자녀 1 + 영리법인 1 → Step1 이동 */
async function gotoStep0WithChildAndCorporate(page: Page) {
  await page.goto("/calc/inheritance-tax");

  // 상속개시일 2024-06-10
  await page.getByLabel("연도").first().fill("2024");
  await page.getByLabel("월").first().fill("6");
  await page.getByLabel("일").first().fill("10");

  // 상속인 추가 패널 열기 → 자녀 (추가 시 패널 자동 닫힘 — handleAdd setShowAddPanel(false))
  await page.getByRole("button", { name: /상속인 추가/ }).click();
  await page.getByText("자녀", { exact: true }).click();

  // 영리법인 추가 — 패널 재오픈 후 SPECIAL_RELATIONS "법인" 버튼
  await page.getByRole("button", { name: /상속인 추가/ }).click();
  await page.getByText("법인", { exact: true }).click();

  // Step1(상속재산)으로 이동
  await page.getByRole("button", { name: /^다음/ }).click();
}

/** Step1: 토지 자산 3억 + Step3(사전증여)까지 이동 */
async function addLandAndGotoStep3(page: Page) {
  await page.getByRole("button", { name: /상속재산 추가/ }).click();
  await page.getByRole("button", { name: /토지/ }).first().click();
  await page.getByPlaceholder("면적 입력").fill("300");
  await page.getByPlaceholder("공시지가 단가").fill("1000000");
  // Step2(비과세) → Step3(사전증여)
  await page.getByRole("button", { name: /^다음/ }).click();
  await page.getByRole("button", { name: /^다음/ }).click();
}

/** ⑩a 세액란 input locator — CurrencyInput wrapper(div.space-y-1.5) 중 ⑩a 라벨 포함 */
function corpTaxInput(page: Page) {
  return page
    .locator("div.space-y-1\\.5")
    .filter({ hasText: "⑩a 상속인외 증여세 산출세액" })
    .locator("input");
}

// 콤마 유무 허용 (focus 시 raw "150000000" / blur 시 "150,000,000")
const TAX_150M = /^150,?000,?000$/;

test.describe("영리법인 사전증여 ⑩a 산출세액 자동표시", () => {
  test("CG-1: 가액 700m → 영리법인 수증자 선택 → ⑩a 150,000,000 표시", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await gotoStep0WithChildAndCorporate(page);
    await addLandAndGotoStep3(page);

    // 사전증여 1건 추가
    await page.getByRole("button", { name: /사전증여 추가/ }).click();
    const giftCard = page.locator(".border.rounded-lg.p-4").last();

    // 증여일 2021-08-10
    await giftCard.getByLabel("연도").fill("2021");
    await giftCard.getByLabel("월").fill("8");
    await giftCard.getByLabel("일").fill("10");

    // 증여재산가액 700m 먼저 입력
    const amountInput = giftCard.getByPlaceholder("금액 입력").first();
    await amountInput.fill("700000000");
    await amountInput.press("Tab");

    // 수증자 select → 영리법인 (옵션: [선택안함, 자녀, 법인] → index 2)
    const doneeSelect = giftCard.getByTestId("gift-donee-select");
    await expect(doneeSelect).toBeVisible({ timeout: 5_000 });
    await doneeSelect.selectOption({ index: 2 });

    // ⑩a 라벨 노출 확인
    await expect(
      giftCard.getByText("⑩a 상속인외 증여세 산출세액"),
    ).toBeVisible();

    // 세액란 150,000,000 자동표시
    await expect(corpTaxInput(page)).toHaveValue(TAX_150M);
  });

  test("CG-2: 영리법인 먼저 선택(가액0) → 가액 700m 입력 → 150,000,000 (cgct=0 잔재 차단)", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await gotoStep0WithChildAndCorporate(page);
    await addLandAndGotoStep3(page);

    await page.getByRole("button", { name: /사전증여 추가/ }).click();
    const giftCard = page.locator(".border.rounded-lg.p-4").last();

    await giftCard.getByLabel("연도").fill("2021");
    await giftCard.getByLabel("월").fill("8");
    await giftCard.getByLabel("일").fill("10");

    // 가액 입력 전 영리법인 수증자 먼저 선택 (computeTaxPatch 가액0 → cgct undefined, 0 잔재 방지)
    const doneeSelect = giftCard.getByTestId("gift-donee-select");
    await expect(doneeSelect).toBeVisible({ timeout: 5_000 });
    await doneeSelect.selectOption({ index: 2 });

    // 그 다음 증여재산가액 700m 입력 → handleGiftAmountChange가 150m 재계산
    const amountInput = giftCard.getByPlaceholder("금액 입력").first();
    await amountInput.fill("700000000");
    await amountInput.press("Tab");

    await expect(corpTaxInput(page)).toHaveValue(TAX_150M);
  });
});
