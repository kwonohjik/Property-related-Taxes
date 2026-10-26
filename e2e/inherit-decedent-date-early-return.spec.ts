/**
 * 상속 자산 — 피상속인 취득일 비움 (계획서 `docs/02-design/features/inherit-decedent-date-early-return.plan.md`)
 *
 *   DE-1 겸용주택 상속 · 피상속인 취득일 비움 — 종전에는 ⑧이 통과해 서버가 400(피상속인 취득일 필수)을 냈다. 지금: 「계산하기」에서 막히고 요청 없음.
 *   DE-2 토지 상속 · 다필지 · 피상속인 취득일 비움 — 같은 증상(다필지 분기가 일반 상속 분기보다 먼저 끝났다). 지금: 막힘.
 *   DE-3 DE-1에 피상속인 취득일을 채움 → 요청이 나가고 200.
 * 사람이 브라우저로 직접 한 수동 확인은 아니다(headless Playwright). 워크트리는 `E2E_PORT=<포트> npx playwright test <spec>`.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

const MIXED = {
  ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 8-8", assetKind: "housing", mixedAcqPerPartMode: false, acquisitionDate: "2010-03-15",
  isMixedUseHouse: true, residentialFloorArea: "100", nonResidentialFloorArea: "100", mixedUseTotalLandArea: "200", buildingFootprintArea: "100",
  mixedTransferHousingPrice: "600000000", mixedTransferLandPricePerSqm: "5000000", mixedTransferCommercialBuildingPrice: "100000000",
  mixedTransferHousingBuildingStdPrice: "100000000", mixedAcqHousingPrice: "300000000", mixedAcqLandPricePerSqm: "2500000",
  mixedAcqCommercialBuildingPrice: "50000000", mixedAcqHousingBuildingStdPrice: "50000000", mixedIsMetropolitanArea: true,
  actualSalePrice: "1500000000", acquisitionCause: "inheritance", inheritanceStartDate: "2010-03-15", decedentAcquisitionDate: "",
  mixedHousingInheritedValueOverride: "350000000", mixedCommercialInheritedValueOverride: "350000000",
};
const PARCEL = {
  ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "land", acquisitionCause: "inheritance", acquisitionDate: "2015-01-01",
  decedentAcquisitionDate: "", actualSalePrice: "500000000", publishedValueAtInheritance: "300000000", inheritanceValuationMethod: "supplementary",
  standardPriceAtTransfer: "400000000", fixedAcquisitionPrice: "", acquisitionArea: "100", transferArea: "100", parcelMode: true,
  parcels: [{
    id: "p1", acquisitionDate: "2015-01-01", acquisitionMethod: "actual", acquisitionPrice: "300000000", acquisitionArea: "100", transferArea: "100",
    standardPricePerSqmAtAcq: "1000000", standardPricePerSqmAtTransfer: "2000000", expenses: "0", capitalExpenditure: "0", transferExpense: "0",
    useDayAfterReplotting: false, replottingConfirmDate: "", useExchangeLandReduction: false, entitlementArea: "", allocatedArea: "", priorLandArea: "",
    compensationPerSqm: "", compensationBasisStdPrice: "",
  }],
};
const form = (asset: { actualSalePrice: string } & Record<string, unknown>) => ({
  state: {
    formData: {
      assets: [asset], transferDate: "2023-02-16", filingDate: "2023-04-30", contractTotalPrice: asset.actualSalePrice, householdHousingCount: "0",
      householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isOneHousehold: false, isRegulatedArea: false,
      wasRegulatedAtAcquisition: false, isUnregistered: false,
    },
    pendingMigration: false,
  },
  version: 0,
});

async function seed(page: Page, s: unknown) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate((x) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(x)), s);
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

async function goToCalculate(page: Page) {
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  await page.getByRole("button", { name: /계산하기/ }).last().click();
}

function watchPost(page: Page) {
  const seen = { posted: false };
  page.on("request", (r) => { if (r.url().includes("/api/calc/transfer") && r.method() === "POST") seen.posted = true; });
  return seen;
}

test.describe("상속 자산 — 피상속인 취득일 · 조기 종료 분기", () => {
  for (const [id, name, asset] of [["DE-1", "겸용주택 상속", MIXED], ["DE-2", "토지 상속 다필지", PARCEL]] as const) {
    test(`${id}: ${name} · 피상속인 취득일 비움 → 계산하기에서 막히고 요청 없음`, async ({ page }) => {
      test.setTimeout(180_000);
      await seed(page, form(asset));
      const seen = watchPost(page);
      await goToCalculate(page);
      await expect(page.getByText("피상속인 취득일을 입력하세요", { exact: false }).first()).toBeVisible();
      await page.waitForTimeout(1_000);
      expect(seen.posted).toBe(false);
    });
  }

  test("DE-3: 겸용주택 상속 · 피상속인 취득일 채움 → 요청이 나가고 200", async ({ page }) => {
    test.setTimeout(180_000);
    await seed(page, form({ ...MIXED, decedentAcquisitionDate: "2000-01-01" }));
    const res = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 120_000 });
    await goToCalculate(page);
    expect((await res).status()).toBe(200);
  });
});
