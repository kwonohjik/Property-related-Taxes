/**
 * E2E — 분리 계산 × 이전 형식 필요경비(`directExpenses`) (2026-10-21)
 *
 * 계획서: docs/00-pm/split-v7-era-and-legacy-expense.plan.md §2 · §3.2 (Q-2 a)
 *
 * 종전: 신축 + 토지 상속 + 이전 형식 필요경비면 ⑧이 화면에 없는 취득시 기준시가 3칸을 요구해 계산할 수 없었다(양도비가 있으면 이전 형식 칸도 숨었다).
 * 지금: 「다음」 → 이전 형식 칸으로 이동(양도비가 있어도 보인다) → 칸을 비우고 토지 자본적지출 칸에 옮기면 계산된다 · 요청에 자산 단위 총액이 없다.
 *
 * 실행(워크트리): E2E_PORT=3275 npx playwright test e2e/split-legacy-expense.spec.ts
 */
import { test, expect } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { DIRECT_RESIDENCE } from "./_helpers/residence-direct";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { calculate, seedWizard } from "./_helpers/split-acq-display";

const asset = {
  ...makeDefaultAsset(1),
  ...DIRECT_RESIDENCE,
  addressJibun: "서울 강남구 테스트동 1-1",
  regionCode: "1168010100",
  assetKind: "housing",
  acquisitionCause: "newConstruction",
  occupancyApprovalDate: "2020-06-01",
  acquisitionDate: "2020-06-01",
  fixedAcquisitionPrice: "400000000",
  hasSeperateLandAcquisitionDate: true,
  landCauseHost: "newConstruction",
  landAcquisitionCause: "inheritance",
  landAcquisitionDate: "2015-03-10",
  landDecedentAcquisitionDate: "1990-04-01",
  landAcqMode: "actual",
  buildingAcqMode: "actual",
  landAcquisitionPrice: "300000000",
  actualSalePrice: "1000000000",
  saleSplitMode: "actual",
  landTransferPrice: "600000000",
  buildingTransferPrice: "400000000",
  landStandardPriceAtTransfer: "600000000",
  buildingStandardPriceAtTransfer: "400000000",
  directExpenses: "5000000", // 옛 저장 형식 — 양도비가 있어 종전엔 칸이 숨었다
  transferExpense: "1000000",
};

const seed = {
  state: {
    formData: {
      assets: [asset],
      transferDate: "2025-06-30",
      filingDate: "2025-08-31",
      contractTotalPrice: "1000000000",
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
};

// page.evaluate에는 클로저가 넘어가지 않는다 — 키는 인자로 넘긴다.
const inField = (key: string) =>
  document.activeElement instanceof HTMLElement && !!document.activeElement.closest(`[data-field="${key}"]`);

test("신축 + 토지 상속 + 이전 형식 필요경비: 이전 형식 칸으로 이동 → 토지 자본적지출로 옮기면 계산 · 요청에 총액 없음", async ({ page }) => {
  test.setTimeout(240_000);
  await seedWizard(page, seed);

  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.getByText(/이전 입력 형식으로 저장된 필요경비 5,000,000원/).first()).toBeVisible();
  await expect.poll(() => page.evaluate(inField, "directExpenses")).toBe(true);
  // 종전 막다른 길 — 화면에 없는 취득시 기준시가 칸을 요구하지 않는다
  await expect(page.getByText(/건물분 취득시 기준시가를 입력하세요/)).toHaveCount(0);

  const legacy = page.locator('[data-field="directExpenses"]').locator("input").first();
  await legacy.fill("");
  await expandAssetSection(page, 3); // 토지 자본적지출 칸은 ③ 취득 섹션(접혀 있다)
  const land = page.getByTestId("split-part-land-capex");
  await land.fill("5000000");

  const body = await calculate(page);
  expect(body.expenses).toBe(0);
  expect(body.landDirectExpenses).toBe(5_000_000);
});
