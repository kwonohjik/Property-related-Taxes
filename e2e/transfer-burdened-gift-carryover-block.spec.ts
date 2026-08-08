/**
 * E2E: **부담부증여 × 이월과세(증여)** — 차단되고, 안내가 가리키는 곳이 실제로 열려 있다
 *
 * 계획서: `docs/02-design/features/transfer-gb-inheritance-extension-3part.plan.md` §10-6
 *
 * 두 스텝이 함께 돌지만 STEP 0.48(§159)이 STEP 0.475(§97의2)의 결과를 덮어써, 이월과세
 * 입력이 세액에 도달하지 않는다(실측 71,260,000 불변). 그런데 ⑧는 그 무시되는 값을
 * **요구**했다 — 「요구하는데 무시」다.
 *
 * 취득원인을 무엇으로 골라도 §159가 취득가액을 정하므로 **세액이 같다**(네 경우 모두
 * 71,260,000). 그래서 「증여로 선택하세요」 안내는 사용자에게 손해가 없다.
 *
 *   CB-1. 부담부증여 + 이월과세 → 차단 문구가 뜬다
 *   CB-2. 취득원인을 「증여」로 바꾸면 계산까지 간다 (안내의 목적지가 열려 있다)
 *   CB-3. 일반 양도 + 이월과세는 막지 않는다 (회귀 0 · CB-1의 양성 대조군)
 *
 * ⚠️ 금액 anchor는 vitest가 담당한다
 *    (`__tests__/tax-engine/transfer-tax/burdened-gift-carryover-block.anchor.test.ts`).
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

const BLOCK_MSG = /「이월과세\(증여\)」 취득원인과 함께 쓸 수 없습니다/;

function seedForm(over: Record<string, unknown> = {}) {
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1),
            assetKind: "general_building",
            transferType: "burdened_gift",
            bgValuationMode: "sangjeungbeop_standard",
            bgLendingDepositTotal: "300000000",
            bgMortgageDebtAmount: "200000000",
            bgDonorRelation: "lineal_descendant",
            acquisitionCause: "carryover_gift",
            gbBuildingAcquisitionCause: "gift",
            acquisitionDate: "2023-06-01",
            landAcquisitionDate: "2023-06-01",
            carryover: {
              giftRegistryDate: "2023-06-01",
              donorAcquisitionDate: "2012-01-01",
              donorAcquisitionCause: "purchase",
              donorAcquisitionPrice: "100000000",
              useEstimatedAcquisition: false,
              estimationMode: "",
              giftTaxAmount: "0",
              donorCapitalExpenditure: "0",
              giftDateValuation: "600000000",
              exclusionDeclared: {},
            },
            gbLandArea: "1279",
            gbBuildingFootprintArea: "388.27",
            gbZoneType: "commercial",
            gbTransferLandPricePerSqm: "6215000",
            gbTransferBuildingValue: "631846500",
            gbAcqLandPricePerSqm: "2130000",
            gbAcqBuildingValue: "424472064",
            ...over,
          },
        ],
        transferDate: "2026-02-16",
        filingDate: "2026-04-30",
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

async function seedAndCalc(page: Page, over: Record<string, unknown> = {}) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedForm(over),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
}

test.describe("부담부증여 × 이월과세(증여) — 차단과 그 목적지", () => {
  test("CB-1: 차단 문구가 뜬다", async ({ page }) => {
    test.setTimeout(120_000);
    await seedAndCalc(page);
    await expect(page.getByText(BLOCK_MSG).first()).toBeVisible({ timeout: 20_000 });
  });

  test("CB-2: 「증여」로 바꾸면 계산까지 간다 (세액은 동일하다)", async ({ page }) => {
    test.setTimeout(120_000);
    await seedAndCalc(page, { acquisitionCause: "gift", donorAcquisitionDate: "2012-01-01" });

    await expect(page.getByText(BLOCK_MSG)).toHaveCount(0);
    await expect(page.getByText(/양도소득세 계산 결과|산출세액/).first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test("CB-3: 일반 양도 + 이월과세는 막지 않는다 (회귀 0 · CB-1의 양성 대조군)", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    // ⚠️ 이 케이스가 없으면 CB-1이 「부담부증여라서」가 아니라 다른 이유로 막힌 것과 구별되지 않는다.
    await seedAndCalc(page, { transferType: "regular" });
    await expect(page.getByText(BLOCK_MSG)).toHaveCount(0);
  });
});
