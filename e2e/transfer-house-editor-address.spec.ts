/**
 * 다른 보유 주택 편집 모달 — 소재지 주소검색 + 지역 자동판정 (읽기전용) UI.
 *
 * regionCode 유무에 따라 지역 구분이 자동판정 읽기전용 표시("소재지 주소에서 자동 판정") vs
 * 수동 라디오로 분기되는지 검증. 라이브 Vworld 불필요 — sessionStorage로 상태 주입.
 */

import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

function seedForm(houseRegionCode?: string) {
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1),
            assetKind: "housing",
            acquisitionCause: "purchase",
            acquisitionDate: "2020-01-01",
            regionCode: "1168010100",
          },
        ],
        transferDate: "2026-06-01", // 중과 유예(2022-05-10~2026-05-09) 종료 후 → ④ 섹션·주택목록 노출
        householdHousingCount: "2",
        isOneHousehold: true,
        houses: [
          {
            id: "house_other_1",
            region: "capital",
            acquisitionDate: "2019-01-01",
            officialPrice: "800000000",
            isInherited: false,
            isLongTermRental: false,
            isApartment: true,
            isOfficetel: false,
            isUnsoldHousing: false,
            acquisitionPrice: "700000000",
            exclusiveArea: "84",
            isUnsoldNewHouse: false,
            completionDate: "",
            isSpouseOwned: false,
            isCoInherited: false,
            decedentSameHouseholdAtInheritance: false,
            isRankingDisqualifiedInheritedHouse: false,
            ...(houseRegionCode ? { regionCode: houseRegionCode } : {}),
          },
        ],
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function openEditor(page: Page, houseRegionCode?: string) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedForm(houseRegionCode),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByRole("button", { name: "보유 상황" }).first().click();
  await page.getByRole("button", { name: "주택 1 편집" }).click();
  return page.getByRole("dialog");
}

test.describe("주택 편집 모달 — 소재지 주소검색 + 지역 자동판정", () => {
  test("regionCode 있는 주택 → 소재지 필드 + 지역 자동판정 읽기전용(라디오 없음)", async ({ page }) => {
    const dialog = await openEditor(page, "1168010100"); // 강남 REGION → capital
    await expect(dialog.getByText("소재지", { exact: true })).toBeVisible();
    await expect(dialog.getByText("소재지 주소에서 자동 판정")).toBeVisible();
    await expect(dialog.getByText("수도권·광역시 등")).toBeVisible();
  });

  test("regionCode 없는 주택 → 수동 지역 라디오(자동판정 문구 없음)", async ({ page }) => {
    const dialog = await openEditor(page, undefined);
    await expect(dialog.getByText("소재지", { exact: true })).toBeVisible();
    await expect(dialog.getByText("소재지 주소에서 자동 판정")).toHaveCount(0);
  });
});
