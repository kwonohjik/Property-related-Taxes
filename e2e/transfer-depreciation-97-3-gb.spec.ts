/**
 * §97③ 감가상각비 — 일반건물(토지+건물 일괄): 건물분 칸에 입력 → 결과의 건물 카드 취득가액에서 공제.
 *
 * 계획서: docs/00-pm/transfer-depreciation-and-capex-display.plan.md (Phase B-2)
 *
 * 일괄 취득 500,000,000(취득시 기준시가로 토지·건물 안분) · 감가상각비 20,000,000(건물분).
 * 토지 카드는 불변이고 합계 양도차익이 감가상각비만큼 커진다.
 *
 * worktree 실행: E2E_PORT=3217 npx playwright test e2e/transfer-depreciation-97-3-gb.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

const seed = {
  state: {
    formData: {
      assets: [
        {
          ...makeDefaultAsset(1),
          addressJibun: "서울 강남구 테스트동 1-1",
          assetKind: "general_building",
          acquisitionCause: "purchase",
          acquisitionDate: "2015-03-01",
          actualSalePrice: "1000000000",
          fixedAcquisitionPrice: "500000000",
          gbLandArea: "200",
          gbBuildingFootprintArea: "100",
          gbZoneType: "commercial",
          gbTransferLandPricePerSqm: "3000000",
          gbTransferBuildingValue: "200000000",
          gbAcqLandPricePerSqm: "1000000",
          gbAcqBuildingValue: "100000000",
          gbBuildingAcquisitionCause: "purchase",
        },
      ],
      transferDate: "2026-06-03",
      filingDate: "2026-08-31",
      contractTotalPrice: "1000000000",
      householdHousingCount: "0",
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: false,
      isUnregistered: false,
    },
    pendingMigration: false,
  },
  version: 0,
};

async function open(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), seed);
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

async function calculate(page: Page) {
  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  await page.getByText("신고서 양식", { exact: false }).first().waitFor({ timeout: 20000 });
}

test.describe("§97③ 일반건물 — 건물분 감가상각비", () => {
  test("③ 취득정보에 건물분 칸이 열리고, 입력하면 결과 산식에 공제가 보인다", async ({ page }) => {
    test.setTimeout(90_000);
    await open(page);
    await expandAssetSection(page, 3);
    const input = page.getByTestId("depreciation-amount");
    await expect(input).toBeVisible();
    await expect(input, "라벨이 건물분임을 밝힌다").toHaveAttribute("aria-label", /건물분/);
    await input.fill("20000000");

    await calculate(page);

    // 신고서 양식 「취득가액」 행 — 토지·건물 카드 열. 일괄 취득 500,000,000을 취득시 기준시가(토지 200,000,000 :
    // 건물 100,000,000)로 안분하면 건물분 166,666,667 → 감가상각비 20,000,000을 공제한 146,666,667.
    // 토지분 333,333,333은 불변이다.
    const acqRow = page.getByRole("row").filter({ hasText: /^취득가액/ }).first();
    await expect(acqRow, "건물분은 공제 후 값").toContainText("146,666,667");
    await expect(acqRow, "공제 전 건물분이 남아 있으면 안 된다").not.toContainText("166,666,667");
    await expect(acqRow, "토지분은 불변").toContainText("333,333,333");
  });

  test("긍정 짝 — 입력하지 않으면 공제 문구가 없다", async ({ page }) => {
    test.setTimeout(90_000);
    await open(page);
    await calculate(page);
    const acqRow = page.getByRole("row").filter({ hasText: /^취득가액/ }).first();
    await expect(acqRow).toContainText("166,666,667");
    await expect(acqRow).toContainText("333,333,333");
  });
});
