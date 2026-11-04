/**
 * 계산기 — 1주택 · 일시적 2주택 비과세가 성립하지 않아 과세되면 어느 요건에서 떨어졌는지 결과 화면에 보인다
 * (`docs/00-pm/one-house-154-1-unmet-reason-calc.plan.md` · Q-A2). 문장·세액은 anchor
 * (`__tests__/calc/one-house-unmet-reason-notice.anchor.test.tsx`)가 고정한다 — 여기서는 결과 화면 표시만 본다.
 */
import { test, expect, type Page } from "@playwright/test";
import { gotoTransferHoldingsStep, otherHouse } from "./_helpers/transfer-seed";

const NC = "4682025021";

async function calculate(page: Page) {
  for (const step of ["보유 상황", "감면·공제", "가산세"]) {
    await page.getByRole("button", { name: step }).first().click();
  }
  const response = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 30_000 });
  await page.getByRole("button", { name: /계산하기/ }).click();
  const res = await response;
  expect(res.ok(), `계산 API 비정상 응답 ${res.status()}`).toBe(true);
  return ((await res.json()) as { data: { result: { isExempt: boolean; totalTax: number } } }).data.result;
}

const sale = (acquisitionDate: string) => ({
  addressJibun: "경상남도 고성군 테스트리 1",
  regionCode: NC,
  acquisitionDate,
  actualSalePrice: "1000000000",
  fixedAcquisitionPrice: "600000000",
});
const form = (o: Record<string, unknown> = {}) => ({ transferDate: "2023-09-18", filingDate: "2023-11-30", contractTotalPrice: "1000000000", ...o });

test("[OHU-1] ★ 1주택 · 보유 11개월 → 보유기간 미충족 사유가 결과에 보인다", async ({ page }) => {
  test.setTimeout(90_000);
  await gotoTransferHoldingsStep(page, { houses: [], assetOver: sale("2022-10-01"), formOver: form() });
  const result = await calculate(page);
  expect(result.isExempt).toBe(false);
  expect(result.totalTax).toBeGreaterThan(0);
  await expect(
    page.getByText(/1세대1주택 비과세\(소득세법 시행령 §154①\)를 적용하지 않았습니다 — 보유기간 2년 이상 미충족\(보유 기산일 2022-10-01, 보유기간 0년 11개월\)/).first(),
  ).toBeVisible();
});

test("[OHU-2] 일시적 2주택 · 처분기한 경과 → 처분기한 미충족 사유가 결과에 보인다", async ({ page }) => {
  test.setTimeout(90_000);
  await gotoTransferHoldingsStep(page, {
    houses: [otherHouse("b", "2020-01-02", { regionCode: NC, officialPrice: "100000000" })],
    assetOver: sale("2018-06-01"),
    formOver: form({ temporaryTwoHouseSpecial: true, newHouseAcquisitionDate: "2020-01-02" }),
  });
  const result = await calculate(page);
  expect(result.isExempt).toBe(false);
  await expect(
    page.getByText(/일시적 2주택 비과세 특례\(소득세법 시행령 §155①\)를 적용하지 않았습니다 — 신규주택 취득일부터 3년 이내 종전주택 양도 미충족/).first(),
  ).toBeVisible();
});
