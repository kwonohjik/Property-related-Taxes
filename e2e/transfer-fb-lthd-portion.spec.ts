/**
 * 가업상속공제 자산 §95④ 후단 장기보유특별공제 「부분별 양도차익」 — 화면 경로(UI 계획서 transfer-fb-lthd-portion-gain.ui.plan.md §7.3).
 *
 * 교재(이월과세5) 사례: 피상속인 2012.3.8. 토지 5억 취득 → 2022.4.10. 상속(시가 15억 · 가업상속공제적용률 70%) → 2026.10.15. 18억 양도 · 양도비 3천만.
 *   적용분 889,000,000 × 28% = 248,920,000 + 비적용분 81,000,000 × 8% = 6,480,000 → 장기보유특별공제 255,400,000 · 과세표준 712,100,000.
 *   (종전 앱: 970,000,000 × 22% = 213,400,000 · 과세표준 754,100,000)
 * 엔진·route anchor: `__tests__/tax-engine/transfer-tax/fb-lthd-slice-gain.anchor.test.ts` · `__tests__/api/transfer.route.fb-lthd-slice-gain.anchor.test.ts`
 * 사람이 브라우저로 직접 한 수동 확인은 아니다(headless Playwright). 워크트리는 `E2E_PORT=<포트> npx playwright test <spec>`.
 */
import { test, expect } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { calculate, seedWizard, singleSeed, stmtValue, formRow } from "./_helpers/split-acq-display";
import { expectNoPageHScroll } from "./_helpers/no-page-hscroll";
import { expectDarkContrast, expectLightContrast } from "./_helpers/dark-contrast";

const land = (over: Record<string, unknown> = {}) => ({
  ...makeDefaultAsset(1),
  addressJibun: "제주특별자치도 강남구 테스트동 1-1",
  assetKind: "land",
  acquisitionCause: "inheritance",
  acquisitionDate: "2022-04-10",
  inheritanceStartDate: "2022-04-10",
  fixedAcquisitionPrice: "1500000000",
  inheritanceAssetKind: "land",
  publishedValueAtInheritance: "1500000000",
  decedentAcquisitionDate: "2012-03-08",
  actualSalePrice: "1800000000",
  transferExpense: "30000000",
  familyBusinessInheritance: {
    decedentAcquisitionPrice: 500_000_000,
    inheritanceMarketValue: 1_500_000_000,
    fbDeductionAppliedRate: 0.7,
    inheritanceDate: "2022-04-10",
    fbRateBasis: { kind: "deduction_ratio", deductionAmount: 700_000_000, businessEstateValue: 1_000_000_000 },
  },
  ...over,
});

const seedOf = (over: Record<string, unknown> = {}) =>
  singleSeed([land(over)], { transferDate: "2026-10-15", filingDate: "2026-11-30", contractTotalPrice: "1800000000", householdHousingCount: "1" });

const cell = (page: import("@playwright/test").Page, id: string) => page.getByTestId(id).first();

