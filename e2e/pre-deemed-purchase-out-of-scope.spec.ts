/**
 * E2E: 의제취득일(1985.1.1.) 전 매수 — 영 §176조의2④ 범위 밖 자산 안내 (PR-4 · Q-12 a)
 * 계획서 `docs/02-design/features/realestate-pre-deemed-purchase-176-2-4.plan.md` §13.
 *
 *   PD-O1. 겸용주택 — 취득일 1984 blur → 1985-01-01 · 안내 · 입력 카드 없음
 *   PD-O2. 부담부증여 증여자 매수 · PD-O3. 일반건물 증축 · PD-O4. 소유자 분리 — 안내 · 입력 카드 없음
 *   PD-O5. 이월과세 — 증여자 취득일 입력에 따라 안내가 켜지고 꺼진다
 *   PD-O6. 다필지 — 필지 취득일 입력에 따라 안내가 켜지고 꺼진다
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

const ASSET = (o: Record<string, unknown>) => ({
  ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 7-1", acquisitionCause: "purchase", transferType: "regular", assetKind: "housing",
  acquisitionDate: "1985-01-01", actualSalePrice: "1,000,000,000", fixedSalePrice: "1,000,000,000", fixedAcquisitionPrice: "100,000,000", acquisitionArea: "200", transferArea: "200", ...o,
});

async function open(page: Page, asset: Record<string, unknown>) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), {
    state: {
      formData: { assets: [asset], contractTotalPrice: "1000000000", transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "0", isOneHousehold: false, householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true },
      pendingMigration: false,
    },
    version: 0,
  });
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await expandAssetSection(page, 3);
}
const notice = (page: Page) => page.getByTestId("pre-deemed-purchase-out-of-scope");
const card = (page: Page) => page.getByTestId("pre-deemed-purchase-card");
async function typeDate(page: Page, field: string, value: string) {
  const [y, m, d] = value.split("-");
  const inputs = page.locator(`[data-field="${field}"] input, input[data-field="${field}"]`);
  await inputs.nth(0).fill(y);
  await inputs.nth(1).fill(m);
  await inputs.nth(2).fill(d);
  await page.getByRole("heading", { name: "양도소득세 계산기" }).click();
}

test("PD-O1: 겸용주택 — 1984 blur 후 안내", async ({ page }) => {
  test.setTimeout(240_000);
  await open(page, ASSET({ isMixedUseHouse: true, acquisitionDate: "1984-06-01" }));
  await expect(notice(page)).toHaveCount(0);
  await page.locator('[data-field="acquisitionDate"] input, input[data-field="acquisitionDate"]').first().focus();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).click();
  await expect(notice(page)).toHaveAttribute("data-kind", "mixed_use");
  await expect(notice(page)).toContainText("겸용주택");
  await expect(notice(page)).toContainText("반영하지 않습니다");
  await expect(card(page)).toHaveCount(0);
});

for (const [name, kind, asset] of [
  ["PD-O2: 부담부증여 증여자 매수", "burdened_gift", { assetKind: "land", transferType: "burdened_gift" }],
  ["PD-O3: 일반건물 증축", "extension", { assetKind: "general_building", gbBuildingAcquisitionCause: "purchase", landAcquisitionDate: "1985-01-01", gbHasExtension: true }],
  ["PD-O4: 소유자 분리", "part_cause", { selfOwns: "building_only" }],
] as const) {
  test(name, async ({ page }) => {
    test.setTimeout(240_000);
    await open(page, ASSET(asset));
    await expect(notice(page)).toHaveAttribute("data-kind", kind);
    await expect(card(page)).toHaveCount(0);
  });
}

test("PD-O5: 이월과세 증여자 매수 — 증여자 취득일 따라", async ({ page }) => {
  test.setTimeout(240_000);
  await open(page, ASSET({ assetKind: "land", acquisitionCause: "carryover_gift", acquisitionDate: "2015-01-01", carryover: { ...makeDefaultAsset(1).carryover, donorAcquisitionDate: "1990-01-01", donorAcquisitionCause: "purchase" } }));
  await expect(notice(page)).toHaveCount(0);
  await typeDate(page, "carryover.donorAcquisitionDate", "1984-06-01");
  await expect(notice(page)).toHaveAttribute("data-kind", "carryover");
  await expect(notice(page)).toContainText("증여자가");
  // 덮어쓰지 않는다 — 원 입력 그대로
  const stored = await page.evaluate(() => JSON.parse(sessionStorage.getItem("transfer-tax-wizard") ?? "{}").state.formData.assets[0].carryover.donorAcquisitionDate);
  expect(stored).toBe("1984-06-01");
  await page.getByRole("radio", { name: "상속" }).last().check({ force: true });
  await expect(notice(page)).toHaveCount(0);
});

test("PD-O6: 다필지 — 필지 취득일 따라", async ({ page }) => {
  test.setTimeout(240_000);
  await open(page, ASSET({ assetKind: "land", acquisitionDate: "", parcelMode: true, parcels: [{ id: "p-0", acquisitionDate: "1990-01-01", acquisitionMethod: "actual", acquisitionPrice: "100,000,000", acquisitionArea: "100", transferArea: "100", standardPricePerSqmAtAcq: "", standardPricePerSqmAtTransfer: "", expenses: "0", capitalExpenditure: "0", transferExpense: "0", useDayAfterReplotting: false, replottingConfirmDate: "", useExchangeLandReduction: false, entitlementArea: "", allocatedArea: "", priorLandArea: "", compensationPerSqm: "", compensationBasisStdPrice: "", areaScenario: "same" }] }));
  await expect(notice(page)).toHaveCount(0);
  await typeDate(page, "parcels.0.acquisitionDate", "1984-06-01");
  await expect(notice(page)).toHaveAttribute("data-kind", "parcels");
  await typeDate(page, "parcels.0.acquisitionDate", "1985-01-01");
  await expect(notice(page)).toHaveCount(0);
});
