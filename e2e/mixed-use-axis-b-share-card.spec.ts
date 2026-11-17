/**
 * E2E — 겸용주택 × 지분 분할 취득(축 B) 둘째 지분 카드 (계획서 `bg-mixed-use-m2-bundle-share.plan.md` §9 · V-0 fix).
 *
 * 종전: 둘째 지분 카드는 겸용 칸이 없어 일반 주택으로 계산됐다(V-0 실측 −20,220,815). 이제 ③은 겸용 취득 칸만 열고(양도시 칸은 자산 1 값),
 * 계산은 화면 경로 anchor(`__tests__/api/mixed-use-axis-b-share-screen-path.anchor.test.ts` C)와 같은 74,332,369원이다.
 */
import { test, expect, type Page } from "@playwright/test";
import { createDefaultTransferFormData } from "../lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { withMixedHousingStd } from "./_helpers/mixed-housing-std-seed";
import { seedWithDeclaredRoster } from "./_helpers/roster-for-declared-count";

const OBJECT = {
  assetKind: "housing", isMixedUseHouse: true, mixedZoneType: "green", addressJibun: "제주특별자치도 강남구 테스트동 1-1",
  residentialFloorArea: "60", nonResidentialFloorArea: "40", buildingFootprintArea: "50", mixedUseTotalLandArea: "300",
  mixedTransferHousingPrice: "1600000000", mixedTransferCommercialBuildingPrice: "200000000", mixedTransferLandPricePerSqm: "1000000",
};
const RES = { residenceInputMode: "interval", residencePeriods: [{ moveInDate: "2015-05-01", moveOutDate: "2024-06-01" }] };
const ACQ_2009 = {
  acquisitionCause: "purchase", acquisitionDate: "2009-03-01", useEstimatedAcquisition: false,
  fixedAcquisitionPrice: "500000000", capitalExpenditure: "100000000", transferExpense: "20000000",
  mixedAcqHousingPrice: "400000000", mixedAcqCommercialBuildingPrice: "50000000", mixedAcqLandPricePerSqm: "300000",
};
const ACQ_2015 = {
  acquisitionCause: "purchase", acquisitionDate: "2015-05-01", useEstimatedAcquisition: false,
  fixedAcquisitionPrice: "900000000", capitalExpenditure: "0", transferExpense: "20000000",
  mixedAcqHousingPrice: "700000000", mixedAcqCommercialBuildingPrice: "80000000", mixedAcqLandPricePerSqm: "600000",
};

async function seed(page: Page) {
  const first = withMixedHousingStd({ ...makeDefaultAsset(1), ...OBJECT, ...RES, ...ACQ_2009, ownershipNumerator: "60", ownershipDenominator: "100" });
  // 둘째 지분 — 화면이 만든 카드처럼 겸용 칸이 없다. 취득시 주택건물 기준시가(나목)만 이 지분 값으로 둔다(취득 쪽 칸).
  const acqN = withMixedHousingStd({ ...makeDefaultAsset(2), ...OBJECT, ...ACQ_2015 }).mixedAcqHousingBuildingStdPrice;
  const second = { ...makeDefaultAsset(2), addressJibun: OBJECT.addressJibun, ...RES, ...ACQ_2015, mixedAcqHousingBuildingStdPrice: acqN, ownershipNumerator: "40", ownershipDenominator: "100" };
  const formData = {
    ...createDefaultTransferFormData(),
    assets: [first, second],
    transferDate: "2024-06-01",
    filingDate: "2024-08-31",
    contractTotalPrice: "2000000000",
    householdHousingCount: "1",
    isOneHousehold: true,
    householdNoOtherHousesConfirmed: true,
    householdNoPresaleRightsConfirmed: true,
    assetSplitMode: "fractional",
  };
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedWithDeclaredRoster({ state: { formData, currentStep: 0, pendingMigration: false }, version: 0 }),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="transfer-date"] input');
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  });
}

test("MXB-1 둘째 지분 카드 ③ — 겸용 취득 칸만 · 양도시 칸 없음 · 계산은 겸용으로(74,332,369)", async ({ page }) => {
  test.setTimeout(90_000);
  await seed(page);
  await expandAssetSection(page, 3, 1);
  const card = page.locator('[data-asset-card-index="1"] [data-asset-section="3"]');
  await expect(card.getByTestId("mixed-share-object-fields-note")).toBeVisible();
  await expect(card.locator('[data-field="mixedAcqCommercialBuildingPrice"]').first()).toBeVisible();
  await expect(card.locator('[data-field="mixedAcqLandPricePerSqm"]').first()).toBeVisible();
  await expect(card.locator('[data-field="mixedTransferHousingPrice"]')).toHaveCount(0);
  await expect(card.locator('[data-field="mixedTransferLandPricePerSqm"]')).toHaveCount(0);

  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  const res = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  const r = await res;
  expect(r.status(), await r.text()).toBe(200);
  const body = JSON.parse(r.request().postData() ?? "{}");
  expect(body.companionAssets[0].assetKind).toBe("mixed_use_house");
  const data = (await r.json()).data;
  expect(data.mode).toBe("bundled");
  expect(data.aggregated.totalTax).toBe(74_332_369);
});
