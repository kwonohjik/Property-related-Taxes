/**
 * 합가 §155④⑤ 비과세 — 먼저양도 토글 노출 E2E.
 *
 * 합가일 입력 시 "세대 내 먼저 양도하는 주택" 토글이 노출(비과세 "먼저 양도" 요건).
 * 계획서: docs/02-design/features/transfer-155-2-4-5-exemption-gap.plan.md Tier 1.
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
            acquisitionDate: "2018-01-01",
          },
        ],
        transferDate: "2025-06-01",
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

test.describe("합가 §155④⑤ 먼저양도 토글", () => {
  test("혼인합가일 입력 시 '세대 내 먼저 양도' 토글 노출", async ({ page }) => {
    await gotoHolding(page, { marriageDate: "2020-01-01" });
    await expect(page.getByRole("switch", { name: "세대 내 먼저 양도하는 주택" })).toBeVisible();
  });

  test("합가일 미입력 시 토글 미노출", async ({ page }) => {
    await gotoHolding(page, {});
    await expect(page.getByRole("switch", { name: "세대 내 먼저 양도하는 주택" })).toHaveCount(0);
  });
});
