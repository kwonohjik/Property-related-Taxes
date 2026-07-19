/**
 * §154① 단서 카드 mode별 노출·옵션 필터 E2E.
 *
 * - 1주택(one_house) → 섹션② 카드 노출 + 전체 옵션(나·다목·5호 포함)
 * - 순수 2주택(특례 OFF)·3주택 → 카드 숨김
 * - 일시적 2주택(temporary_two_house) → 섹션③ 카드 노출 + 나·다목·5호 옵션 부재(1·2가·3호만)
 *
 * 계획서: docs/02-design/features/transfer-154-proviso-temporary-two-house-gap.plan.md §9(DoD E2E).
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

function seedForm(over: Record<string, unknown>) {
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1),
            assetKind: "housing",
            acquisitionCause: "purchase",
            acquisitionDate: "2023-01-01",
          },
        ],
        transferDate: "2025-06-01",
        isOneHousehold: true,
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

test.describe("§154① 단서 카드 mode별 노출·옵션 필터", () => {
  test("1주택 → 카드 노출(섹션②) + 전체 옵션(나·다목 포함)", async ({ page }) => {
    await gotoHolding(page, { householdHousingCount: "1" });
    await expect(page.getByTestId("proviso-reason-none")).toBeVisible();
    // 1주택 맥락: 나·다목·5호 옵션도 전부 노출
    await expect(page.getByTestId("proviso-reason-overseas_migration")).toBeVisible();
    await expect(page.getByTestId("proviso-reason-pre_contract")).toBeVisible();
  });

  test("순수 2주택(일시적 특례 OFF) → 카드 숨김", async ({ page }) => {
    await gotoHolding(page, { householdHousingCount: "2", temporaryTwoHouseSpecial: false });
    await expect(page.getByTestId("proviso-reason-none")).toHaveCount(0);
  });

  test("3주택 → 카드 숨김", async ({ page }) => {
    await gotoHolding(page, { householdHousingCount: "3" });
    await expect(page.getByTestId("proviso-reason-none")).toHaveCount(0);
  });

  test("일시적 2주택 → 카드 노출(섹션③) + 나·다목·5호 옵션 부재(1·2가·3호만)", async ({ page }) => {
    await gotoHolding(page, {
      householdHousingCount: "2",
      temporaryTwoHouseSpecial: true,
      newHouseAcquisitionDate: "2024-03-01",
    });
    // 카드 노출 + 화이트리스트(1·2가·3호) 옵션 존재
    await expect(page.getByTestId("proviso-reason-none")).toBeVisible();
    await expect(page.getByTestId("proviso-reason-expropriation")).toBeVisible();
    await expect(page.getByTestId("proviso-reason-unavoidable")).toBeVisible();
    await expect(page.getByTestId("proviso-reason-rental")).toBeVisible();
    // 나·다목·5호는 옵션 필터로 부재
    await expect(page.getByTestId("proviso-reason-overseas_migration")).toHaveCount(0);
    await expect(page.getByTestId("proviso-reason-overseas_residence")).toHaveCount(0);
    await expect(page.getByTestId("proviso-reason-pre_contract")).toHaveCount(0);
  });
});
