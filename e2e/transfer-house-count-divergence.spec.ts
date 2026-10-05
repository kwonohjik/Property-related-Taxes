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
        householdNoOtherHousesConfirmed: true, // roster-required PR-1: preserve scalar-declared fallback (D-4, Q-8)
        householdNoPresaleRightsConfirmed: true, // roster-required PR-D
        assets: [
          {
            ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1",
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
  test("① 명부 필수화(PR-1) 이후 — 숫자 칸이 사라지고 도출값(4채)을 읽기 전용으로 보여준다 + ④ 3채 입력 시 C-1 노출", async ({ page }) => {
    await gotoStep4(page, "5", 3); // 선언 5채(stale) + 다른 주택 3채 → 도출 4채(= 1+3)가 이긴다
    // 종전 「정확한 세대 보유 주택 수」 입력 위젯은 housing에서 제거됐다(Q-6)
    await expect(page.locator("#household-house-count-exact")).toHaveCount(0);
    // 읽기 전용 도출값 — 선언(stale "5")은 무시되고 명부 기준 4채만 보인다
    await expect(page.getByTestId("household-house-count-derived")).toContainText("4채");
    // C-1 우선순위 안내
    await expect(page.getByText("목록이 비어 있을 때만 사용됩니다")).toBeVisible();
  });

  test("① 2채 + ④ 1채(구조 2채 일치) → C-1만, C-2 미노출·정확입력 미노출", async ({ page }) => {
    await gotoStep4(page, "2", 1); // 선언 2채, 다른 주택 1채 → 구조 2채 == 2
    await expect(page.locator("#household-house-count-exact")).toHaveCount(0); // 3채 미만 → 미노출
    await expect(page.getByText("목록이 비어 있을 때만 사용됩니다")).toBeVisible(); // C-1
    await expect(page.getByTestId("house-count-mismatch")).toHaveCount(0); // 일치 → C-2 미노출
  });
});
