/**
 * 다건 합산 — 일반건물 지분 분할 취득(60% · 40%)을 같은 해 아파트와 함께 계산한다
 * (계획서 `docs/00-pm/multi-carryover-bg-gb-shares.plan.md` 트랙 GS — 종전에는 「한 건 내 다자산 일괄양도는 단건 계산기에서만 지원됩니다.」로 막혔다).
 *
 *   MGS-E1 차단 문구 없음 → 「세액 계산」 200 · 본문 `properties[0].generalBuildingShares` 2건 ·
 *          응답 카드 id 복합 접미사(`land#<항목 id>.<지분번호>` — Q-2 a) · 결과는 일반건물 1행이고 펼치면 두 지분의 카드가 보인다.
 *   MGS-E2 지분 × 부담부증여 → 200 · 본문 지분별 §159(채무 지분 안분)·물건 전체 §159 · 결과 일반건물 행에 §159 명세 카드.
 *   MGS-E3 지분 × 부담부증여 × 이월과세(둘째 지분 · A 채택) → 200 · 본문 지분 `carryoverTaxation`(최상위 없음) · 단위 키 복합 접미사 ·
 *          결과 일반건물 행에 그 지분의 [A]/[B] 비교 카드(트랙 GB-BG-CO — 단건 68,061,400과 같은 입력은 anchor GS-6b).
 * 사람이 브라우저로 직접 한 수동 확인은 아니다(headless Playwright). 워크트리는 `E2E_PORT=<포트> npx playwright test <spec>`.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { seedWithDeclaredRoster } from "./_helpers/roster-for-declared-count";

const GB = {
  addressJibun: "인천 서구 테스트동 9-9", regionCode: "2826010100", assetKind: "general_building", acquisitionCause: "purchase",
  gbBuildingAcquisitionCause: "purchase", useEstimatedAcquisition: true, landAcqMode: "estimated", buildingAcqMode: "estimated",
  gbLandArea: "100", gbBuildingArea: "200", gbBuildingFootprintArea: "50", gbTransferLandPricePerSqm: "2,000,000",
  gbTransferBuildingValue: "200,000,000", gbAcqLandPricePerSqm: "1,000,000", gbAcqBuildingValue: "100,000,000",
  gbZoneType: "general_residential", actualSalePrice: "1000000000",
};
const SHARES = [
  { ...makeDefaultAsset(1), ...GB, acquisitionDate: "2009-03-01", ownershipNumerator: "60", ownershipDenominator: "100" },
  { ...makeDefaultAsset(2), ...GB, acquisitionDate: "2015-03-01", ownershipNumerator: "40", ownershipDenominator: "100" },
];
const APT = {
  ...makeDefaultAsset(1), addressJibun: "인천 서구 테스트동 2-2", regionCode: "2826010100", assetKind: "housing",
  actualSalePrice: "900000000", fixedSalePrice: "900000000", acquisitionCause: "purchase", acquisitionDate: "2018-02-01",
  fixedAcquisitionPrice: "600000000",
};
const formOf = (assets: Record<string, unknown>[], transferDate: string, price: string, extra: Record<string, unknown> = {}) => ({
  assets, transferDate, filingDate: "", contractTotalPrice: price, totalTransferExpense: "0",
  householdHousingCount: "2", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isOneHousehold: false,
  isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, ...extra,
});

async function seedMulti(page: Page, forms: Record<string, unknown>[]) {
  await page.goto("/calc/transfer-tax/multi");
  await page.waitForTimeout(2000);
  await page.evaluate(
    ([fs]) => {
      const raw = sessionStorage.getItem("multi-transfer-tax-wizard");
      if (!raw) throw new Error("persist entry 없음");
      const parsed = JSON.parse(raw);
      parsed.state.form.taxYear = 2024;
      parsed.state.form.properties = fs.map((f: unknown, i: number) => ({
        propertyId: `mgs-${i + 1}`, propertyLabel: `양도 ${i + 1}번`, form: f, completionPercent: 100,
      }));
      parsed.state.form.activePropertyIndex = 0;
      parsed.state.form.activeStep = "settings";
      sessionStorage.setItem("multi-transfer-tax-wizard", JSON.stringify(parsed));
    },
    [forms.map((f) => seedWithDeclaredRoster(f))],
  );
  await page.reload();
  await page.waitForTimeout(1500);
}

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

test("MGS-E1: 다건 — 일반건물 지분 분할(60%·40%) + 아파트 → 계산되고 일반건물 1행에 두 지분 카드가 묶인다", async ({ page }) => {
  test.setTimeout(150_000);
  await seedMulti(page, [
    formOf(SHARES, "2024-06-01", "1000000000", { assetSplitMode: "fractional" }),
    formOf([APT], "2024-09-01", "900000000"),
  ]);
  await expect(page.getByText(/한 건 내 다자산 일괄양도는 단건 계산기에서만 지원/)).toHaveCount(0);

  const resp = page.waitForResponse((r) => r.url().includes("/api/calc/transfer/multi") && r.request().method() === "POST", { timeout: 30_000 });
  await page.getByRole("button", { name: "세액 계산" }).click();
  const r = await resp;
  const json = (await r.json()) as Loose;
  const sent = r.request().postDataJSON() as Loose;
  expect(r.status(), JSON.stringify(json).slice(0, 400)).toBe(200);
  expect(sent.properties?.[0]?.generalBuildingShares).toHaveLength(2);
  const ids = (json.data?.properties as Loose[]).map((p) => p.propertyId);
  expect(ids).toEqual(["land#mgs-1.0", "building#mgs-1.0", "land#mgs-1.1", "building#mgs-1.1", "mgs-2"]);

  const group = page.getByTestId("multi-gb-group-mgs-1");
  await expect(group).toBeVisible({ timeout: 15_000 });
  await group.getByText("양도 1번").click();
  await expect(group.getByText(/자산 1/).first()).toBeVisible();
  await expect(group.getByText(/자산 2/).first()).toBeVisible();
});

/** 지분 × 부담부증여(트랙 GS-BG) — 단건 축 B와 같은 지분 §159 카드 · 물건 전체 §159·증여세 명세 1회(단건 59,564,296과 같은 입력은 anchor GS-6). */
const BG = {
  transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1,000,000,000", bgMortgageDebtAmount: "300,000,000",
  bgDonorRelation: "lineal_descendant", bgAcquisitionMethod: "actual", landAcqMode: "actual", buildingAcqMode: "actual", useEstimatedAcquisition: false,
  bgActualAcquisitionLand: "60,000,000", bgActualAcquisitionBuilding: "60,000,000",
};

