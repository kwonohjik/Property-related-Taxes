/**
 * E2E — 함께 양도(컴패니언) 자산의 이월과세 환산 방식은 「일반 기준시가 환산」만 (PR-0c, 계획서 §16)
 *
 * 종전: 컴패니언에서 개별주택가격 미공시(phd)/공동주택 최초고시 전(apd)을 골라 최초고시 칸을 채우면 ⑧은 통과하고, ④는 PHD 를 싣지 않아
 * 증여자 취득가액이 0 인 채 200 OK 로 계산됐다. 지금: 선택지가 없고, 옛 입력이 남아 있으면 안내 + ⑧ 차단(칸으로 이동) + 일반 기준시가 환산을 다시 고를 수 있다.
 *
 * 실행(워크트리): E2E_PORT=3292 npx playwright test e2e/carryover-companion-estimation-mode.spec.ts
 */
import { test, expect } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "../lib/stores/calc-wizard-asset-carryover";
import { DIRECT_RESIDENCE } from "./_helpers/residence-direct";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { seedWizard } from "./_helpers/split-acq-display";

const primary = {
  ...makeDefaultAsset(1),
  ...DIRECT_RESIDENCE,
  addressJibun: "서울 강남구 테스트동 2-2",
  regionCode: "1168010100",
  assetKind: "land",
  landNature: "standalone",
  acquisitionCause: "purchase",
  acquisitionDate: "2010-01-01",
  fixedAcquisitionPrice: "500000000",
  standardPriceAtTransfer: "1000000000",
};
const companion = (mode: "general" | "phd" | "apd") => ({
  ...makeDefaultAsset(2),
  assetId: "a2",
  addressJibun: "서울 강남구 테스트동 1-1",
  regionCode: "1168010100",
  assetKind: "housing",
  acquisitionCause: "carryover_gift",
  acquisitionDate: "2021-06-01",
  standardPriceAtTransfer: "400000000",
  phdFirstDisclosureDate: "2005-04-30",
  phdFirstDisclosureHousingPrice: "100000000",
  phdTransferHousingPrice: "400000000",
  carryover: {
    ...CARRYOVER_DEFAULTS,
    giftRegistryDate: "2021-06-01",
    donorAcquisitionDate: "2000-01-01",
    donorRelation: "lineal",
    donorSameHousehold: "no",
    useEstimatedAcquisition: true,
    estimationMode: mode,
    giftDateValuation: "300000000",
    ...(mode === "general" ? { donorStandardPriceAtAcquisition: "111111111", donorStandardPriceAtTransfer: "222222222" } : {}),
  },
});
const seed = (mode: "general" | "phd" | "apd") => ({
  state: {
    formData: {
      assets: [primary, companion(mode)],
      transferDate: "2024-03-01",
      filingDate: "2024-04-30",
      contractTotalPrice: "1800000000",
      bundledSaleMode: "apportioned",
      householdHousingCount: "2",
      householdNoOtherHousesConfirmed: true,
      householdNoPresaleRightsConfirmed: true,
      isOneHousehold: false,
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: false,
      isUnregistered: false,
    },
    pendingMigration: false,
  },
  version: 0,
});

const card = (page: import("@playwright/test").Page) => page.locator('[data-asset-card-index="1"]');
const radios = (page: import("@playwright/test").Page) => card(page).locator('input[type="radio"][name^="carryoverEstimationMode"]');

test.describe("컴패니언 이월과세 환산 방식", () => {
  test("CE-1 선택지는 일반 기준시가 환산 1개 — 옛 입력(phd)은 안내가 뜨고 다시 고를 수 있다", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seed("phd"));
    await expandAssetSection(page, 3, 1);
    await expect(radios(page)).toHaveCount(1);
    await expect(card(page).getByTestId("carryover-companion-mode-notice")).toContainText("함께 양도 자산의 이월과세는 「일반 기준시가 환산」만 지원합니다");
    await expect(card(page)).not.toContainText("최초 고시");
    await radios(page).first().check({ force: true });
    await expect(card(page).getByTestId("carryover-companion-mode-notice")).toHaveCount(0);
    const stored = await page.evaluate(() => JSON.parse(sessionStorage.getItem("transfer-tax-wizard") ?? "{}")?.state?.formData?.assets?.[1]?.carryover?.estimationMode);
    expect(stored).toBe("general");
  });

  test("CE-2 ⑧이 막는다 — 옛 입력(apd)으로 계산하려 하면 「함께 양도」 안내로 멈추고 요청이 나가지 않는다", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seed("apd"));
    let posted = false;
    page.on("request", (r) => { if (r.url().includes("/api/calc/transfer") && r.method() === "POST") posted = true; });
    await page.getByRole("button", { name: "가산세", exact: true }).first().click();
    await page.getByRole("button", { name: "세금 계산하기" }).click();
    await expect(page.getByText("함께 양도 자산의 이월과세는 「일반 기준시가 환산」만 지원합니다").first()).toBeVisible({ timeout: 30_000 });
    expect(posted).toBe(false);
  });

  test("CE-3 [회귀 0] 일반 기준시가 환산 컴패니언은 계산된다", async ({ page }) => {
    test.setTimeout(240_000);
    await seedWizard(page, seed("general"));
    const reqP = page.waitForRequest((r) => r.url().includes("/api/calc/transfer") && r.method() === "POST");
    await page.getByRole("button", { name: "가산세", exact: true }).first().click();
    await page.getByRole("button", { name: "세금 계산하기" }).click();
    const body = (await reqP).postDataJSON() as { companionAssets?: Array<{ useEstimatedAcquisition?: boolean; standardPriceAtAcquisition?: number }> };
    expect(body.companionAssets?.[0]?.useEstimatedAcquisition).toBe(true);
    expect(body.companionAssets?.[0]?.standardPriceAtAcquisition).toBe(111_111_111);
    await page.locator('[data-print-id="form-table"]').first().waitFor({ timeout: 60_000 });
  });
});
