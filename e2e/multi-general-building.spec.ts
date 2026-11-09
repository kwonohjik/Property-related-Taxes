/**
 * 다건 합산 — 일반건물(토지·건물 일괄)을 같은 해 다른 자산과 합산한다
 * (계획서 `docs/00-pm/multi-building-valuation-support.plan.md` 트랙 G PR-3 · Q-2 a).
 *
 *   MG-E1 차단 문구 없음 → 「세액 계산」 200 · 본문 `properties[1].generalBuildingValuation` 있음 ·
 *         결과 「건별 상세」에서 일반건물이 자산 1행(`multi-gb-group-<id>`)이고 펼치면 토지·건물 카드가 보인다.
 * 사람이 브라우저로 직접 한 수동 확인은 아니다(headless Playwright). 워크트리는 `E2E_PORT=<포트> npx playwright test <spec>`.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { seedWithDeclaredRoster } from "./_helpers/roster-for-declared-count";

const APT = {
  ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 9-1", assetKind: "housing",
  actualSalePrice: "900000000", fixedSalePrice: "900000000", acquisitionCause: "purchase", acquisitionDate: "2018-02-01",
  fixedAcquisitionPrice: "600000000",
};
const GB = {
  ...makeDefaultAsset(1), addressJibun: "서울 종로구 테스트동 1-1", assetKind: "general_building",
  actualSalePrice: "1000000000", fixedSalePrice: "1000000000", acquisitionCause: "purchase", gbBuildingAcquisitionCause: "purchase",
  acquisitionDate: "2009-03-01", useEstimatedAcquisition: true, landAcqMode: "estimated", buildingAcqMode: "estimated",
  fixedAcquisitionPrice: "200000000", gbLandArea: "100", gbBuildingArea: "200", gbBuildingFootprintArea: "50",
  gbTransferLandPricePerSqm: "2,000,000", gbTransferBuildingValue: "200,000,000", gbAcqLandPricePerSqm: "1,000,000",
  gbAcqBuildingValue: "100,000,000", gbZoneType: "general_residential",
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
        propertyId: `mg-${i + 1}`, propertyLabel: `양도 ${i + 1}번`, form: f, completionPercent: 100,
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

test("MG-E1: 다건 — 아파트 먼저 + 일반건물(환산) 나중 → 계산되고 일반건물이 자산 1행으로 묶인다", async ({ page }) => {
  test.setTimeout(150_000);
  await seedMulti(page, [formOf(APT, "2026-03-10", "900000000"), formOf(GB, "2026-08-20", "1000000000")]);
  await expect(page.getByText(/단건 계산기에서만 지원/)).toHaveCount(0);

  const resp = page.waitForResponse((r) => r.url().includes("/api/calc/transfer/multi") && r.request().method() === "POST", { timeout: 30_000 });
  await page.getByRole("button", { name: "세액 계산" }).click();
  const r = await resp;
  const json = (await r.json()) as Loose;
  const sent = r.request().postDataJSON() as Loose;
  expect(r.status(), JSON.stringify(json).slice(0, 400)).toBe(200);
  expect(sent.properties?.[1]?.generalBuildingValuation).toBeDefined();
  expect((json.data.properties as Loose[]).map((p) => p.propertyId)).toEqual(["mg-1", "land#mg-2", "building#mg-2"]);

  const group = page.getByTestId("multi-gb-group-mg-2");
  await expect(group).toBeVisible({ timeout: 15_000 });
  await expect(group).toContainText("양도 2번");
  await group.getByText("양도 2번", { exact: true }).click();
  // 펼치면 그 건의 토지·건물 카드 아코디언이 보인다(카드 라벨은 「양도 2번 …」 접두사).
  await expect(group.locator("span.font-medium", { hasText: /^양도 2번 .+/ })).toHaveCount(2);
});
