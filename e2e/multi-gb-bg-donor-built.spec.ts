/**
 * 다건 합산 — 일반건물 부담부증여 × 이월과세 × 당초 증여자 신축(§114조의2) + 같은 해 아파트
 * (계획서 `docs/00-pm/multi-carryover-bg-gb-shares.plan.md` 트랙 GB-BG-CO-DNB — 종전에는
 * 「…당초 증여자 신축·증축 가산세(소득세법 §114조의2)는 단건 계산기에서만 지원됩니다.」로 막혔다).
 *
 *   MDNB-E1 차단 문구 없음 → 「세액 계산」 200 · 본문 `burdenedGiftInfo.carryoverDonorBasis.donorBuilt` ·
 *           응답 자산별 echo(적용 · 가산세 2,500,000) · 단건과 같은 고지 · 일반건물 행에 증여자 신축 가산세 카드.
 * 시드는 anchor `__tests__/calc/multi-gb-bg-carryover-donor-built.anchor.test.ts` DNB-1과 같은 사실이다.
 * 사람이 브라우저로 직접 한 수동 확인은 아니다(headless Playwright). 워크트리는 `E2E_PORT=<포트> npx playwright test <spec>`.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "../lib/stores/calc-wizard-asset-carryover";
import { seedWithDeclaredRoster } from "./_helpers/roster-for-declared-count";

const GB = {
  ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", regionCode: "1168010100",
  assetKind: "general_building", acquisitionCause: "carryover_gift", acquisitionDate: "2024-05-01", gbBuildingAcquisitionCause: "carryover_gift",
  gbLandArea: "100", gbBuildingArea: "200", gbBuildingFootprintArea: "50", gbZoneType: "general_residential",
  gbTransferLandPricePerSqm: "2,000,000", gbTransferBuildingValue: "200,000,000", gbAcqLandPricePerSqm: "1,000,000", gbAcqBuildingValue: "100,000,000",
  transferType: "burdened_gift", transferCause: "general", bgValuationMode: "sangjeungbeop_market",
  bgMarketValueAtTransfer: "1,000,000,000", bgDonorRelation: "lineal_descendant",
  bgLendingDepositTotal: "0", bgMortgageDebtAmount: "500,000,000", bgMortgageSetAmount: "500,000,000", bgAcquisitionMethod: "converted",
  bgActualAcquisitionLand: "250,000,000", bgActualAcquisitionBuilding: "250,000,000",
  bgCoDonorLandStdPriceAtAcq: "10,000,000", bgCoDonorBuildingStdPriceAtAcq: "40,000,000",
  carryover: {
    ...CARRYOVER_DEFAULTS, giftRegistryDate: "2024-05-01", donorAcquisitionDate: "2015-01-01", donorAcquisitionPrice: "100,000,000",
    giftDateValuation: "1,000,000,000", giftTaxAmount: "0", donorRelation: "lineal", donorSameHousehold: "no",
    donorBuilt: true, donorBuiltType: "new", donorBuiltDate: "2022-01-10",
  },
  // 당초 증여자가 신축했으니 증여자의 건물 취득일 = 신축일(사용승인일)
  buildingCarryover: { ...CARRYOVER_DEFAULTS, donorAcquisitionDate: "2022-01-10" },
};
const APT = {
  ...makeDefaultAsset(1), addressJibun: "인천 서구 테스트동 2-2", regionCode: "2826010100", assetKind: "housing",
  actualSalePrice: "900000000", fixedSalePrice: "900000000", acquisitionCause: "purchase", acquisitionDate: "2018-02-01",
  fixedAcquisitionPrice: "600000000",
};
const formOf = (assets: Record<string, unknown>[], transferDate: string, price: string) => ({
  assets, transferDate, filingDate: "", contractTotalPrice: price, totalTransferExpense: "0",
  householdHousingCount: "2", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isOneHousehold: false,
  isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false,
});

async function seedMulti(page: Page, forms: Record<string, unknown>[]) {
  await page.goto("/calc/transfer-tax/multi");
  await page.waitForTimeout(2000);
  await page.evaluate(
    ([fs]) => {
      const raw = sessionStorage.getItem("multi-transfer-tax-wizard");
      if (!raw) throw new Error("persist entry 없음");
      const parsed = JSON.parse(raw);
      parsed.state.form.taxYear = 2026;
      parsed.state.form.properties = fs.map((f: unknown, i: number) => ({
        propertyId: `mdnb-${i + 1}`, propertyLabel: `양도 ${i + 1}번`, form: f, completionPercent: 100,
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

test("MDNB-E1: 다건 — 일반건물 부담부증여 × 이월과세 × 당초 증여자 신축 + 아파트 → 계산되고 일반건물 행에 증여자 신축 가산세 카드", async ({ page }) => {
  test.setTimeout(150_000);
  await seedMulti(page, [formOf([GB], "2026-03-01", "1000000000"), formOf([APT], "2026-09-01", "900000000")]);
  await expect(page.getByText(/당초 증여자 신축·증축 가산세\(소득세법 §114조의2\)는 단건 계산기에서만 지원/)).toHaveCount(0);

  const resp = page.waitForResponse((r) => r.url().includes("/api/calc/transfer/multi") && r.request().method() === "POST", { timeout: 30_000 });
  await page.getByRole("button", { name: "세액 계산" }).click();
  const r = await resp;
  const json = (await r.json()) as Loose;
  const sent = r.request().postDataJSON() as Loose;
  expect(r.status(), JSON.stringify(json).slice(0, 400)).toBe(200);
  expect(sent.properties?.[0]?.burdenedGiftInfo?.carryoverDonorBasis?.donorBuilt).toEqual({ buildingType: "new", constructionDate: "2022-01-10" });
  const echo = json.data?.donorBuiltPenaltyByAsset?.["mdnb-1"]?.echo;
  expect([echo?.applied, echo?.penalty, json.data?.penaltyTax]).toEqual([true, 2_500_000, 2_500_000]);
  expect((json.data?.warnings as string[]).some((w) => w.includes("증여자가 신축·증축한 건물에 소득세법 §114조의2"))).toBe(true);

  const group = page.getByTestId("multi-gb-group-mdnb-1");
  await expect(group).toBeVisible({ timeout: 15_000 });
  await group.getByText("양도 1번", { exact: true }).first().click();
  await expect(group.getByTestId("donor-built-penalty-card")).toBeVisible();
  await expect(group.getByTestId("donor-built-penalty-card")).toHaveAttribute("data-applied", "true");
});
