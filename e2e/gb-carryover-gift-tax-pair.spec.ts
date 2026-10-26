/**
 * E2E — 일반 양도 일반건물 × 이월과세 — 증여세 산출세액·과세가액 중 하나만 넣으면 ⑧이 막고 빈 칸으로 이동한다
 *
 * 수정 前(브라우저 실측 2026-10-26): 산출세액만 넣어도 그대로 계산돼 전송 상당액 0 · 163,932,000(증여세 없음과 같다). 짝이면 160,572,000.
 * vitest anchor: `__tests__/api/transfer.route.gb-carryover-gift-tax-pair.anchor.test.ts`
 *
 * 실행(워크트리): E2E_PORT=3295 npx playwright test e2e/gb-carryover-gift-tax-pair.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "../lib/stores/calc-wizard-asset-carryover";
import { calculate, seedWizard } from "./_helpers/split-acq-display";
import { expandAssetSection } from "./_helpers/expandAssetSection";

const CO = { ...CARRYOVER_DEFAULTS, giftRegistryDate: "2021-03-01", donorAcquisitionDate: "2005-06-15", donorAcquisitionPrice: "150000000", giftTaxAmount: "", giftDateValuation: "400000000", donorRelation: "lineal" };
const asset = {
  ...makeDefaultAsset(1), assetLabel: "자산 1", addressJibun: "서울 강남구 테스트동 1-1", assetKind: "general_building",
  acquisitionCause: "carryover_gift", gbBuildingAcquisitionCause: "purchase", acquisitionDate: "2021-03-01", landAcquisitionDate: "2021-03-01",
  useEstimatedAcquisition: true, landAcqMode: "estimated", buildingAcqMode: "estimated",
  gbLandArea: "100", gbBuildingArea: "200", gbBuildingFootprintArea: "50", gbTransferLandPricePerSqm: "2000000", gbTransferBuildingValue: "200000000",
  gbZoneType: "general_residential", gbAcqLandPricePerSqm: "1000000", gbAcqBuildingValue: "100000000", carryover: CO,
};
const seed = {
  state: {
    formData: {
      assets: [asset], transferDate: "2024-03-01", filingDate: "2024-05-31", contractTotalPrice: "1000000000", totalTransferExpense: "0",
      householdHousingCount: "2", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isOneHousehold: false,
      isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false,
    },
    pendingMigration: false,
  },
  version: 0,
};

/** 총 양도가액(「2 양도」)은 시드 복원에서 비므로 화면에서 넣고, 「3 취득」에서 증여세 칸을 채운다. */
async function prepare(page: Page, calc: string, base: string) {
  await seedWizard(page, seed);
  await expandAssetSection(page, 2, 0);
  const tp = page.locator('[data-field="contractTotalPrice"] input, input[data-field="contractTotalPrice"]').filter({ visible: true }).first();
  if (!(await tp.inputValue())) await tp.fill("1000000000");
  await expandAssetSection(page, 3, 0);
  const card = page.locator('[data-asset-card-index="0"]');
  const input = (f: string) => card.locator(`[data-field="${f}"] input, input[data-field="${f}"]`).first();
  if (calc) await input("carryover.giftTaxCalculated").fill(calc);
  if (base) await input("carryover.giftTaxBase").fill(base);
}
const focusedIn = (page: Page, field: string) =>
  page.evaluate((f) => !!(document.activeElement as HTMLElement | null)?.closest(`[data-field="${f}"]`), field);

test.describe("일반 양도 일반건물 × 이월과세 — 증여세 짝", () => {
  test("GBGP-E1 산출세액만 → «다음»이 막히고 과세가액 칸으로 이동", async ({ page }) => {
    test.setTimeout(180_000);
    await prepare(page, "30000000", "");
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect.poll(() => focusedIn(page, "carryover.giftTaxBase")).toBe(true);
  });

  test("GBGP-E2 과세가액만 → 산출세액 칸으로 이동", async ({ page }) => {
    test.setTimeout(180_000);
    await prepare(page, "", "1000000000");
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect.poll(() => focusedIn(page, "carryover.giftTaxCalculated")).toBe(true);
  });

  test("GBGP-E3 짝 3천만·10억 → 계산되고 160,572,000 · 산출세액 0 + 과세가액도 계산된다(163,932,000)", async ({ page }) => {
    test.setTimeout(180_000);
    await prepare(page, "30000000", "1000000000");
    await calculate(page);
    await expect(page.locator('[data-print-id="form-table"]').first()).toContainText("160,572,000");
    await prepare(page, "0", "1000000000");
    await calculate(page);
    await expect(page.locator('[data-print-id="form-table"]').first()).toContainText("163,932,000");
  });
});
