/**
 * E2E: 비상장주식 간편평가(V1) 입력 폼 리스타일 — 시각 구조 검증
 *
 * 계획: docs/00-pm/inheritance-unlisted-stock-simple-input-redesign.plan.md §9
 *
 * R-1: 섹션 번호 원 1·2·3 렌더
 * R-2~4: sky/emerald/violet 섹션 카드 존재
 * R-5: 각 섹션 입력이 FieldCard(data-slot)로 래핑 (raw 플랫 input 제거)
 * R-6: UnlistedStockPreview(㉱·㉮) 보존 — 리스타일 후에도 동작
 *
 * 정책: [[feedback_browser_verify_with_playwright]]
 */

import { test, expect, type Page } from "@playwright/test";

async function gotoStep0AndFillDeathDate(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill("2026");
  await page.getByLabel("월").first().fill("5");
  await page.getByLabel("일").first().fill("15");
  await page.getByRole("button", { name: /상속인 추가/ }).click();
  await page.getByText("자녀", { exact: true }).click();
  await page.getByRole("button", { name: /^다음/ }).click();
}

async function openUnlistedV1SimpleCard(page: Page) {
  await page.getByRole("button", { name: /주식·지분 추가/ }).click();
  await page.getByText("비상장주식", { exact: true }).click();
}

function inputByLabel(page: Page, label: RegExp) {
  return page.getByText(label).locator("xpath=../..").locator("input").first();
}
function netIncomeInput(page: Page, nth: 1 | 2 | 3) {
  return page
    .getByText(new RegExp(`직전 ${nth}사업연도 순손익액`))
    .locator("xpath=../..")
    .locator("input")
    .first();
}

test.describe("비상장 간편: 입력 폼 리스타일 시각 구조", () => {
  test("R-1: 섹션 번호 원 1·2·3 렌더", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep0AndFillDeathDate(page);
    await openUnlistedV1SimpleCard(page);

    await expect(page.getByTestId("simple-section-num-1")).toBeVisible();
    await expect(page.getByTestId("simple-section-num-2")).toBeVisible();
    await expect(page.getByTestId("simple-section-num-3")).toBeVisible();
  });

  test("R-2~4: sky·emerald·violet 섹션 카드 존재", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep0AndFillDeathDate(page);
    await openUnlistedV1SimpleCard(page);

    await expect(page.getByTestId("simple-section-shares")).toBeVisible();
    await expect(page.getByTestId("simple-section-net-income")).toBeVisible();
    await expect(page.getByTestId("simple-section-net-asset")).toBeVisible();
  });

  test("R-5: ① 평가대상 섹션의 입력이 FieldCard로 래핑 (회사명·총발행·보유 3건)", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep0AndFillDeathDate(page);
    await openUnlistedV1SimpleCard(page);

    const cards = page.locator('[data-testid="simple-section-shares"] [data-slot="field-card"]');
    await expect(cards).toHaveCount(3);
    // 라벨 확대/입력 축소 그리드(twMerge override) 적용 — 기본 [160px_1fr]가 [3fr_2fr]로 치환
    await expect(cards.first()).toHaveClass(/grid-cols-\[3fr_2fr\]/);
    await expect(cards.first()).not.toHaveClass(/grid-cols-\[160px_1fr\]/);
  });

  test("R-6: 리스타일 후에도 미리보기(㉮·㉱) 보존", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep0AndFillDeathDate(page);
    await openUnlistedV1SimpleCard(page);

    await inputByLabel(page, /총 발행주식 수/).fill("20000");
    await inputByLabel(page, /피상속인·수증자 보유 주식 수/).fill("10000");
    await netIncomeInput(page, 1).fill("23500000");
    await netIncomeInput(page, 2).fill("40000000");
    await netIncomeInput(page, 3).fill("22000000");
    await inputByLabel(page, /순자산가치 \(회사 전체/).fill("60000000");
    await page.keyboard.press("Tab");

    await expect(page.getByText(/㉮ 영업권 포함 전 순자산가액/)).toBeVisible();
    await expect(page.getByText(/㉱ 1주당 순자산가치 \(영업권 포함\)/)).toBeVisible();
    // 섹션 카드 구조도 유지
    await expect(page.getByTestId("simple-section-num-1")).toBeVisible();
  });

  test("R-7: 사업연도 연도가 상속개시일 기준 계산 표시 (2026 → 2025·2024·2023년)", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep0AndFillDeathDate(page); // 상속개시일 2026-5-15
    await openUnlistedV1SimpleCard(page);

    // 직전 1·2·3 사업연도 = 평가기준일 연도(2026) − 1/−2/−3 (V2 buildDefaultFiscalYears 동일 로직)
    await expect(page.getByText("2025년", { exact: true })).toBeVisible();
    await expect(page.getByText("2024년", { exact: true })).toBeVisible();
    await expect(page.getByText("2023년", { exact: true })).toBeVisible();
    // 상대 표기 제거 확인
    await expect(page.getByText("상속개시일 -1년")).toHaveCount(0);
  });
});
