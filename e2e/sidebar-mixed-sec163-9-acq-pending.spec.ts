/**
 * ⑥ 사이드바 — 겸용 × 증여·상속은 계산 전 취득가액을 「계산 후 표시」로 둔다(2026-11-11).
 * 종전에는 화면에 없는 칸 값(증여 신고가액·상속 평가액 600,000,000)을 보였다 — 엔진 값은 기준시가 섹션 평가액이다.
 * route·store anchor `__tests__/api/sidebar-mixed-sec163-9-acq-pending.anchor.test.ts`.
 * 사람이 브라우저로 직접 한 수동 확인은 아니다(headless Playwright). 워크트리는 `E2E_PORT=<포트> npx playwright test <spec>`.
 */
import { test, expect } from "@playwright/test";
import { housing, seedWizard, singleSeed } from "./_helpers/split-acq-display";

const MIXED = {
  isMixedUseHouse: true, hasSeperateLandAcquisitionDate: false, landAcquisitionDate: "", residentialFloorArea: "100", nonResidentialFloorArea: "60",
  buildingFootprintArea: "100", mixedUseTotalLandArea: "200", mixedTransferHousingPrice: "600000000", mixedTransferLandPricePerSqm: "5000000",
  mixedTransferCommercialBuildingPrice: "100000000", mixedAcqHousingPrice: "300000000", mixedAcqLandPricePerSqm: "2500000",
  mixedAcqCommercialBuildingPrice: "50000000", mixedAcqHousingBuildingStdPrice: "50000000", mixedTransferHousingBuildingStdPrice: "100000000",
  mixedIsMetropolitanArea: false, actualSalePrice: "1000000000",
};

for (const [name, cause] of [
  ["증여", { acquisitionCause: "gift", acquisitionDate: "2022-10-01", donorAcquisitionDate: "2015-01-01", giftDonorRelation: "lineal", giftSameHousehold: "no", fixedAcquisitionPrice: "600000000" }],
  ["상속", { acquisitionCause: "inheritance", acquisitionDate: "2022-10-01", inheritanceStartDate: "2022-10-01", inheritanceAssetKind: "house_individual", decedentAcquisitionDate: "2015-01-01", publishedValueAtInheritance: "600000000" }],
] as const) {
  test(`SM-E: 겸용 ${name} — 계산 전 사이드바 취득가액 「계산 후 표시」 · 숨은 600,000,000 없음`, async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, singleSeed([housing({ ...MIXED, ...cause })], { contractTotalPrice: "1000000000", transferDate: "2023-09-18", filingDate: "2023-12-31" }));
    const aside = page.locator("aside");
    await expect(aside).toContainText("취득가액");
    const text = (await aside.innerText()).replace(/\s+/g, " ");
    expect(text, text).toMatch(/취득가액 계산 후 표시/);
    expect(text, text).not.toContain("600,000,000");
  });
}
