/**
 * 상가건물 상속 — 자산구분 라벨 cosmetic (Phase 3).
 *
 * 검증: 상가건물을 상속으로 취득하면, 자산구분(토지/개별주택/공동주택) 라디오는 숨기고
 *   "상속개시일 상증법 평가액" 안내를 노출한다(상가는 토지/주택 구분 무의미).
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

function seedForm() {
  return {
    state: {
      formData: {
        assets: [{
          ...makeDefaultAsset(1),
          assetKind: "commercial_building",
          acquisitionCause: "inheritance",
          acquisitionDate: "2017-09-15",
          decedentAcquisitionDate: "2010-02-02",
          inheritanceStartDate: "2017-09-15",
          inheritanceAssetKind: "land",
          publishedValueAtInheritance: "300000000",
          useEstimatedAcquisition: false,
        }],
        transferDate: "2025-06-01",
        filingDate: "2025-08-31",
        contractTotalPrice: "540000000",
        householdHousingCount: "1",
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function seedAndOpenStep1(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), seedForm());
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  // 취득정보 섹션 펼치기 (기본 접힘) — 취득 폼(CompanionAcqInheritanceBlock) 노출.
  await page.getByRole("button", { name: /취득정보/ }).first().click();
}

test.describe("상가 상속 자산구분 라벨 (cosmetic)", () => {
  test("상가 상속 → 자산구분 라디오 숨김 + 상증법 평가액 안내 노출", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndOpenStep1(page);

    // 상가 전용 안내가 노출된다.
    await expect(
      page.getByText("상업용건물·오피스텔은 상속개시일 현재 상증법", { exact: false }).first(),
    ).toBeVisible();

    // 자산구분(토지/개별주택/공동주택) 라디오 라벨은 나타나지 않는다.
    await expect(page.getByText("자산 구분 (상속개시일 기준)", { exact: false })).toHaveCount(0);
  });
});
