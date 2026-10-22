/**
 * E2E: «구분 기재를 골랐으나 토지·건물 양도가액 두 칸을 비웠다» → 안분 흔적 한 줄 (사용자 결정 Q-1 B).
 *
 * 계획서: `docs/00-pm/sale-split-actual-both-empty.plan.md` §10
 *
 * 계산·검증은 그대로다(엔진은 값의 유무로 스위치해 양도시 기준시가로 안분한다). 이 spec은 **그 사실이 결과 카드·신고서 양식 표 각주·
 * 상세명세서에 실제로 도달하는가**를 폼 → 계산 → 화면까지 한 번에 본다. 대조군(일괄 양도 / 두 칸 채움)에서는 뜨지 않아야 한다.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

const STD = "구분 기재를 선택했으나 토지·건물 양도가액이 입력되지 않아 양도시 기준시가 비율로 안분했습니다 (소득세법 시행령 §166 ⑥)";

function seed(asset: Record<string, unknown>, contractTotalPrice: string, transferDate: string) {
  return {
    state: {
      formData: {
        householdNoOtherHousesConfirmed: true,
        householdNoPresaleRightsConfirmed: true,
        assets: [{ ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", ...asset }],
        transferDate,
        filingDate: "2026-08-31",
        contractTotalPrice,
        householdHousingCount: "1",
        isOneHousehold: false,
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

const SPLIT_ASSET = {
  assetKind: "housing",
  acquisitionCause: "purchase",
  hasSeperateLandAcquisitionDate: true,
  acquisitionDate: "2016-06-01",
  landAcquisitionDate: "2014-06-01",
  landAcqMode: "actual",
  buildingAcqMode: "actual",
  landAcquisitionPrice: "400000000",
  buildingAcquisitionPrice: "400000000",
  landStandardPriceAtTransfer: "900000000",
  buildingStandardPriceAtTransfer: "600000000",
  actualSalePrice: "1500000000",
};
const GB_ASSET = {
  assetKind: "general_building",
  acquisitionCause: "purchase",
  acquisitionDate: "1999-05-24",
  useEstimatedAcquisition: true,
  gbLandArea: "85",
  gbBuildingArea: "180.96",
  gbBuildingFootprintArea: "90.48",
  gbTransferLandPricePerSqm: "10830000",
  gbTransferBuildingValue: "20629440",
  gbAcqLandPricePerSqm: "2800000",
  gbAcqBuildingValue: "28144700",
  gbBuildingAcquisitionCause: "purchase",
  gbZoneType: "commercial",
  gbIsMetropolitan: true,
};

async function seedAndCalc(page: Page, s: ReturnType<typeof seed>) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((v) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(v)), s);
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  await page.getByText("신고서 양식", { exact: false }).first().waitFor({ timeout: 20_000 });
}

test.describe("«구분 기재 + 두 칸 비움» 안분 흔적 (Q-1 B)", () => {
  test("split: 구분 기재 + 두 칸 비움 → 결과 카드·신고서 각주·상세명세서에 한 줄", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndCalc(page, seed({ ...SPLIT_ASSET, saleSplitMode: "actual" }, "1500000000", "2024-06-01"));

    await expect(page.getByTestId("sale-split-unentered-notice")).toContainText(STD);
    await expect(page.getByTestId("filing-sale-split-unentered-note")).toContainText(STD);
    // 판정(30%)은 구분 기재가 없어 뜨지 않는다 — 안내와 배타
    await expect(page.getByTestId("sale-split-judgment")).toHaveCount(0);
    // 상세명세서 «양도가액» 항목의 ※ note (접힌 그룹이어도 DOM에는 있다)
    await expect(page.locator('[data-statement-row="양도가액"]')).toContainText(STD);
    await page.screenshot({ path: "test-results/sale-split-unentered-split.png", fullPage: true });
  });

  test("split 대조군: 일괄 양도(기준시가 안분)를 고르면 안 뜬다", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndCalc(page, seed({ ...SPLIT_ASSET, saleSplitMode: "apportioned" }, "1500000000", "2024-06-01"));
    await expect(page.getByTestId("sale-split-unentered-notice")).toHaveCount(0);
    await expect(page.getByTestId("filing-sale-split-unentered-note")).toHaveCount(0);
    await expect(page.locator('[data-statement-row="양도가액"]')).not.toContainText("구분 기재를 선택했으나");
  });

  test("split 대조군: 두 칸을 채우면 안내 대신 30% 판정이 뜬다", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndCalc(
      page,
      seed({ ...SPLIT_ASSET, saleSplitMode: "actual", landTransferPrice: "900000000", buildingTransferPrice: "600000000" }, "1500000000", "2024-06-01"),
    );
    await expect(page.getByTestId("sale-split-judgment")).toBeVisible();
    await expect(page.getByTestId("sale-split-unentered-notice")).toHaveCount(0);
  });

  test("일반건물: 구분 기재 + 두 칸 비움 → 결과 카드·신고서 각주에 한 줄", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndCalc(page, seed({ ...GB_ASSET, saleSplitMode: "actual" }, "925000000", "2023-02-19"));

    await expect(page.getByTestId("sale-split-unentered-notice")).toContainText(STD);
    await expect(page.getByTestId("filing-sale-split-unentered-note")).toContainText(STD);
    await expect(page.getByTestId("sale-split-judgment")).toHaveCount(0);
    await expect(page.locator('[data-statement-row="양도가액"]')).toContainText(STD);
    await page.screenshot({ path: "test-results/sale-split-unentered-gb.png", fullPage: true });
  });

  test("일반건물 대조군: 일괄 양도(기본)는 안 뜬다", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndCalc(page, seed({ ...GB_ASSET, saleSplitMode: "apportioned" }, "925000000", "2023-02-19"));
    await expect(page.getByTestId("sale-split-unentered-notice")).toHaveCount(0);
    await expect(page.getByTestId("filing-sale-split-unentered-note")).toHaveCount(0);
  });
});
