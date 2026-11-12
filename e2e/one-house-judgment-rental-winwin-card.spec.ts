/**
 * V-8 — 판정 메뉴 ⑳ 카드 거주 행이 상생임대주택(§155의3①) 면제를 **엔진과 같게** 표시한다 (브라우저 확인).
 *
 * 시료: 본인 거주 0개월 · 상생임대 성립 · 명부에 장기임대 1호. 엔진은 ⑳ 성립 → 비과세.
 * 종전: ② 화면 ⑳ 카드가 「✗ 미충족 — 현재 0개월」. vitest anchor: `__tests__/calc/judgment-rental-winwin-card.anchor.test.tsx`.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset, makeDefaultRentalUnit } from "../lib/stores/calc-wizard-asset-factory";
import { createHouseEntry } from "../lib/stores/house-entry-factory";

function seedForm(win: boolean) {
  return {
    state: {
      formData: {
        ...(win
          ? {
              winWinRentalSpecial: true,
              winWinRentalContractDate: "2022-03-01",
              winWinRentalIncreaseRatePct: "5",
              winWinRentalPriorLeaseMonths: "24",
              winWinRentalLeaseMonths: "24",
            }
          : {}),
        assets: [
          {
            ...makeDefaultAsset(1),
            addressJibun: "경남 창원시 테스트동 1-1",
            assetKind: "housing",
            acquisitionCause: "purchase",
            acquisitionDate: "2021-01-04",
            residenceInputMode: "direct",
            residencePeriods: [],
            residencePeriodMonthsAsset: "0",
            rentalHousingException: {
              ...makeDefaultAsset(1).rentalHousingException,
              applyException: true,
              scenario: "A",
              priorRentalExemptionHistory: "none",
              phrp154_10Answer: "no",
              rentalUnits: [
                {
                  ...makeDefaultRentalUnit(),
                  businessRegistrationDate: "2015-01-01",
                  rentalRegistrationDate: "2015-01-01", rentalRegisteredDate: "2015-01-01",
                  standardPriceAtRentalStart: "250,000,000",
                  rentalInputMode: "direct",
                  rentalMonths: "110",
                  requirementsConfirmed: true,
                  rentalCategory: "long_general",
                  rentalAcquisitionType: "purchase",
                },
              ],
            },
          },
        ],
        transferDate: "2025-03-03",
        contractTotalPrice: "800000000",
        isOneHousehold: true,
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        houses: [
          {
            ...createHouseEntry("rt"),
            acquisitionDate: "2015-01-01",
            region: "non_capital",
            regionCode: "4682025021",
            officialPrice: "250000000",
            isApartment: false,
            acquisitionOrigin: "general",
            isLongTermRental: true,
            rentalType: "A",
            rentalStartOfficialPrice: "250000000",
            rentalRegistrationDate: "2015-01-01", rentalRegisteredDate: "2015-01-01",
            rentalStartDate: "2015-01-01",
          },
        ],
        householdHousingCount: "2",
        presaleRights: [],
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function gotoTargetStep(page: Page, win: boolean) {
  await page.goto("/calc/one-house-exemption");
  await expect(page.getByTestId("one-house-household")).toBeVisible();
  await page.evaluate((s) => sessionStorage.setItem("one-house-judgment-wizard", JSON.stringify(s)), seedForm(win));
  await page.reload();
  await expect(page.getByTestId("one-house-household")).toBeVisible();
  await page.getByRole("button", { name: "다음" }).click();
  await expect(page.getByText("② 양도 대상 주택")).toBeVisible();
}

const residenceRow = (page: Page) =>
  page.locator("span", { hasText: /^거주주택 거주기간/ }).first().locator("xpath=following-sibling::span[1]");

test.describe("V-8 판정 메뉴 ⑳ 카드 × 상생임대", () => {
  test("상생임대 성립 → 카드 「✓ 충족」(상생임대 면제) · 판정 비과세 · ⑳ 성립", async ({ page }, info) => {
    await gotoTargetStep(page, true);
    await expect(page.getByText("거주주택 거주기간 — 상생임대주택이라 적용하지 않음", { exact: false })).toBeVisible();
    await expect(residenceRow(page)).toContainText("✓ 충족");
    await residenceRow(page)
      .locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]")
      .screenshot({ path: info.outputPath("v8-step2-card-winwin.png") });

    // ③ 보유 주택 → ④ 결과 — 엔진 응답이 카드와 같은 결론인지 본다.
    await page.getByRole("button", { name: "다음" }).click();
    const respP = page.waitForResponse((r) => r.url().includes("/api/calc/one-house-exemption") && r.request().method() === "POST");
    await page.getByRole("button", { name: "판정 결과 보기" }).click();
    const json = await (await respP).json();
    expect(json.data.rentalHousingException.passed).toBe(true);
    expect(json.data.judgment.isExempt).toBe(true);
    await page.screenshot({ path: info.outputPath("v8-result-winwin.png"), fullPage: true });
  });

  test("상생임대 없음 → 카드 「✗ 미충족」 (회귀 없음)", async ({ page }) => {
    await gotoTargetStep(page, false);
    await expect(page.getByText("상생임대주택이라 적용하지 않음", { exact: false })).toHaveCount(0);
    await expect(residenceRow(page)).toContainText("✗ 미충족");
  });
});
