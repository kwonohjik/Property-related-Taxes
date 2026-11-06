/**
 * V-7 — 계산기: ⑳ 호별 요건이 불성립이면 결과 화면에 「적용 불가 + 미충족 사유」 카드가 뜬다 (브라우저 확인).
 *
 * 종전: 호별 토글 OFF면 ⑧은 막지 않고 엔진은 불성립으로 계산하는데, 사유는 접힌 「전체 엔진 계산 과정 보기」 한 줄뿐이었다.
 * 세부 단언은 anchor `__tests__/calc/rental-155-20-unmet-card-v7.anchor.test.tsx`가 고정한다.
 */
import { test, expect } from "@playwright/test";
import { gotoTransferHoldingsStep, otherHouse } from "./_helpers/transfer-seed";
import { makeDefaultRentalUnit } from "../lib/stores/calc-wizard-asset-factory";

const NA = {
  ...makeDefaultRentalUnit(),
  businessRegistrationDate: "2003-05-01",
  rentalRegistrationDate: "2003-05-01",
  rentalCategory: "existing_business",
  rentalAcquisitionType: "purchase",
  region: "seoul-metro",
  acquisitionOfficialPrice: "200000000",
  standardPriceAtRentalStart: "200000000",
  isNationalSizeHousing: true,
  hasMinimum2Units: false, // ← 나목은 2호 이상 임대해야 한다 — 토글 OFF
  rentalInputMode: "direct",
  rentalMonths: "130",
  requirementsConfirmed: true,
};

/** 나목 시료(2호 이상 충족) — 호별 요건은 모두 통과하게 두고 전제(게이트)만 바꿔 본다. */
const NA_OK = { ...NA, hasMinimum2Units: true };

async function calcAndOpenCards(page: import("@playwright/test").Page, unit: Record<string, unknown>, formOver: Record<string, unknown> = {}) {
  await gotoTransferHoldingsStep(page, {
    houses: [otherHouse("rt", "2003-05-01", { region: "capital", officialPrice: "200000000", isLongTermRental: true })],
    assetOver: {
      assetKind: "housing",
      acquisitionCause: "purchase",
      acquisitionDate: "2010-01-01",
      fixedAcquisitionPrice: "300000000",
      actualSalePrice: "800000000",
      residenceInputMode: "direct",
      residencePeriodMonthsAsset: "60",
      rentalHousingException: { applyException: true, scenario: "A", priorRentalExemptionHistory: "none", rentalUnits: [unit] },
    },
    formOver: { transferDate: "2026-03-15", filingDate: "2026-05-31", contractTotalPrice: "800000000", ...formOver },
  });
  for (const step of ["감면·공제", "가산세"]) {
    await page.getByRole("button", { name: step }).first().click();
  }
  const rp = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 30_000 });
  await page.getByRole("button", { name: /계산하기/ }).click();
  const resp = await rp;
  expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()}`).toBe(true);
  const result = ((await resp.json()) as {
    data: { result: { isExempt: boolean; totalTax: number; rentalHousingExceptionDetail?: { applied: boolean; eligibility?: { gateFailReasons?: string[] } } } };
  }).data.result;
  // 접힌 「전체 엔진 계산 과정 보기」를 열지 않아도 상세 산출근거 카드에 보인다(출력 항목은 「전체 선택」으로 연다).
  await page.getByRole("button", { name: "전체 선택" }).first().click();
  return result;
}

test("[V7-1] 나목 · 2호 이상 토글 OFF — 결과에 「적용 불가」 카드와 사유가 보인다", async ({ page }, info) => {
  const result = await calcAndOpenCards(page, NA);
  expect(result.isExempt).toBe(false);
  expect(result.rentalHousingExceptionDetail?.applied).toBe(false);
  const card = page.locator("p.font-semibold", { hasText: "장기임대주택 거주주택 비과세 특례 — 적용 불가" }).first();
  await expect(card).toBeVisible();
  await expect(page.getByText("나목은 국민주택규모 민간매입임대주택을 2호 이상 임대해야 합니다", { exact: false }).filter({ visible: true }).first()).toBeVisible();
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("v7-result-unmet-card.png"), fullPage: false });
});

test("[V7-2] 미등기 양도 — 카드에 「미등기양도자산」 사유(적용 전제)가 보인다", async ({ page }, info) => {
  const result = await calcAndOpenCards(page, NA_OK, { isUnregistered: true });
  expect(result.rentalHousingExceptionDetail?.applied).toBe(false);
  expect(result.rentalHousingExceptionDetail?.eligibility?.gateFailReasons?.join(" ")).toContain("미등기양도자산");
  const card = page.locator("p.font-semibold", { hasText: "장기임대주택 거주주택 비과세 특례 — 적용 불가" }).first();
  await expect(card).toBeVisible();
  await expect(page.getByTestId("rental-exception-gate-fail-reasons")).toContainText("미등기양도자산");
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("v7-result-unmet-unregistered.png"), fullPage: false });
});

test("[V7-3] 1세대 아님 — 카드에 「1세대 요건」 사유(적용 전제)가 보인다", async ({ page }, info) => {
  const result = await calcAndOpenCards(page, NA_OK, { isOneHousehold: false });
  expect(result.rentalHousingExceptionDetail?.applied).toBe(false);
  expect(result.rentalHousingExceptionDetail?.eligibility?.gateFailReasons?.join(" ")).toContain("1세대 요건");
  const card = page.locator("p.font-semibold", { hasText: "장기임대주택 거주주택 비과세 특례 — 적용 불가" }).first();
  await expect(card).toBeVisible();
  await expect(page.getByTestId("rental-exception-gate-fail-reasons")).toContainText("1세대 요건");
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("v7-result-unmet-not-one-household.png"), fullPage: false });
});
