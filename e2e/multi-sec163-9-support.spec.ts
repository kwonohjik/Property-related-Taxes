/**
 * 다건 — 상속 §164 기준시가(②)를 단건과 같은 경로로 계산한다
 * (계획서 `docs/02-design/features/multi-sec163-9-support.plan.md` Q-1 a · Q-2 a · 종전 #2888은 같은 입력을 막았다).
 *
 *   MS-E1 상속 주택(2000) · ① 3억 + ② 7.2억 → 「세액 계산」 200 · 본문 `properties[0].inheritedHouseValuation` · 총세액 149,006,000
 *         (단건 135,460,000 × 1.1 · #2888 전에는 ②가 빠져 282,711,000).
 *   MS-E2 같은 자산 · ① 비우고 ②만 → 막지 않고 같은 149,006,000.
 * 사람이 브라우저로 직접 한 수동 확인은 아니다(headless Playwright). 워크트리는 `E2E_PORT=<포트> npx playwright test <spec>`.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { seedWithDeclaredRoster } from "./_helpers/roster-for-declared-count";

const HOUSE = {
  ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 9-1", assetKind: "housing", actualSalePrice: "1300000000", fixedSalePrice: "1300000000",
  acquisitionCause: "inheritance", acquisitionDate: "2000-06-01", inheritanceStartDate: "2000-06-01", publishedValueAtInheritance: "300000000",
  inheritanceValuationMethod: "supplementary", decedentAcquisitionDate: "1980-01-01", standardPriceAtTransfer: "900000000", inheritanceAssetKind: "house_individual",
};
const SEC164 = {
  inhHouseValLandArea: "100", inhHouseValLandPricePerSqmAtTransfer: "3000000", inhHouseValLandPricePerSqmAtFirst: "1000000",
  inhHouseValHousePriceAtFirst: "900000000", inhHouseValLandPricePerSqmAtInheritance: "800000",
};
const formOf = (asset: Record<string, unknown>) => ({
  assets: [asset], transferDate: "2026-02-16", filingDate: "2026-04-30", contractTotalPrice: "1300000000", totalTransferExpense: "0",
  householdHousingCount: "2", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isOneHousehold: false,
  isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false,
});

async function seedMulti(page: Page, form: Record<string, unknown>) {
  await page.goto("/calc/transfer-tax/multi");
  await page.waitForTimeout(2000);
  await page.evaluate(
    ([f]) => {
      const raw = sessionStorage.getItem("multi-transfer-tax-wizard");
      if (!raw) throw new Error("persist entry 없음");
      const parsed = JSON.parse(raw);
      parsed.state.form.properties = [{ propertyId: "mb-m1", propertyLabel: "양도 1번", form: f, completionPercent: 100 }];
      parsed.state.form.activePropertyIndex = 0;
      parsed.state.form.activeStep = "settings";
      sessionStorage.setItem("multi-transfer-tax-wizard", JSON.stringify(parsed));
    },
    [seedWithDeclaredRoster(form)],
  );
  await page.reload();
  await page.waitForTimeout(1500);
}

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function calc(page: Page) {
  const resp = page.waitForResponse((r) => r.url().includes("/api/calc/transfer/multi") && r.request().method() === "POST", { timeout: 30_000 });
  await page.getByRole("button", { name: "세액 계산" }).click();
  const r = await resp;
  const json = (await r.json()) as Loose;
  return { status: r.status(), json, sent: r.request().postDataJSON() as Loose };
}

test("MS-E1·E2: 다건 상속 주택 — ①+② · ②만 모두 ②로 계산한다(149,006,000)", async ({ page }) => {
  test.setTimeout(150_000);
  await seedMulti(page, formOf({ ...HOUSE, ...SEC164 }));
  const a = await calc(page);
  expect(a.status, JSON.stringify(a.json).slice(0, 400)).toBe(200);
  expect(a.sent.properties?.[0]?.inheritedHouseValuation).toBeDefined();
  expect(a.json.data?.result?.totalTax ?? a.json.data?.totalTax).toBe(149_006_000);
  await expect(page.getByText(/단건 계산기에서만 지원/)).toHaveCount(0);

  await seedMulti(page, formOf({ ...HOUSE, ...SEC164, publishedValueAtInheritance: "" }));
  const b = await calc(page);
  expect(b.status, JSON.stringify(b.json).slice(0, 400)).toBe(200);
  expect(b.json.data?.result?.totalTax ?? b.json.data?.totalTax).toBe(149_006_000);
});
