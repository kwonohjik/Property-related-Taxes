/**
 * E2E — 함께 양도(컴패니언) **일반건물 × 부담부증여** §159 반영 (PR-2 · 계획서 `docs/00-pm/gb-burdened-gift-silent-drop.plan.md` 결함 1-b)
 *
 * 종전: 컴패니언 일반건물 카드가 일반 양도로 계산돼 취득가액 0 · 양도차익 = 채무 전부(총납부 319,671,000)였고,
 *       같은 화면의 «부담부증여 평가 명세»(증여세 카드)는 정상이라 두 카드가 서로 모순이었다.
 * 지금: 카드가 §159(채무비율 안분)로 계산한다 — K-5 총납부 139,906,800, 양도차익 494,000,000.
 *       본인 신축이면 §114조의2 가산세(건물 환산취득가 125,000,000 × 5%)가 카드마다 붙고 «확인 필요» 고지가 1회 뜬다.
 *
 * 실행(워크트리): E2E_PORT=3294 npx playwright test e2e/gb-burdened-gift-companion.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { seedWizard } from "./_helpers/split-acq-display";

const gb = (id: number, over: Record<string, unknown> = {}) => ({
  ...makeDefaultAsset(id),
  addressJibun: `서울 강남구 테스트동 ${id}-${id}`,
  assetKind: "general_building",
  acquisitionCause: "purchase",
  acquisitionDate: "2015-03-01",
  gbBuildingAcquisitionCause: "purchase",
  gbLandArea: "100", gbBuildingArea: "200", gbBuildingFootprintArea: "50", gbZoneType: "general_residential",
  gbTransferLandPricePerSqm: "2000000", gbTransferBuildingValue: "200000000",
  gbAcqLandPricePerSqm: "1000000", gbAcqBuildingValue: "100000000",
  transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000",
  bgMortgageDebtAmount: "500000000", bgMortgageSetAmount: "500000000", bgDonorRelation: "lineal_descendant", bgAcquisitionMethod: "converted",
  ...over,
});
const seed = (assets: unknown[]) => ({
  state: {
    formData: {
      assets, transferDate: "2026-03-01", filingDate: "2026-04-30", contractTotalPrice: "", householdHousingCount: "2",
      isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false,
    },
    pendingMigration: false,
  },
  version: 0,
});
const SELF = { gbBuildingAcquisitionCause: "newConstruction", hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2015-01-01", acquisitionDate: "2022-01-10" };

async function calc(page: Page) {
  const reqP = page.waitForRequest((r) => r.url().includes("/api/calc/transfer") && r.method() === "POST");
  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  const body = (await reqP).postDataJSON() as Record<string, unknown>;
  await expect(page.getByText("합산 과세 내역").first()).toBeVisible({ timeout: 60_000 });
  return body;
}

test.describe("컴패니언 일반건물 × 부담부증여", () => {
  test("GC-E1 GB+GB 전 자산 부담부증여 K-5: 총납부 139,906,800 · §159 명세와 카드가 일치", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seed([gb(1), gb(2)]));
    const body = await calc(page);
    const comp = (body.companionAssets as Record<string, unknown>[])[0];
    expect(comp.burdenedGiftInfo).toBeTruthy();
    const text = page.locator("body");
    await expect(text).toContainText("139,906,800");
    await expect(text).not.toContainText("319,671,000");
    await expect(text).toContainText("부담부증여 평가 명세 (소득세법 시행령 §159)");
    await expect(text).toContainText("494,000,000"); // 양도차익 합(카드 4장 123,500,000 × 4)
    if (process.env.E2E_SHOT_DIR) await page.screenshot({ path: `${process.env.E2E_SHOT_DIR}/gc-e1-result.png`, fullPage: true });
  });

  test("GC-E2 두 자산 모두 본인 신축: 총납부 168,872,000 · 가산세 12,500,000 · «확인 필요» 고지", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seed([gb(1, SELF), gb(2, SELF)]));
    await calc(page);
    const text = page.locator("body");
    await expect(text).toContainText("168,872,000");
    await expect(text).toContainText("12,500,000");
    await expect(text).toContainText("일반건물 부담부증여에서 양도인 본인이 신축한 건물");
  });
});

/**
 * GC-E3 함께 양도(다른 물건) 시가 평가 부담부증여 — 결과 명세 취득가액이 물건 카드 합이다
 * (계획서 `bg-bundle-card-acquisition-all.plan.md` Q-1 a · Q-2 a).
 *       일반건물 2건 · 실지 5억 / 3억 · 평가 10억 / 6억 · 채무 4억 + 1억 → 채무비율 5/16 = 31.25%: 카드 156,250,000 + 93,750,000 = 250,000,000.
 *       종전: 물건 전체 info가 첫 물건 값만 읽어 합계가 156,250,000이었다.
 */
test("GC-E3 함께 양도 시가 평가 · 실지 5억 / 3억: 결과 명세 취득가액 합계 250,000,000(종전 첫 물건 156,250,000)", async ({ page }) => {
  test.setTimeout(180_000);
  const K4 = { bgAcquisitionMethod: "actual" };
  await seedWizard(page, seed([
    gb(1, { ...K4, bgMortgageDebtAmount: "400000000", bgMortgageSetAmount: "400000000", bgActualAcquisitionLand: "250000000", bgActualAcquisitionBuilding: "250000000" }),
    gb(2, { ...K4, bgMarketValueAtTransfer: "600000000", bgMortgageDebtAmount: "100000000", bgMortgageSetAmount: "100000000", bgActualAcquisitionLand: "150000000", bgActualAcquisitionBuilding: "150000000" }),
  ]));
  await calc(page);
  await expect(page.getByTestId("bg-bundle-card")).toHaveCount(2);
  await expect(page.getByTestId("bg-bundle-acquisition-total")).toContainText("250,000,000");
  const dir = process.env.E2E_SHOT_DIR;
  if (dir) {
    const card = page.getByTestId("bg-bundle-card").first();
    await card.scrollIntoViewIfNeeded();
    for (const [name, scheme, width] of [["light", "light", 1280], ["dark", "dark", 1280], ["m375", "light", 375]] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width, height: 900 });
      await page.getByTestId("bg-bundle-acquisition-total").scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${dir}/bgall-${name}.png` });
    }
  }
});
