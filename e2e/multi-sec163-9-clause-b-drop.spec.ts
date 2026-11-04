/**
 * 다건 — 상속 §164 기준시가(②) 입력이 있으면 「단건 계산기에서만 지원」으로 막는다
 * (계획서 `docs/02-design/features/multi-sec163-9-clause-b-drop.plan.md` Q-1 a · Q-2 a · Q-3 a).
 *
 *   MB-E1 상속 주택(2000) · ① 3억 + ② 채움 → 「세액 계산」에서 막히고 요청이 나가지 않는다(종전: ②가 조용히 빠져 282,711,000).
 *   MB-E2 같은 자산 · ② 비움 → 막지 않고 200(① 단독 · 단건과 같은 계산).
 * 사람이 브라우저로 직접 한 수동 확인은 아니다(headless Playwright). 워크트리는 `E2E_PORT=<포트> npx playwright test <spec>`.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

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
    [form],
  );
  await page.reload();
  await page.waitForTimeout(1500);
}

test("MB-E1·E2: 다건 상속 주택 — ② 입력이 있으면 막고, 비우면 계산한다", async ({ page }) => {
  test.setTimeout(150_000);
  let posted = false;
  page.on("request", (r) => { if (r.url().includes("/api/calc/transfer/multi") && r.method() === "POST") posted = true; });
  await seedMulti(page, formOf({ ...HOUSE, ...SEC164 }));
  await page.getByRole("button", { name: "세액 계산" }).click();
  await expect(page.getByText(/§164 기준시가\(②\)와 비교하는 상속·증여 취득가액/).first()).toBeVisible({ timeout: 15_000 });
  expect(posted).toBe(false);

  await seedMulti(page, formOf(HOUSE));
  const resp = page.waitForResponse((r) => r.url().includes("/api/calc/transfer/multi") && r.request().method() === "POST", { timeout: 30_000 });
  await page.getByRole("button", { name: "세액 계산" }).click();
  const r = await resp;
  expect(r.status()).toBe(200);
  await expect(page.getByText(/§164 기준시가\(②\)와 비교하는/)).toHaveCount(0);
});
