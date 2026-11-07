/**
 * 다건 — 상속 §163⑨ ② 채택 자산의 신고서 양식 취득가액·필요경비 표시
 * (계획서 `docs/02-design/features/multi-inherited-acq-display-echo.plan.md` Q-1 a · Q-2 a).
 *
 *   DE-E1 상속 주택(2000) · ① 3억 + ② 7.2억 → 「세액 계산」 → 「신고서 양식(합산)」 취득가액 720,000,000 · 필요경비 420,000,000 없음
 *         (종전: 취득가액 300,000,000 · 필요경비 420,000,000 — 세액 149,006,000은 그대로).
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


test("DE-E1: 다건 상속 주택 ① + ② — 신고서 양식 취득가액 720,000,000 · 필요경비에 차액이 들어가지 않는다", async ({ page }) => {
  await seedMulti(page, formOf({ ...HOUSE, ...SEC164 }));
  const a = await calc(page);
  expect(a.status, JSON.stringify(a.json).slice(0, 400)).toBe(200);
  const res = a.json.data?.result ?? a.json.data;
  expect(res.totalTax).toBe(149_006_000);
  expect(res.properties[0].acquisitionPrice).toBe(720_000_000);
  expect(res.properties[0].necessaryExpense).toBe(0);
  await expect(page.getByRole("row", { name: /^취득가액.*720,000,000/ }).first()).toBeVisible();
  await expect(page.getByRole("row", { name: /^취득가액.*300,000,000/ })).toHaveCount(0);
  await expect(page.getByRole("row", { name: /^필요경비.*420,000,000/ })).toHaveCount(0);
});
