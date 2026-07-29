/**
 * 다주택 중과 한시배제기간(2022-05-10~2026-05-09, 보유 2년 이상) → Step4 ④ 주택수·중과 판정
 * 섹션 숨김 + 안내 카드 노출 E2E.
 *
 * 근거: 소득세법 시행령 §167의3①12의2·§167의10①12의2.
 * 계획서: docs/02-design/features/transfer-surcharge-grace-period-ui-hide.plan.md §4-C·§8.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

function seedForm(transferDate: string) {
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1),
            assetKind: "housing",
            acquisitionCause: "purchase",
            acquisitionDate: "2020-01-01", // 보유 2년 이상
          },
        ],
        transferDate,
        householdHousingCount: "3", // 다주택 (④ 트리거)
        isOneHousehold: false,
        isRegulatedArea: true,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function gotoHolding(page: Page, transferDate: string) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedForm(transferDate),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByRole("button", { name: "보유 상황" }).first().click();
}

test.describe("다주택 중과 한시배제 → ④ 숨김", () => {
  test("배제기간 내(2025-06-01) + 보유 2년↑ → 안내 카드 노출 + 다른 보유 주택 목록 숨김", async ({
    page,
  }) => {
    await gotoHolding(page, "2025-06-01");
    await expect(page.getByTestId("surcharge-suspended-notice")).toBeVisible();
    // ④ 섹션 내용(다른 보유 주택 목록) 미노출
    await expect(page.getByText("다른 보유 주택 목록", { exact: false })).toHaveCount(0);
  });

  test("배제기간 밖(2026-05-10) → 안내 카드 없음 + ④ 노출", async ({ page }) => {
    await gotoHolding(page, "2026-05-10");
    await expect(page.getByTestId("surcharge-suspended-notice")).toHaveCount(0);
    await expect(page.getByText("다른 보유 주택 목록", { exact: false }).first()).toBeVisible();
  });
});