test("MGS-E2: 다건 — 일반건물 지분 분할 × 부담부증여 → 계산되고 일반건물 행에 물건 전체 §159 명세 카드가 뜬다", async ({ page }) => {
  test.setTimeout(150_000);
  await seedMulti(page, [
    formOf([{ ...SHARES[0], ...BG }, { ...SHARES[1], transferType: "burdened_gift" }], "2024-06-01", "1000000000", { assetSplitMode: "fractional" }),
  ]);
  await expect(page.getByText(/단건 계산기에서만 지원/)).toHaveCount(0);

  const resp = page.waitForResponse((r) => r.url().includes("/api/calc/transfer/multi") && r.request().method() === "POST", { timeout: 30_000 });
  await page.getByRole("button", { name: "세액 계산" }).click();
  const r = await resp;
  const json = (await r.json()) as Loose;
  const sent = r.request().postDataJSON() as Loose;
  expect(r.status(), JSON.stringify(json).slice(0, 400)).toBe(200);
  const p0 = sent.properties?.[0];
  expect(p0?.transferType).toBe("burdened_gift");
  expect(p0?.burdenedGiftWholeInfo?.mortgageDebtAmount).toBe(300_000_000);
  expect((p0?.generalBuildingShares as Loose[]).map((s) => s.burdenedGiftInfo?.mortgageDebtAmount)).toEqual([180_000_000, 120_000_000]);
  expect(json.data?.totalTax).toBe(59_564_296);
  expect(json.data?.generalBuildingDetailsByAsset?.["mgs-1"]?.burdenedGiftBreakdown?.assumedDebtAmount).toBe(300_000_000);

  const group = page.getByTestId("multi-gb-group-mgs-1");
  await expect(group).toBeVisible({ timeout: 15_000 });
  await expect(group.getByText("부담부증여 평가 명세 (소득세법 시행령 §159)").first()).toBeAttached();
});

/** 지분 × 부담부증여 × 이월과세(트랙 GB-BG-CO) — anchor GS-6b의 A 채택 시료와 같은 입력. */
const CO_SHARE = {
  ...BG, acquisitionCause: "carryover_gift", gbBuildingAcquisitionCause: "carryover_gift", acquisitionDate: "2021-06-01",
  bgActualAcquisitionLand: "40,000,000", bgActualAcquisitionBuilding: "40,000,000",
  bgCoDonorActualAcquisitionLand: "5,000,000", bgCoDonorActualAcquisitionBuilding: "5,000,000",
  carryover: {
    ...makeDefaultAsset(2).carryover, giftRegistryDate: "2021-06-01", donorAcquisitionDate: "2019-01-01", donorAcquisitionPrice: "10000000",
    useEstimatedAcquisition: false, giftTaxAmount: "0", donorCapitalExpenditure: "", giftDateValuation: "300000000", donorRelation: "spouse", donorSameHousehold: "no",
  },
};

test("MGS-E3: 다건 — 지분 × 부담부증여 × 이월과세 → 계산되고 일반건물 행에 그 지분의 [A]/[B] 비교 카드가 뜬다", async ({ page }) => {
  test.setTimeout(150_000);
  await seedMulti(page, [
    formOf([{ ...SHARES[0], ...BG }, { ...SHARES[1], ...CO_SHARE }], "2024-06-01", "1000000000", { assetSplitMode: "fractional" }),
  ]);
  await expect(page.getByText(/단건 계산기에서만 지원/)).toHaveCount(0);

  const resp = page.waitForResponse((r) => r.url().includes("/api/calc/transfer/multi") && r.request().method() === "POST", { timeout: 30_000 });
  await page.getByRole("button", { name: "세액 계산" }).click();
  const r = await resp;
  const json = (await r.json()) as Loose;
  const sent = r.request().postDataJSON() as Loose;
  expect(r.status(), JSON.stringify(json).slice(0, 400)).toBe(200);
  const p0 = sent.properties?.[0];
  expect(p0?.carryoverTaxation).toBeUndefined();
  expect((p0?.generalBuildingShares as Loose[]).map((s) => s.carryoverTaxation?.donorAcquisitionDate)).toEqual([undefined, "2019-01-01"]);
  expect(json.data?.totalTax).toBe(68_061_400);
  const unit = json.data?.burdenedGiftCarryoverUnits?.["mgs-1.1"];
  expect([unit?.adoptedScenario, unit?.determinedTaxA, unit?.determinedTaxB]).toEqual(["A", 61_874_000, 58_964_720]);

  const group = page.getByTestId("multi-gb-group-mgs-1");
  await expect(group).toBeVisible({ timeout: 15_000 });
  await expect(group.getByTestId("gb-bg-carryover-card")).toHaveCount(1);
  await expect(group.getByTestId("gb-bg-carryover-card").first()).toContainText("이월과세 비교과세 결과");
});
