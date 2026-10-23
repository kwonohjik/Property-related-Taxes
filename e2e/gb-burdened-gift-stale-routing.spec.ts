/**
 * E2E — 일반건물 **환산·증축을 켠 뒤 부담부증여로 전환** (PR-1 · 계획서 `docs/00-pm/gb-burdened-gift-silent-drop.plan.md` 결함 2)
 *
 * 종전: 부담부증여로 바꾸면 환산 라디오·증축 토글이 숨는데 이전에 켠 값이 ④ 라우팅을 환산 경로로 보내 §159가 조용히 무시됐다
 *       (환산 stale 총납부 56,574,760 · 증축 stale **0** — 대조 57,552,880).
 * 지금: 부담부증여는 항상 실가 payload 를 보낸다 → 두 경우 모두 stale 없는 대조값(57,552,880)이고 §159 카드가 뜬다.
 *
 * 입력은 «일반 양도 + 환산/증축 ON + 부담부증여 입력 선작성» 으로 시드하고, 양도 형태 라디오만 UI 로 전환한다(실사용 «뒤로 가서 바꾸기»).
 * 실행(워크트리): E2E_PORT=3293 npx playwright test e2e/gb-burdened-gift-stale-routing.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { seedWizard } from "./_helpers/split-acq-display";

function seed(over: Record<string, unknown>) {
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1),
            addressJibun: "서울 강남구 테스트동 1-1",
            assetKind: "general_building",
            transferType: "regular",
            acquisitionCause: "purchase",
            gbBuildingAcquisitionCause: "purchase",
            acquisitionDate: "2015-03-01",
            bgValuationMode: "sangjeungbeop_market",
            bgAcquisitionMethod: "converted",
            bgMarketValueAtTransfer: "1000000000",
            bgMortgageDebtAmount: "500000000",
            bgMortgageSetAmount: "500000000",
            bgDonorRelation: "lineal_descendant",
            gbLandArea: "100",
            gbBuildingArea: "200",
            gbBuildingFootprintArea: "50",
            gbZoneType: "general_residential",
            gbTransferLandPricePerSqm: "2000000",
            gbTransferBuildingValue: "200000000",
            gbAcqLandPricePerSqm: "1000000",
            gbAcqBuildingValue: "100000000",
            ...over,
          },
        ],
        transferDate: "2026-03-01",
        filingDate: "2026-04-30",
        contractTotalPrice: "1000000000",
        householdHousingCount: "2",
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function switchToBurdenedGiftAndCalc(page: Page) {
  await expandAssetSection(page, 2);
  await page.getByRole("radio", { name: /부담부증여 \(소령 §159\)/ }).first().click();
  const reqP = page.waitForRequest((r) => r.url().includes("/api/calc/transfer") && r.method() === "POST");
  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  const body = (await reqP).postDataJSON() as Record<string, unknown>;
  await expect(page.getByText("합산 과세 내역").first()).toBeVisible({ timeout: 60_000 });
  return body;
}

const EXT = {
  gbHasExtension: true, gbExtensionDate: "2020-05-01", gbExtensionArea: "30", gbExtensionAcquisitionCause: "purchase",
  gbExtensionAcquisitionMode: "estimated", gbTransferExtensionBuildingStdPrice: "50000000",
  gbAcquisitionExtensionBuildingStdPrice: "30000000", fixedAcquisitionPrice: "500000000",
};

test.describe("일반건물 환산·증축 stale → 부담부증여 전환", () => {
  test("ST-1 환산 선택 후 전환: 실가(§159) payload · 총납부 57,552,880 · 부담부증여 카드", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seed({ useEstimatedAcquisition: true }));
    const body = await switchToBurdenedGiftAndCalc(page);
    const gbv = body.generalBuildingValuation as Record<string, unknown>;
    expect(gbv.actualPriceMode).toBe(true);
    expect(body.burdenedGiftInfo).toBeTruthy();
    await expect(page.locator("body")).toContainText("57,552,880");
    await expect(page.locator("body")).not.toContainText("56,574,760");
  });

  test("ST-2 증축 ON 후 전환: 증축 payload 를 보내지 않는다 · 총납부 57,552,880 (종전 0)", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seed(EXT));
    const body = await switchToBurdenedGiftAndCalc(page);
    const gbv = body.generalBuildingValuation as Record<string, unknown>;
    expect(gbv.actualPriceMode).toBe(true);
    expect(gbv.extensionInfo).toBeUndefined();
    await expect(page.locator("body")).toContainText("57,552,880");
  });

  test("ST-3 [회귀 0] stale 없는 부담부증여는 그대로 57,552,880", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seed({}));
    const body = await switchToBurdenedGiftAndCalc(page);
    expect((body.generalBuildingValuation as Record<string, unknown>).actualPriceMode).toBe(true);
    await expect(page.locator("body")).toContainText("57,552,880");
  });
});
