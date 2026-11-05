/**
 * 브라우저 확인(V-7 PR-2) — 부담부증여 일체 주택 신축 §114조의2 가산세 기준액 건물분: **화면 칸에 직접 입력** → 계산 → 요청 body · 결과 화면.
 *
 * 계획서: docs/02-design/features/bg-housing-114-2-building-base.plan.md §7
 * 다른 spec 은 건물분 값을 시드에 미리 넣는다. 여기서는 시드에 건물분 칸을 비워 두고 사람이 하듯 칸을 찾아 타이핑한다(⑤ → ④ → ⑫ → 엔진 → ⑦).
 *   · BV-1 본인 신축 × 환산: 채무 안분 양도가 2억 · 주택 H_acq 1억 · H_T 4억 · 1:1 안분 → base 25,000,000 · 가산세 1,250,000 (V-7 전 50,000,000 · 2,500,000)
 *   · BV-2 이월과세 당초 증여자 신축 × 환산: 채무 안분 양도가 5억 · 당초 증여자 H_acq 1.5억 · H_T 8억 · 1:1 → base 46,875,000 · 가산세 2,343,750 (V-7 전 93,750,000 · 4,687,500)
 * 스크린샷: `e2e/_artifacts/v7-browser/*.png`. headless 자동 확인이다(사람이 눈으로 본 것은 아니다).
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "../lib/stores/calc-wizard-asset-carryover";
import { DIRECT_RESIDENCE } from "./_helpers/residence-direct";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { calculate, seedWizard } from "./_helpers/split-acq-display";

const seed = (asset: Record<string, unknown>, transferDate: string) => ({
  state: {
    formData: {
      assets: [asset], transferDate, filingDate: transferDate.slice(0, 4) + "-12-31", contractTotalPrice: "",
      householdHousingCount: "2", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
      isOneHousehold: false, isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false,
    },
    pendingMigration: false,
  },
  version: 0,
});
/** `data-field` 가 입력칸 자체이거나 그 조상(FieldCard)이다 — 둘 다 다룬다 */
const typeInto = async (scope: Locator, key: string, value: string) => {
  const input = scope.locator(`[data-field="${key}"]`).locator("xpath=descendant-or-self::input").first();
  await expect(input, key).toBeVisible();
  await input.fill(value);
};
const shot = (el: Locator, name: string) => el.screenshot({ path: `e2e/_artifacts/v7-browser/${name}.png` });
const statementText = async (page: Page) => {
  const s = page.locator('[data-print-section="detailed-statement"]');
  await expect(s).toBeVisible({ timeout: 30_000 });
  const expandAll = s.getByRole("button", { name: /전체 펼치기/ });
  if (await expandAll.isVisible().catch(() => false)) await expandAll.click();
  return (await s.textContent()) ?? "";
};

test("BV-1 본인 신축 × 환산 — 건물분 카드에 직접 입력 → 가산세 1,250,000", async ({ page }) => {
  test.setTimeout(180_000);
  await seedWizard(page, seed({
    ...makeDefaultAsset(1), ...DIRECT_RESIDENCE, addressJibun: "서울 강남구 테스트동 1-1", regionCode: "1168010100",
    assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2021-01-01",
    transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "500000000",
    bgMortgageDebtAmount: "200000000", bgDonorRelation: "lineal_descendant", bgAcquisitionMethod: "converted",
    standardPriceAtTransfer: "400000000", standardPriceAtAcq: "100000000",
    isSelfBuilt: true, buildingType: "new", constructionDate: "2021-01-01",
  }, "2023-06-01"));
  await expandAssetSection(page, 3);
  const card = page.locator('[data-asset-card-index="0"] [data-testid="self-built-housing-share"]');
  await expect(card).toBeVisible();
  await expect(card.locator('[data-testid="sale-split-mode"]')).toHaveCount(0); // 부담부증여 — 양도가액 구분 없음
  await typeInto(page.locator('[data-asset-card-index="0"]'), "acquisitionArea", "100");
  await typeInto(card, "standardPricePerSqmAtAcq", "1000000");
  await typeInto(card, "buildingStandardPriceAtAcq", "100000000");
  await typeInto(card, "standardPricePerSqmAtTransfer", "1000000");
  await typeInto(card, "transferArea", "100");
  await typeInto(card, "buildingStandardPriceAtTransfer", "100000000");
  await shot(card, "bv1-input");
  const body = await calculate(page);
  expect(body.selfBuiltHousing).toEqual({
    landPricePerSqmAtAcquisition: 1_000_000, landArea: 100, buildingStdPriceAtAcquisition: 100_000_000,
    landStdPriceAtTransfer: 100_000_000, buildingStdPriceAtTransfer: 100_000_000,
  });
  expect(await statementText(page)).toContain("§114조의2 환산취득가액 가산세 1,250,000 (= 25,000,000 × 5%)");
  await shot(page.locator('[data-print-section="detailed-statement"]').getByText("§114조의2 환산취득가액 가산세").first().locator("xpath=ancestor::*[self::li or self::tr or self::div][1]"), "bv1-result");
});

