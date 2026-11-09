/**
 * 다건 합산 — 오피스텔(상업용건물 환산)을 먼저 양도하고 아파트를 나중에 양도한 경우를 계산한다
 * (계획서 `docs/00-pm/multi-building-valuation-support.plan.md` 트랙 C · Q-1 a — 종전에는 공통 설정 단계에서
 * 「일반건물·상업용건물(토지·건물 일괄/환산취득가)은 단건 계산기에서만 지원됩니다.」로 막혔다).
 *
 *   MC-E1 차단 문구 없음 → 「세액 계산」 200 · 본문 `properties[0].commercialBuildingValuation` 있음 ·
 *         결과 화면에 환산 산정 근거 카드(V-C3).
 * 사람이 브라우저로 직접 한 수동 확인은 아니다(headless Playwright). 워크트리는 `E2E_PORT=<포트> npx playwright test <spec>`.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { seedWithDeclaredRoster } from "./_helpers/roster-for-declared-count";

const OFFICETEL = {
  ...makeDefaultAsset(1), addressJibun: "서울 종로구 테스트동 1-1", assetKind: "commercial_building",
  actualSalePrice: "400000000", fixedSalePrice: "400000000", acquisitionCause: "purchase", acquisitionDate: "2015-06-03",
  useEstimatedAcquisition: true, cbEra: "", cbExclusiveArea: "36", cbSharedArea: "33.52", cbLandArea: "12.57",
  cbUnitPriceAtTransfer: "5000000", cbUnitPriceAtFirstOrAcq: "3000000", cbLandPricePerSqmAtAcq: "3978096",
  cbLandPricePerSqmAtTransfer: "15000000",
};
const APT = {
  ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 9-1", assetKind: "housing",
  actualSalePrice: "900000000", fixedSalePrice: "900000000", acquisitionCause: "purchase", acquisitionDate: "2018-02-01",
  fixedAcquisitionPrice: "600000000",
};
const formOf = (asset: Record<string, unknown>, transferDate: string, price: string) => ({
  assets: [asset], transferDate, filingDate: "", contractTotalPrice: price, totalTransferExpense: "0",
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
        propertyId: `mc-${i + 1}`, propertyLabel: `양도 ${i + 1}번`, form: f, completionPercent: 100,
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

test("MC-E1: 다건 — 오피스텔(환산) 먼저 + 아파트 나중 → 계산되고 환산 근거 카드가 뜬다", async ({ page }) => {
  test.setTimeout(150_000);
  await seedMulti(page, [
    formOf(OFFICETEL, "2026-03-10", "400000000"),
    formOf(APT, "2026-08-20", "900000000"),
  ]);
  await expect(page.getByText(/단건 계산기에서만 지원/)).toHaveCount(0);

  const resp = page.waitForResponse((r) => r.url().includes("/api/calc/transfer/multi") && r.request().method() === "POST", { timeout: 30_000 });
  await page.getByRole("button", { name: "세액 계산" }).click();
  const r = await resp;
  const json = (await r.json()) as Loose;
  const sent = r.request().postDataJSON() as Loose;
  expect(r.status(), JSON.stringify(json).slice(0, 400)).toBe(200);
  expect(sent.properties?.[0]?.commercialBuildingValuation).toBeDefined();
  // 환산이 살아 있다 — 양도차익이 양도가액 전액(4억)이 아니다.
  const officetel = (json.data?.properties as Loose[]).find((p) => p.propertyId === "mc-1");
  expect(officetel?.transferGain).toBeLessThan(400_000_000);

  await expect(page.getByText("상업용건물·오피스텔 환산취득가 산정 근거").first()).toBeAttached({ timeout: 15_000 });
});
