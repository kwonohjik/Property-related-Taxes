/**
 * 다주택 중과 — ①(세대 보유 주택 수) ↔ ④(다른 보유 주택 목록) 정합성 안내 UI.
 *
 * - ① "3채 이상" 활성 시 정확 숫자 입력(4·5채) 노출 → 엔진 비과세/장특 판정에 실제 주택 수 전달.
 * - ④ 채워지면 C-1(우선순위 안내) 노출, ①≠④ 주택 수면 C-2(불일치 경고) 노출.
 * 라이브 조회 불필요 — sessionStorage로 상태 주입.
 */

import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

function seedForm(householdHousingCount: string, otherHouseCount: number) {
  const houses = Array.from({ length: otherHouseCount }, (_, i) => ({
    id: `house_${i + 1}`,
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
  }));
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
        transferDate: "2026-06-01", // 중과 유예 종료 후 → ④ 섹션 노출
        householdHousingCount,
        isOneHousehold: true,
        houses,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function gotoStep4(page: Page, householdHousingCount: string, otherHouseCount: number) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedForm(householdHousingCount, otherHouseCount),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByRole("button", { name: "보유 상황" }).first().click();
}

test.describe("① 세대 보유 주택 수 ↔ ④ 목록 정합성 안내", () => {
  test("① '3채 이상' → 정확 숫자 5 입력 노출 + ④ 3채 입력 시 C-1·C-2(불일치) 노출", async ({ page }) => {
    await gotoStep4(page, "5", 3); // 선언 5채, 다른 주택 3채 → 구조 4채 ≠ 5
    // 정확 숫자 입력 위젯 노출 + 값 5
    const exact = page.locator("#household-house-count-exact");
    await expect(exact).toBeVisible();
    await expect(exact).toHaveValue("5");
    // C-1 우선순위 안내
    await expect(page.getByText("목록이 비어 있을 때만 사용됩니다")).toBeVisible();
    // C-2 불일치 경고 — 선언 5채 ≠ 구조 4채(양도1+3)
    const mismatch = page.getByTestId("house-count-mismatch");
    await expect(mismatch).toBeVisible();
    await expect(mismatch).toContainText("5채");
    await expect(mismatch).toContainText("4채");
  });

  test("① 2채 + ④ 1채(구조 2채 일치) → C-1만, C-2 미노출·정확입력 미노출", async ({ page }) => {
    await gotoStep4(page, "2", 1); // 선언 2채, 다른 주택 1채 → 구조 2채 == 2
    await expect(page.locator("#household-house-count-exact")).toHaveCount(0); // 3채 미만 → 미노출
    await expect(page.getByText("목록이 비어 있을 때만 사용됩니다")).toBeVisible(); // C-1
    await expect(page.getByTestId("house-count-mismatch")).toHaveCount(0); // 일치 → C-2 미노출
  });
});
