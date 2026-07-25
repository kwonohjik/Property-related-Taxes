/**
 * §155⑳ 임대주택 요건 능동형 UI — 조건부 노출 + 판정기준 배지 E2E.
 *
 * 등록일 2필드(세무서·지자체) + 임대구분/취득방법에 따라 소재지역·규모·조정 필드가
 * 능동적으로 노출/숨김되고, 판정 기준 배지(도출 목·의무기간·기준시가 상한)가 실시간 파생됨을 검증.
 * 계획서: docs/02-design/features/rental-housing-155-20-active-ui.plan.md
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

function rentalUnit(over: Record<string, unknown> = {}) {
  return {
    businessRegistrationDate: "2020-08-18",
    rentalRegistrationDate: "2020-08-18",
    rentalCategory: "long_general",
    rentalAcquisitionType: "purchase",
    isApartment: false,
    region: "seoul-metro",
    isRegulatedAreaNewAcq: false,
    standardPriceAtRentalStart: "",
    rentalLandArea: "",
    rentalTotalFloorArea: "",
    hasMinimum2Units: false,
    rentalMonths: "",
    rentalAutoTermination: false,
    requirementsConfirmed: false,
    ...over,
  };
}

function seedForm() {
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1),
            assetKind: "housing",
            acquisitionCause: "purchase",
            acquisitionDate: "2018-01-01",
            residencePeriodMonthsAsset: "30",
            rentalHousingException: {
              applyException: true,
              scenario: "A",
              rentalUnits: [rentalUnit()],
            },
          },
        ],
        transferDate: "2027-01-01",
        isOneHousehold: true,
        householdHousingCount: "1",
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function gotoRentalSection(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedForm(),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await expandAssetSection(page, 5, 0);
}

test.describe("§155⑳ 임대주택 능동형 UI", () => {
  test("등록일 2필드 + 판정 배지(마목 10년) + 조건부 노출 전환", async ({ page }) => {
    await gotoRentalSection(page);

    // 등록일 2필드 노출
    await expect(page.getByText("세무서 사업자등록일", { exact: false })).toBeVisible();
    await expect(page.getByText("지자체 임대사업자등록신청일", { exact: false })).toBeVisible();

    // 판정 기준 배지 — long_general + 2020.8.18 등록 → 마목 · 의무 10년 · 6억
    const badge = page.getByTestId("rental-verdict-badge-0");
    await expect(badge).toContainText("마목");
    await expect(badge).toContainText("10년");
    await expect(badge).toContainText("6억");

    // 매입 장기 → 소재지역 노출, 규모/조정 숨김
    await expect(page.locator('input[name="rental-region-0"]').first()).toBeVisible();
    await expect(page.getByText("건설임대 규모요건")).toHaveCount(0);
    await expect(page.getByText("조정대상지역에 세대원이 신규취득한 단기임대입니다.")).toHaveCount(0);

    // 취득방법 → 건설 : 바목, 규모 필드 노출, 소재지역 숨김
    // (등록기준일 2020-08-18 < 2025.2.28 → 바목 cap 6억, F5)
    await page.locator('input[name="rental-acq-type-0"][value="construction"]').check();
    await expect(badge).toContainText("바목");
    await expect(badge).toContainText("6억");
    await expect(page.getByText("건설임대 규모요건")).toBeVisible();
    await expect(page.getByText("대지면적", { exact: false })).toBeVisible();
    await expect(page.locator('input[name="rental-region-0"]')).toHaveCount(0);

    // 매입 복귀 + 임대구분 단기 6년 → 아목, 조정대상지역 토글 노출
    await page.locator('input[name="rental-acq-type-0"][value="purchase"]').check();
    await page.locator('input[name="rental-category-0"][value="short_6y"]').check();
    await expect(badge).toContainText("아목");
    await expect(badge).toContainText("6년");
    await expect(badge).toContainText("4억");
    await expect(page.getByText("조정대상지역에 세대원이 신규취득한 단기임대입니다.")).toBeVisible();
    await expect(page.getByText("건설임대 규모요건")).toHaveCount(0);
  });

  test("두 등록일 중 하나 미입력 → 사업자등록등 미완비 경고", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), {
      ...seedForm(),
      state: {
        ...seedForm().state,
        formData: {
          ...seedForm().state.formData,
          assets: [
            {
              ...seedForm().state.formData.assets[0],
              rentalHousingException: {
                applyException: true,
                scenario: "A",
                rentalUnits: [rentalUnit({ businessRegistrationDate: "" })],
              },
            },
          ],
        },
      },
    });
    await page.reload();
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await expandAssetSection(page, 5, 0);

    await expect(page.getByTestId("rental-verdict-badge-0")).toContainText("사업자등록등");
  });
});
