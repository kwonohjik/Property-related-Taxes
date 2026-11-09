/**
 * 축 B(지분 분할) × 부담부증여 — 지분 2 카드의 「이 지분의 취득가액을 자산 1과 따로 입력」 토글 브라우저 확인.
 * 계획서 `docs/00-pm/companion-inherit-valuation-share-vp2c.plan.md` §14 D-2 (Q-6 a · 지분 카드 토글).
 *
 * - SOA-1: 토글을 켜면 산정방식(자산 1 값으로 시작)과 이 지분 실지취득가액 칸이 열린다 → 토지 120,000,000 · 건물 180,000,000 입력 → 계산
 *   → 양도차익 438,000,000(축 A 단건 합 오라클 · anchor D2-1). 토글 끔이면 450,000,000(자산 1 값 2.5억 기준).
 * - SOA-2: 지분 카드 일반건물 안내가 숨은 「② 양도정보」가 아니라 실제 입력 위치를 가리킨다.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

const COMMON = {
  addressJibun: "제주특별자치도 강남구 테스트동 1-1", acquisitionCause: "purchase", acquisitionDate: "2015-01-01", transferType: "burdened_gift", bgDonorRelation: "lineal_descendant",
  bgValuationMode: "sangjeungbeop_market", bgLendingDepositTotal: "0", bgMortgageDebtAmount: "600000000", bgMortgageSetAmount: "600000000", bgAcquisitionMethod: "actual",
  assetKind: "general_building", bgMarketValueAtTransfer: "1000000000", standardPriceAtTransfer: "800000000", standardPriceAtAcq: "400000000",
  gbAcqLandPricePerSqm: "2000000", gbAcqBuildingValue: "200000000", gbLandArea: "100", gbBuildingArea: "300", gbBuildingFootprintArea: "135", gbZoneType: "general_residential",
  gbTransferLandPricePerSqm: "6000000", gbTransferBuildingValue: "200000000", actualSalePrice: "1600000000", gbBuildingAcquisitionCause: "purchase",
  hasSeperateLandAcquisitionDate: false, landAcquisitionDate: "2015-01-01", useEstimatedAcquisition: false, bgActualAcquisitionTotal: "",
  bgActualAcquisitionLand: "100000000", bgActualAcquisitionBuilding: "150000000",
};

async function seed(page: Page) {
  const assets = [
    { ...makeDefaultAsset(1), assetId: "p", ...COMMON, ownershipNumerator: "60", ownershipDenominator: "100" },
    { ...makeDefaultAsset(2), assetId: "s", ...COMMON, ownershipNumerator: "40", ownershipDenominator: "100" },
  ];
  const s = {
    state: {
      formData: {
        assets, assetSplitMode: "fractional", transferDate: "2026-02-16", filingDate: "2026-04-30", contractTotalPrice: "1600000000", totalTransferExpense: "0",
        householdHousingCount: "2", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isOneHousehold: false,
      },
      pendingMigration: false,
    },
    version: 0,
  };
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((x) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(x)), s);
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}
async function calc(page: Page) {
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  const resp = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  await page.getByRole("button", { name: /계산하기/ }).click();
  const r = await resp;
  expect(r.status()).toBe(200);
  return (await r.json()) as { data: { aggregated: { totalTransferGain: number } } };
}

test.describe("축 B × 부담부증여 — 지분 카드 취득가액 따로 입력", () => {
  test("SOA-1·2: 토글 켬 → 이 지분 실지취득가액 입력 → 양도차익 438,000,000 · 안내가 실제 입력 위치를 가리킨다", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page);
    const block = page.getByTestId("bg-share-own-acquisition");
    await expect(block).toHaveCount(1);
    await block.getByRole("switch", { name: /이 지분의 취득가액을 자산 1과 따로 입력/ }).click();
    // 산정방식은 자산 1 값(실지취득가액)으로 시작한다
    await expect(block.getByRole("radio", { name: /실지취득가액 안분/ })).toBeChecked();
    await block.locator('[data-field="bgActualAcquisitionLand"] input, input[data-field="bgActualAcquisitionLand"]').first().fill("120000000");
    await block.locator('[data-field="bgActualAcquisitionBuilding"] input, input[data-field="bgActualAcquisitionBuilding"]').first().fill("180000000");
    // 지분 카드 일반건물 안내 — 숨은 ② 대신 이 카드의 토글 위치
    const shareCardNotice = page.getByText("이 카드 위 「이 지분의 취득가액을 자산 1과 따로 입력」에 입력한");
    await page.getByRole("button", { name: "취득정보 매매" }).last().click();
    await expect(shareCardNotice).toBeVisible();
    const j = await calc(page);
    expect(j.data.aggregated.totalTransferGain).toBe(438_000_000);
  });

  test("SOA-3: 토글 끔(기본) — 자산 1 값으로 계산 450,000,000", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page);
    const j = await calc(page);
    expect(j.data.aggregated.totalTransferGain).toBe(450_000_000);
  });
});
