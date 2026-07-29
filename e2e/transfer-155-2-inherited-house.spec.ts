/**
 * §155② 상속주택 특례 — 2년증여 게이트 토글 노출 E2E (Tier 2-A1).
 *
 * houses[]에 상속주택(isInherited) 존재 시 "양도주택이 상속개시 2년내 피상속인 증여분" 토글 노출.
 * 계획서: docs/02-design/features/transfer-155-2-4-5-exemption-gap.plan.md Tier 2-A1.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

function house(over: Record<string, unknown>) {
  return {
    id: "h1",
    region: "capital",
    acquisitionDate: "2023-01-01",
    officialPrice: "300000000",
    isInherited: false,
    isLongTermRental: false,
    isApartment: true,
    isOfficetel: false,
    isUnsoldHousing: false,
    ...over,
  };
}

function seedForm(over: Record<string, unknown>) {
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1),
            assetKind: "housing",
            acquisitionCause: "purchase",
            acquisitionDate: "2018-01-01",
          },
        ],
        transferDate: "2027-01-01", // 중과 배제기간 밖 → ④ 섹션 노출
        isOneHousehold: true,
        householdHousingCount: "2",
        ...over,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function gotoHolding(page: Page, over: Record<string, unknown>) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedForm(over),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByRole("button", { name: "보유 상황" }).first().click();
}

const TOGGLE = "양도주택이 상속개시 2년내 피상속인 증여분";

test.describe("§155② 상속주택 2년증여 게이트", () => {
  test("houses 상속주택 있을 때 토글 노출", async ({ page }) => {
    await gotoHolding(page, {
      houses: [house({ isInherited: true, inheritedDate: "2023-01-01" })],
    });
    await expect(page.getByRole("switch", { name: TOGGLE })).toBeVisible();
  });

  test("상속주택 없으면 토글 미노출", async ({ page }) => {
    await gotoHolding(page, { houses: [house({ isInherited: false })] });
    await expect(page.getByRole("switch", { name: TOGGLE })).toHaveCount(0);
  });
});
