/**
 * E2E: 의제취득일(1985.1.1.) 전 매수 토지 — 영 §176조의2④ 「많은 것」(PR-2 화면 경로)
 * 계획서 `docs/02-design/features/realestate-pre-deemed-purchase-176-2-4.plan.md` §4.2·§6.
 * 시료: 토지 · 양도 5억 · 실가 1억 · 1984.6.1. 매수 → ② 1억 × 50.29 ÷ 49.59 = 101,411,574.
 *
 *   PD-E1. 1984-06-01 입력 → 취득일 칸 1985-01-01 · 카드의 실제 취득일 1984-06-01 · 요청에 실제 취득일 · 결과 카드 ② 101,411,574
 *   PD-E2. 실제 취득일이 빈 옛 저장값 → 막힌다(칸 있음) · 카드에 입력하면 계산된다
 *   PD-E3. 환산 + 함께 견줄 실가 3억 → ② 304,234,724 채택(① 2억)
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

const LAND = (over: Record<string, unknown> = {}) => ({
  ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 9-1", assetKind: "land", landNature: "standalone", acquisitionArea: "200", transferArea: "200",
  acquisitionCause: "purchase", actualSalePrice: "500,000,000", fixedSalePrice: "500,000,000", transferType: "regular",
  acquisitionDate: "1985-01-01", fixedAcquisitionPrice: "100,000,000", standardPriceAtTransfer: "250000000", ...over,
});

async function seed(page: Page, assets: unknown[]) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), {
    state: {
      formData: {
        assets, contractTotalPrice: "500000000", transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "0",
        isOneHousehold: false, householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false,
      },
      pendingMigration: false,
    },
    version: 0,
  });
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

async function calculate(page: Page) {
  const res = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  await page.getByRole("button", { name: /계산하기/ }).last().click();
  return res;
}

const dateParts = (testId: string, page: Page) => page.getByTestId(testId).locator("input");

test("PD-E1: 1984-06-01 → 취득일 칸 의제취득일 · 실제 취득일 보존 · 결과 카드 ② 101,411,574", async ({ page }) => {
  test.setTimeout(240_000);
  await seed(page, [LAND({ acquisitionDate: "1984-06-01" })]);
  await expandAssetSection(page, 3);
  await dateParts("acq-date-building", page).first().focus();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).click(); // 날짜 위젯 밖으로 — blur 덮어쓰기
  await expect(page.getByText("1985.1.1. 의제 취득일로 취득일 변경했습니다.")).toBeVisible();
  await expect(dateParts("acq-date-building", page).first()).toHaveValue("1985");
  const card = page.getByTestId("pre-deemed-purchase-card");
  await expect(card).toBeVisible();
  await expect(dateParts("pre-deemed-purchase-original-date", page).nth(0)).toHaveValue("1984");
  await expect(dateParts("pre-deemed-purchase-original-date", page).nth(1)).toHaveValue("6");
  await expect(page.getByTestId("pre-deemed-purchase-actual-note")).toBeVisible();

  const res = await calculate(page);
  expect(res.status()).toBe(200);
  expect(JSON.parse(res.request().postData() ?? "{}").preDeemedPurchase).toEqual({ originalAcquisitionDate: "1984-06-01" });
  const result = page.getByTestId("pre-deemed-purchase-result-card");
  await expect(result).toContainText("101,411,574");
  await expect(result).toContainText("← 채택");
});

test("PD-E2: 실제 취득일 빈칸(옛 저장값) → 막힘 · 카드에 입력하면 계산", async ({ page }) => {
  test.setTimeout(240_000);
  await seed(page, [LAND()]);
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  await page.getByRole("button", { name: /계산하기/ }).last().click();
  await expect(page.getByText(/실제 취득일을 입력하세요/).first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "자산 목록" }).first().click();
  await expandAssetSection(page, 3);
  const parts = dateParts("pre-deemed-purchase-original-date", page);
  await parts.nth(0).fill("1984");
  await parts.nth(1).fill("6");
  await parts.nth(2).fill("1");
  const res = await calculate(page);
  expect(res.status()).toBe(200);
  await expect(page.getByTestId("pre-deemed-purchase-result-card")).toContainText("101,411,574");
});

test("PD-E3: 환산 + 함께 견줄 실가 3억 → ② 304,234,724 채택(① 200,000,000)", async ({ page }) => {
  test.setTimeout(240_000);
  await seed(page, [LAND({ useEstimatedAcquisition: true, fixedAcquisitionPrice: "", pre1990Enabled: true, pre1990GradeMode: "value", pre1990Grade_current: "100000", pre1990Grade_prev: "100000", pre1990Grade_atAcq: "100000", pre1990PricePerSqm_1990: "500000", preDeemedOriginalAcquisitionDate: "1984-06-01" })]);
  await expandAssetSection(page, 3);
  await page.getByTestId("pre-deemed-purchase-actual-price").fill("300000000");
  const res = await calculate(page);
  expect(res.status()).toBe(200);
  expect(JSON.parse(res.request().postData() ?? "{}").preDeemedPurchase).toEqual({ originalAcquisitionDate: "1984-06-01", actualPrice: 300_000_000 });
  const result = page.getByTestId("pre-deemed-purchase-result-card");
  await expect(result).toContainText("304,234,724");
  await expect(result).toContainText("200,000,000");
});
