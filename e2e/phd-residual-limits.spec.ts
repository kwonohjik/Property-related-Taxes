/**
 * E2E — PHD 남은 한계 (계획서 docs/00-pm/phd-residual-limits-fix.plan.md · Q-1 (a) · Q-3 (b))
 *   RL-1 보조 카드 §164⑤ 준용 확인 — 취득시 건물 기준시가를 고치면 확인이 풀리고 «계산해 채우기» 버튼이 꺼진다
 *   RL-2 이월과세 «공동주택 최초고시 전 취득»(APD) — 패널에 주택 종류 라디오가 없고 공동주택(§164⑥·⑦)으로 그린다 · PHD로 바꾸면 라디오가 돌아온다
 *
 * 실행(워크트리): E2E_PORT=3311 npx playwright test e2e/phd-residual-limits.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { createDefaultTransferFormData } from "../lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "../lib/stores/calc-wizard-asset-carryover";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { seedWizard } from "./_helpers/split-acq-display";

function seed(asset: Record<string, unknown>) {
  return {
    state: {
      formData: {
        ...createDefaultTransferFormData(),
        householdNoOtherHousesConfirmed: true,
        householdNoPresaleRightsConfirmed: true,
        assets: [{ ...makeDefaultAsset(1), assetId: "rl1", addressJibun: "서울특별시 테스트구 1", assetKind: "housing", ...asset }],
        transferDate: "2026-03-01",
        filingDate: "2026-05-31",
        contractTotalPrice: "1000000000",
        householdHousingCount: "2",
        isOneHousehold: false,
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
      },
      currentStep: 0,
      pendingMigration: false,
    },
    version: 0,
  };
}
const stored = (page: Page) =>
  page.evaluate(() => JSON.parse(sessionStorage.getItem("transfer-tax-wizard") ?? "{}")?.state?.formData?.assets?.[0]);
const card = (page: Page) => page.locator('[data-asset-card-index="0"]');

test.describe("PHD 남은 한계", () => {
  test("RL-1 §164⑤ 준용 확인 — 건물 기준시가를 고치면 확인이 풀리고 버튼이 꺼진다", async ({ page }) => {
    test.setTimeout(150_000);
    await seedWizard(
      page,
      seed({
        acquisitionCause: "purchase",
        acquisitionDate: "1995-03-01",
        actualSalePrice: "1000000000",
        fixedAcquisitionPrice: "300000000",
        standardPriceAtAcq: "",
        standardPriceAtTransfer: "400000000",
        useEstimatedAcquisition: false,
        isAppraisalAcquisition: true,
        isSalesCaseAcquisition: false,
        phdFirstDisclosureDate: "2005-04-30",
        phdFirstDisclosureHousingPrice: "100000000",
        phdLandPricePerSqmAtAcq: "1000000",
        phdLandPricePerSqmAtFirst: "1100000",
        phdBuildingStdPriceAtAcq: "60000000",
        phdBuildingStdPriceAtFirst: "61000000",
        acquisitionArea: "100",
        phdAssistBuildingStdBy164_5: true,
      }),
    );
    await expandAssetSection(page, 3);
    const fill = page.getByTestId("phd-fill-button");
    await expect(fill).toBeEnabled(); // 긍정 짝 — 확인된 상태에서는 켜져 있다
    const b = page.locator('[data-field="phdBuildingStdPriceAtAcq"]').first();
    const input = (await b.evaluate((el) => el.tagName)) === "INPUT" ? b : b.locator("input").first();
    await input.click();
    await input.press("ControlOrMeta+a");
    await input.pressSequentially("62000000");
    await input.blur();
    await expect(fill).toBeDisabled();
    await expect(page.getByTestId("phd-fill-reason")).toContainText("§164⑤를 준용해 산정합니다");
    expect((await stored(page))?.phdAssistBuildingStdBy164_5).toBe(false);
    // 다시 확인하면 켜진다
    await page.getByText("§164⑤ 준용으로 산정한 금액입니다").click();
    await expect(fill).toBeEnabled();
  });

  test("RL-2 이월과세 APD — 라디오 없이 공동주택 · PHD로 바꾸면 라디오가 돌아온다", async ({ page }) => {
    test.setTimeout(150_000);
    await seedWizard(
      page,
      seed({
        acquisitionCause: "carryover_gift",
        acquisitionDate: "2021-06-01",
        standardPriceAtTransfer: "400000000",
        phdHousingType: "individual",
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
          estimationMode: "apd",
          giftDateValuation: "300000000",
        },
      }),
    );
    await expandAssetSection(page, 3);
    const housingRadios = card(page).locator('input[type="radio"][name^="housingType"]');
    await expect(card(page).locator('input[type="radio"][name^="carryoverEstimationMode"][value="apd"]')).toBeChecked();
    await expect(card(page)).toContainText("소득세법 시행령 §164⑥·⑦");
    await expect(card(page)).toContainText("최초 고시 가격(국세청장 고시 기준시가 또는 공동주택가격)");
    await expect(housingRadios).toHaveCount(0);
    // PHD로 바꾸면 라디오가 돌아오고 저장값(단독)을 따른다 — 저장값은 바뀌지 않았다
    await card(page).locator('input[type="radio"][name^="carryoverEstimationMode"][value="phd"]').check({ force: true });
    await expect(housingRadios).toHaveCount(2);
    await expect(card(page).locator('input[type="radio"][name^="housingType"][value="individual"]')).toBeChecked();
    await expect(card(page)).toContainText("소득세법 시행령 §164 ⑦");
    expect((await stored(page))?.phdHousingType).toBe("individual");
  });
});