test("BV-2 이월과세 당초 증여자 신축 × 환산 — 「증여자 신축」 카드의 일체 주택 칸에 직접 입력 → 가산세 2,343,750", async ({ page }) => {
  test.setTimeout(180_000);
  await seedWizard(page, seed({
    ...makeDefaultAsset(1), ...DIRECT_RESIDENCE, addressJibun: "서울 강남구 테스트동 1-1", regionCode: "1168010100",
    assetKind: "housing", acquisitionCause: "carryover_gift", acquisitionDate: "2023-06-01",
    transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "800000000",
    bgLendingDepositTotal: "300000000", bgMortgageDebtAmount: "200000000", bgDonorRelation: "lineal_descendant", bgAcquisitionMethod: "converted",
    standardPriceAtTransfer: "800000000", standardPriceAtAcq: "400000000", landStandardPriceAtTransfer: "0",
    bgActualAcquisitionTotal: "600000000", bgCoDonorLandStdPriceAtAcq: "0", bgCoDonorBuildingStdPriceAtAcq: "150000000",
    carryover: {
      ...CARRYOVER_DEFAULTS, giftRegistryDate: "2023-06-01", donorAcquisitionDate: "2000-06-01", donorAcquisitionPrice: "100000000",
      giftDateValuation: "600000000", giftTaxAmount: "0", donorRelation: "lineal", donorSameHousehold: "no",
      donorBuilt: true, donorBuiltType: "new", donorBuiltDate: "2022-01-10",
    },
  }, "2026-02-16"));
  await expandAssetSection(page, 2);
  const housing = page.locator('[data-asset-card-index="0"] [data-testid="donor-built-housing"]');
  await expect(housing).toBeVisible();
  // 양도 당시 공시지가 연도는 양도일(2026-02-16)로 자동 — 「기준일 미입력」이면 조회 버튼이 막힌다(브라우저 확인에서 발견 · 양도일 전달 누락)
  await expect(housing.getByText("기준일 미입력")).toHaveCount(0);
  await typeInto(housing, "carryover.donorBuiltLandPricePerSqm", "1000000");
  await typeInto(housing, "carryover.donorBuiltLandArea", "100");
  await typeInto(housing, "carryover.donorBuiltBuildingStdAtAcq", "100000000");
  await typeInto(housing, "standardPricePerSqmAtTransfer", "1000000");
  await typeInto(housing, "transferArea", "100");
  await typeInto(housing, "buildingStandardPriceAtTransfer", "100000000");
  await shot(housing, "bv2-input");
  const body = await calculate(page);
  const donorBuilt = (body.burdenedGiftInfo as { carryoverDonorBasis?: { donorBuilt?: Record<string, unknown> } }).carryoverDonorBasis?.donorBuilt;
  expect(donorBuilt?.housing).toEqual({
    landPricePerSqmAtAcquisition: 1_000_000, landArea: 100, buildingStdPriceAtAcquisition: 100_000_000,
    landStdPriceAtTransfer: 100_000_000, buildingStdPriceAtTransfer: 100_000_000,
  });
  await expect(page.getByTestId("donor-built-penalty-line").first()).toHaveText("가산세 2,343,750 = 46,875,000 × 5%");
  await shot(page.getByTestId("donor-built-penalty-card").first(), "bv2-result");
});
