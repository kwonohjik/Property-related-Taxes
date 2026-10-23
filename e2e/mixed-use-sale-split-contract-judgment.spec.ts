/**
 * 공유지분 겸용주택 §100③ — 계약서(100%) 금액으로 판정 (SSJ-3)
 *
 * 계획서: docs/00-pm/sale-split-100-3-share-scale-judgment.plan.md PR-3 · 짝 anchor
 *   __tests__/api/transfer.route.mixed-use-sale-split-contract-judgment.anchor.test.ts (시료 A).
 * 1/3 지분 · 계약서 토지 76,842,102 / 건물 123,157,898 — 100%는 「불분명」, 종전 지분 몫 판정은 「구분 기재 적용」이었다.
 * 상가건물 기준시가는 63,000,003이다(route anchor와 같은 시료).
 *
 * worktree 실행: E2E_PORT=3131 npx playwright test e2e/mixed-use-sale-split-contract-judgment.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { createDefaultTransferFormData } from "../lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

/** 사례 p.772 — 주택 30㎡ · 상가 70㎡ 단층 · 부수토지 400㎡(도시지역 밖). 토지 2020-12-01 / 건물 2023-03-20 별개 취득 · 양쪽 실거래가. */
function caseAsset(over: Record<string, unknown> = {}) {
  return {
    ...makeDefaultAsset(1),
    assetId: "sb1",
    addressJibun: "경기 테스트군 테스트면 1-1",
    assetKind: "housing",
    acquisitionCause: "purchase",
    isMixedUseHouse: true,
    hasSeperateLandAcquisitionDate: true,
    landAcquisitionDate: "2020-12-01",
    acquisitionDate: "2023-03-20",
    residentialFloorArea: "30",
    nonResidentialFloorArea: "70",
    mixedUseTotalLandArea: "400",
    buildingFootprintArea: "100",
    mixedZoneType: "agriculture_forest",
    mixedIsMetropolitanArea: false,
    mixedTransferHousingPrice: "57000000",
    mixedTransferLandPricePerSqm: "250000",
    mixedTransferCommercialBuildingPrice: "63000000",
    mixedTransferHousingBuildingStdPrice: "27000000",
    mixedAcqHousingPrice: "30000000",
    mixedAcqLandPricePerSqm: "100000",
    mixedAcqLandPricePerSqmAtBuildingAcq: "100000",
    mixedAcqCommercialBuildingPrice: "42000000",
    mixedAcqHousingBuildingStdPrice: "18000000",
    mixedAcqPerPartMode: true,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landAcquisitionPrice: "50000000",
    buildingAcquisitionPrice: "70000000",
    actualSalePrice: "200000000",
    ...over,
  } as Record<string, unknown>;
}

function formOf(assets: Record<string, unknown>[]) {
  return {
    ...createDefaultTransferFormData(),
    householdNoOtherHousesConfirmed: true,
    householdNoPresaleRightsConfirmed: true,
    assets,
    transferDate: "2026-07-01",
    filingDate: "2026-09-30",
    contractTotalPrice: "200000000",
    householdHousingCount: "1",
    // 상가분 양도소득금액(52,137,000)은 주택분 비과세 여부와 무관하다 — 1세대 판정이 요구하는 거주 구간 입력을 피한다.
    isOneHousehold: false,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
  };
}

async function seedForm(page: Page, formData: Record<string, unknown>) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    { state: { formData, currentStep: 0, pendingMigration: false }, version: 0 },
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="transfer-date"] input');
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  });
}

test("SSJ-3 겸용 1/3 지분 · 계약서 +30% 경계 → 계약서로 판정해 「불분명」 · 판정 금액 안내", async ({ page }) => {
  test.setTimeout(180_000);
  await seedForm(page, formOf([caseAsset({
    mixedTransferCommercialBuildingPrice: "63000003",
    ownershipNumerator: "1",
    ownershipDenominator: "3",
    ownershipRemainderThirdParty: "yes",
    saleSplitMode: "actual",
    landTransferPrice: "76842102",
    buildingTransferPrice: "123157898",
  })]));

  const reqPromise = page.waitForRequest((r) => r.url().includes("/api/calc/transfer") && r.method() === "POST");
  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  const mixed = ((await reqPromise).postDataJSON() as { mixedUse: Record<string, number> }).mixedUse;
  expect(mixed.contractLandTransferPrice).toBe(76_842_102);
  expect(mixed.contractBuildingTransferPrice).toBe(123_157_898);
  expect(mixed.landTransferPrice).toBe(25_614_034);

  await expect(page.getByTestId("mixed-sale-split-fallback")).toContainText("30% 이상", { timeout: 30_000 });
  const note = page.getByTestId("mixed-sale-split-contract");
  await expect(note).toContainText("76,842,102");
  await expect(note).toContainText("123,157,898");
  await expect(note).toContainText("33.33%");
  await expect(page.getByTestId("mixed-sale-split-result")).toHaveCount(0);
});
