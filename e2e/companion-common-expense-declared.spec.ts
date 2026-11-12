/**
 * E2E — Q-5: 함께 양도(토지 2건) × 총 양도비 20,000,000 × 주 자산 자본적지출 20,000,000 (2026-11-12).
 * 화면 → ④ → ⑫ → 엔진까지 총 양도비의 주 자산 몫(4억:3억 → 11,428,571)이 자본적지출과 함께 필요경비에 들어가는지 응답으로 확인한다.
 * 수정 전: 주 자산 필요경비 20,000,000(몫 소실) · 세액 108,831,428. 수정 후: 31,428,571 · 105,540,000.
 * 단위 anchor: `__tests__/api/transfer.route.companion-common-expense-declared.anchor.test.ts`.
 */
import { test, expect } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { seedWithDeclaredRoster } from "./_helpers/roster-for-declared-count";

const land = (id: number, sale: string, over: Record<string, unknown> = {}) => ({
  ...makeDefaultAsset(id), addressJibun: `서울 강남구 테스트동 ${id}-${id}`, assetKind: "land", acquisitionCause: "purchase", acquisitionDate: "2012-01-01",
  acquisitionArea: "100", transferArea: "100", landNature: "standalone", standardPriceAtAcq: "100000000", standardPriceAtTransfer: "200000000",
  actualSalePrice: sale, fixedAcquisitionPrice: "100000000", ...over,
});

test("Q5-E1 주 자산 자본적지출 + 총 양도비 — 몫이 필요경비에 들어간다", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((assets) => {
    sessionStorage.setItem("transfer-tax-wizard", JSON.stringify({
      state: {
        formData: {
          assets, assetSplitMode: "companion", bundledSaleMode: "actual", contractTotalPrice: "700000000", totalTransferExpense: "20000000",
          transferDate: "2026-02-16", filingDate: "2026-05-31", isOneHousehold: false, householdHousingCount: "0",
          householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false,
        },
        pendingMigration: false,
      },
      version: 0,
    }));
  }, [land(1, "400000000", { capitalExpenditure: "20000000" }), land(2, "300000000")]);
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  const responsePromise = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST");
  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  const res = await responsePromise;
  expect(res.status()).toBe(200);
  const j = await res.json();
  const props = j.data.aggregated.properties as { necessaryExpense: number }[];
  expect(props.map((p) => p.necessaryExpense)).toEqual([31_428_571, 8_571_429]);
  expect(j.data.aggregated.calculatedTax).toBe(105_540_000);
});

/**
 * Q5-E2 부담부증여 토지 2건(시가 각 10억 · 채무 3억 · K-4 실지 2.5억) × 총 양도비 20,000,000 — §159 안분은 선언 채널만 읽어 몫이 통째로 버려졌다.
 * 수정 전: 필요경비 [0, 0] · 세액 113,460,000. 수정 후: 몫 1천만 × 채무비율 0.3 = [3,000,000, 3,000,000] · 111,588,000.
 */
test("Q5-E2 부담부증여 묶음 × 총 양도비 — 몫이 채무비율만큼 필요경비에 들어간다", async ({ page }) => {
  test.setTimeout(90_000);
  const bgLand = (id: number) => ({
    ...makeDefaultAsset(id), assetId: `bg${id}`, addressJibun: `제주특별자치도 강남구 테스트동 ${id}-${id}`, assetKind: "land", acquisitionCause: "purchase", acquisitionDate: "2015-01-01",
    transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000",
    bgLendingDepositTotal: "0", bgMortgageDebtAmount: "300000000", bgMortgageSetAmount: "300000000", bgAcquisitionMethod: "actual", bgActualAcquisitionLand: "250000000",
    standardPriceAtTransfer: "800000000", standardPriceAtAcq: "400000000", landAreaM2: "100", landNature: "independent", companionLandNature: "independent",
  });
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((assets) => {
    sessionStorage.setItem("transfer-tax-wizard", JSON.stringify({
      state: {
        formData: {
          assets, assetSplitMode: "companion", bundledSaleMode: "actual", contractTotalPrice: "2000000000", totalTransferExpense: "20000000",
          transferDate: "2026-02-16", filingDate: "2026-04-30", isOneHousehold: false, householdHousingCount: "2",
          householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false,
        },
        pendingMigration: false,
      },
      version: 0,
    }));
  }, [bgLand(1), bgLand(2)]);
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  const responsePromise = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST");
  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  const res = await responsePromise;
  expect(res.status()).toBe(200);
  const j = await res.json();
  expect((j.data.aggregated.properties as { necessaryExpense: number }[]).map((p) => p.necessaryExpense)).toEqual([3_000_000, 3_000_000]);
  expect(j.data.aggregated.calculatedTax).toBe(111_588_000);
});

/**
 * Q5-E3 겸용 컴패니언 × 총 양도비 20,000,000 — 겸용 엔진은 `mixedUse.transferExpense`만 읽어 몫이 버려졌다(수정 전 과세표준 445,300,002).
 * 수정 후: 자산 칸 양도비 1천만씩 직접 입력과 같은 438,300,003. 시료는 `transfer.route.companion-mixed-use` 와 같다(주택 + 겸용 · 기준시가 같게 50:50).
 */
test("Q5-E3 겸용 컴패니언 × 총 양도비 — 몫이 겸용 양도비로 들어간다", async ({ page }) => {
  test.setTimeout(90_000);
  const base = { acquisitionCause: "purchase", acquisitionDate: "2015-03-01", useEstimatedAcquisition: false, fixedAcquisitionPrice: "300000000",
    actualSalePrice: "600000000", standardPriceAtTransfer: "500000000", standardPriceAtAcq: "250000000" };
  const mixed = { isMixedUseHouse: true, acquisitionDate: "2009-03-01", residentialFloorArea: "60", nonResidentialFloorArea: "40", buildingFootprintArea: "50",
    mixedUseTotalLandArea: "600", mixedZoneType: "general_residential", mixedTransferHousingPrice: "900000000", mixedTransferCommercialBuildingPrice: "300000000",
    mixedTransferLandPricePerSqm: "2000000", mixedAcqHousingPrice: "300000000", mixedAcqCommercialBuildingPrice: "100000000", mixedAcqLandPricePerSqm: "1000000",
    mixedAcqHousingBuildingStdPrice: "1", mixedTransferHousingBuildingStdPrice: "180000000" };
  const assets = [
    { ...makeDefaultAsset(1), addressJibun: "제주특별자치도 강남구 테스트동 1-1", assetKind: "housing", ...base },
    { ...makeDefaultAsset(2), addressJibun: "제주특별자치도 강남구 테스트동 2-2", assetKind: "housing", ...base, ...mixed },
  ];
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  const seed = seedWithDeclaredRoster({
    state: {
      formData: {
        assets, assetSplitMode: "companion", bundledSaleMode: "actual", contractTotalPrice: "1200000000", totalTransferExpense: "20000000",
        transferDate: "2024-06-01", filingDate: "2024-08-31", isOneHousehold: false, householdHousingCount: "2",
        householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false,
      },
      pendingMigration: false,
    },
    version: 0,
  });
  await page.evaluate((sd) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(sd)), seed);
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  const responsePromise = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST");
  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  const res = await responsePromise;
  expect(res.status()).toBe(200);
  const j = await res.json();
  expect(j.data.aggregated.taxBase).toBe(438_300_003);
});