test("FB-LTHD-E1: 교재 사례 — 부분별 표 · 장특 255,400,000 · 과세표준 712,100,000", async ({ page }) => {
  test.setTimeout(240_000);
  await seedWizard(page, seedOf());
  const body = await calculate(page);

  // 입력은 무변경 — 새 입력 필드 없음(⑫ stripping 대상 없음)
  expect(JSON.stringify(body)).toContain('"decedentAcquisitionDate"');
  expect(JSON.stringify(body)).toContain('"fbRateBasis":{"kind":"deduction_ratio","deductionAmount":700000000,"businessEstateValue":1000000000}');

  const table = page.getByTestId("fb-lthd-portion-table").first();
  await expect(table).toBeVisible();
  await expect(cell(page, "fb-lthd-applied-head")).toContainText("70.00%");
  await expect(cell(page, "fb-lthd-rest-head")).toContainText("30.00%");
  await expect(cell(page, "fb-lthd-applied-net")).toHaveText("1,239,000,000");
  await expect(cell(page, "fb-lthd-applied-term")).toHaveText("350,000,000");
  await expect(cell(page, "fb-lthd-applied-gain")).toHaveText("889,000,000");
  await expect(cell(page, "fb-lthd-rest-net")).toHaveText("531,000,000");
  await expect(cell(page, "fb-lthd-rest-term")).toHaveText("450,000,000");
  await expect(cell(page, "fb-lthd-rest-gain")).toHaveText("81,000,000");
  await expect(cell(page, "fb-lthd-applied-years")).toHaveText("14년");
  await expect(cell(page, "fb-lthd-rest-years")).toHaveText("4년");
  await expect(cell(page, "fb-lthd-applied-rate")).toHaveText("28%");
  await expect(cell(page, "fb-lthd-rest-rate")).toHaveText("8%");
  await expect(cell(page, "fb-lthd-applied-deduction")).toHaveText("248,920,000");
  await expect(cell(page, "fb-lthd-rest-deduction")).toHaveText("6,480,000");
  await expect(cell(page, "fb-lthd-gain-total")).toHaveText("970,000,000");
  await expect(cell(page, "fb-lthd-total")).toHaveText("255,400,000");
  // 가중 실효율(22%·26.3%)은 표에 없다
  await expect(table).not.toContainText("26.3");

  // 명세서 — 장특 값 · 계산 단계 문구 · 보유기간 보조
  expect(await stmtValue(page, "장기보유특별공제")).toBe(255_400_000);
  const row = page.locator('[data-statement-row="장기보유특별공제"]').first();
  const text = ((await row.evaluate((el) => el.textContent)) ?? "").replace(/\s+/g, " ");
  expect(text).toContain("889,000,000 × 28%");
  expect(text).toContain("81,000,000 × 8%");
  expect(text).not.toContain("× 22%");
  // 명세서 「일자·기간」 그룹은 화면에서 생략돼 있다(DetailedStatementConfig) — 부분별 보유기간은 장특 행 문구가 싣는다(UQ-6).
  expect(text).toContain("피상속인 취득일부터 14년");
  expect(text).toContain("상속개시일부터 4년");

  // 신고서 — 장특 · 과세표준 (행 라벨은 화면 그대로)
  expect((await formRow(page, "과세표준"))[1]).toContain("712,100,000");
});

test("FB-LTHD-E2: 375px 가로 넘침 없음 · 표 셀이 열 박스 안 · 라이트·다크 대비", async ({ page }) => {
  test.setTimeout(240_000);
  await seedWizard(page, seedOf());
  await calculate(page);
  const table = page.getByTestId("fb-lthd-portion-table").first();
  await table.scrollIntoViewIfNeeded();

  await expectNoPageHScroll(page, 375);
  await expect(table).toBeVisible();
  // 가장 긴 금액 칸(13자)이 셀 박스 안에 들어간다 — 셀 안쪽 폭(clientWidth)이 내용 폭(scrollWidth) 이상
  for (const id of ["fb-lthd-applied-net", "fb-lthd-applied-deduction", "fb-lthd-total"]) {
    const fits = await cell(page, id).evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
    expect(fits, `${id} 넘침`).toBe(true);
  }
  // 표가 카드 안쪽에서 잘리지 않는다
  const overflow = await table.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  await expectLightContrast(page, table);
  await expectDarkContrast(page, table);
});

test("FB-LTHD-E3: 인쇄 매체에서 표가 보인다(전체 선택 후)", async ({ page }) => {
  test.setTimeout(240_000);
  await seedWizard(page, seedOf());
  await calculate(page);
  await page.getByTestId("fb-lthd-portion-table").first().scrollIntoViewIfNeeded();
  // 인쇄는 선택한 섹션만 나온다 — 「전체 선택」 먼저(미선택 섹션은 print:hidden)
  await page.getByRole("button", { name: "전체 선택" }).click();
  await page.emulateMedia({ media: "print" });
  const printed = page.getByTestId("fb-lthd-portion-table").first();
  await expect(printed).toBeVisible();
  expect((await printed.boundingBox())?.width ?? 0).toBeGreaterThan(0);
  await expect(cell(page, "fb-lthd-total")).toHaveText("255,400,000");
});
