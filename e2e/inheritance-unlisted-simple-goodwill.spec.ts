/**
 * E2E: 비상장주식 간편평가(V1) — 영업권(§59②) 가산
 *
 * 계획: docs/00-pm/inheritance-unlisted-stock-simple-goodwill.plan.md §8
 * 설계: docs/02-design/features/inheritance-unlisted-stock-simple-goodwill.ui.design.md §11
 *
 * 시나리오 (이미지25 = PDF 사례5):
 *   GW-1: 영업권 양수 → ㉯ 영업권 평가액 + ㉱ 1주당 순자산가치(영업권 포함) 노출
 *   GW-2: ㉯ "▼ 산출근거" 펼침 → 가·나·다·마·초과이익·자 6줄 노출
 *   GW-3: 순자산 hint "영업권 포함 전"
 *   GW-4: 순손익 3년 입력 시 sky 안내 박스 노출
 *   GW-5: 3년 모두 적자 → amber 통합 "영업권 미가산 (§55③ 3호)"
 *
 * 정책: [[feedback_browser_verify_with_playwright]]
 */

import { test, expect, type Page } from "@playwright/test";

async function gotoStep0AndFillDeathDate(page: Page, year: string, month: string, day: string) {
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill(year);
  await page.getByLabel("월").first().fill(month);
  await page.getByLabel("일").first().fill(day);
  await page.getByRole("button", { name: /상속인 추가/ }).click();
  await page.getByText("자녀", { exact: true }).click();
  await page.getByRole("button", { name: /^다음/ }).click();
}

async function openUnlistedV1SimpleCard(page: Page) {
  await page.getByRole("button", { name: /주식·지분 추가/ }).click();
  await page.getByText("비상장주식", { exact: true }).click();
}

// FieldCard 구조: getByText(라벨) → label span → xpath ../.. = field-card div → input
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

/** 이미지25 사례 입력 (영업권 양수) */
async function fillCase25(page: Page) {
  await inputByLabel(page, /총 발행주식 수/).fill("20000");
  await inputByLabel(page, /피상속인·수증자 보유 주식 수/).fill("10000");
  await netIncomeInput(page, 1).fill("23500000");
  await netIncomeInput(page, 2).fill("40000000");
  await netIncomeInput(page, 3).fill("22000000");
  await inputByLabel(page, /순자산가치 \(회사 전체/).fill("60000000");
  await page.keyboard.press("Tab");
}

test.describe("비상장 간편: 영업권(§59②) 가산", () => {
  test("GW-1: 영업권 양수 → ㉯ 영업권·㉱ 1주당 순자산(영업권 포함) 노출", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep0AndFillDeathDate(page, "2026", "5", "15");
    await openUnlistedV1SimpleCard(page);
    await fillCase25(page);

    await expect(page.getByRole("button", { name: /㉯ 영업권 평가액 \(§59②\)/ })).toBeVisible();
    await expect(page.getByText("31,747,839").first()).toBeVisible();
    await expect(page.getByText(/㉱ 1주당 순자산가치 \(영업권 포함\)/)).toBeVisible();
    await expect(page.getByText("4,587", { exact: true }).first()).toBeVisible();
  });

  test("GW-2: ▼ 산출근거 펼침 → 6줄 노출", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep0AndFillDeathDate(page, "2026", "5", "15");
    await openUnlistedV1SimpleCard(page);
    await fillCase25(page);

    await page.getByRole("button", { name: /산출근거/ }).click();
    await expect(page.getByText(/가\. 최근 3년 가중평균 순손익액/)).toBeVisible();
    await expect(page.getByText(/나\. 가 × 50%/)).toBeVisible();
    await expect(page.getByText(/다\. 자기자본/)).toBeVisible();
    await expect(page.getByText(/마\. 다 × 이자율\(10%\)/)).toBeVisible();
    await expect(page.getByText(/초과이익 \(나 − 마/)).toBeVisible();
    await expect(page.getByText(/자\. 영업권 = 초과이익 × 5년 연금현가/)).toBeVisible();
  });

  test("GW-3: 순자산 hint — 영업권 포함 전", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep0AndFillDeathDate(page, "2026", "5", "15");
    await openUnlistedV1SimpleCard(page);

    await expect(page.getByText(/영업권 포함 전 자기자본/)).toBeVisible();
  });

  test("GW-4: 순손익 3년 입력 → sky 영업권 안내 박스", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep0AndFillDeathDate(page, "2026", "5", "15");
    await openUnlistedV1SimpleCard(page);
    await fillCase25(page);

    await expect(
      page.getByText(/입력한 순자산은.*영업권 포함 전.*금액입니다/),
    ).toBeVisible();
  });

  test("GW-5: 3년 모두 적자 → §55③ 3호 영업권 미가산 amber", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep0AndFillDeathDate(page, "2026", "5", "15");
    await openUnlistedV1SimpleCard(page);
    await inputByLabel(page, /총 발행주식 수/).fill("20000");
    await inputByLabel(page, /피상속인·수증자 보유 주식 수/).fill("10000");
    await netIncomeInput(page, 1).fill("-1000000");
    await netIncomeInput(page, 2).fill("-500000");
    await netIncomeInput(page, 3).fill("-200000");
    await inputByLabel(page, /순자산가치 \(회사 전체/).fill("100000000");
    await page.keyboard.press("Tab");

    await expect(page.getByText(/영업권 미가산 \(§55③ 3호\)/)).toBeVisible();
  });
});
