/**
 * 다건 합산 — 주택 토지·건물 파트 이월과세(P3 A 토지만 이월과세) + 같은 해 아파트
 * (계획서 `docs/00-pm/multi-carryover-bg-gb-shares.plan.md` 트랙 CO-PART · Q-4 b — 종전에는 「토지·건물을 나눈 이월과세(§97의2)는 단건 계산기에서만 지원됩니다.」로 막혔다).
 *
 *   MSC-E1 차단 문구 없음 → 「세액 계산」 200 · 본문 `properties[0].landCarryoverPart`·`carryoverGiftEvent` ·
 *          응답 첫 자산 `splitDetail.carryoverEvent` · «확인 필요»(파트 A/B는 그 자산 결정세액 기준) 고지 · 자산 행 펼침에 토지 파트 이월과세 블록.
 * 시드는 anchor `__tests__/calc/_helpers/split-carryover-a-form.ts`(단건 189,486,000)와 같은 사실이다.
 * 사람이 브라우저로 직접 한 수동 확인은 아니다(headless Playwright). 워크트리는 `E2E_PORT=<포트> npx playwright test <spec>`.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "../lib/stores/calc-wizard-asset-carryover";
import { seedWithDeclaredRoster } from "./_helpers/roster-for-declared-count";

const PART = {
  ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing",
  acquisitionCause: "purchase", acquisitionDate: "2021-03-01", buildingAcquisitionPrice: "400,000,000",
  hasSeperateLandAcquisitionDate: true, landCauseHost: "purchase", landAcquisitionCause: "carryover_gift", landAcquisitionDate: "2023-03-01",
  landAcqMode: "actual", buildingAcqMode: "actual", landAcquisitionPrice: "300,000,000",
  landCarryover: {
    ...CARRYOVER_DEFAULTS, giftRegistryDate: "2023-03-01", donorRelation: "lineal", donorAcquisitionDate: "2000-01-01",
    donorAcquisitionPrice: "100,000,000", giftTaxCalculated: "20,000,000", giftTaxBase: "300,000,000",
  },
  actualSalePrice: "1,200,000,000", saleSplitMode: "actual", landTransferPrice: "700,000,000", buildingTransferPrice: "500,000,000",
  landStandardPriceAtTransfer: "700,000,000", buildingStandardPriceAtTransfer: "500,000,000",
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
      parsed.state.form.taxYear = 2025;
      parsed.state.form.properties = fs.map((f: unknown, i: number) => ({
        propertyId: `msc-${i + 1}`, propertyLabel: `양도 ${i + 1}번`, form: f, completionPercent: 100,
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

test("MSC-E1: 다건 — 토지만 이월과세(파트) + 아파트 → 계산되고 «확인 필요» 고지 · 자산 행에 토지 파트 이월과세 블록", async ({ page }) => {
  test.setTimeout(150_000);
  await seedMulti(page, [formOf([PART], "2025-06-30", "1200000000"), formOf([APT], "2025-09-01", "900000000")]);
  await expect(page.getByText(/토지·건물을 나눈 이월과세\(§97의2\)는 단건 계산기에서만 지원/)).toHaveCount(0);

  const resp = page.waitForResponse((r) => r.url().includes("/api/calc/transfer/multi") && r.request().method() === "POST", { timeout: 30_000 });
  await page.getByRole("button", { name: "세액 계산" }).click();
  const r = await resp;
  const json = (await r.json()) as Loose;
  const sent = r.request().postDataJSON() as Loose;
  expect(r.status(), JSON.stringify(json).slice(0, 400)).toBe(200);
  expect(sent.properties?.[0]?.landCarryoverPart?.donorAcquisitionDate).toBe("2000-01-01");
  expect(sent.properties?.[0]?.carryoverGiftEvent?.giftRegistryDate).toBe("2023-03-01");
  expect(json.data?.properties?.[0]?.splitDetail?.carryoverEvent).toBeTruthy();
  expect((json.data?.warnings as string[]).some((w) => w.includes("그 자산의 결정세액만으로"))).toBe(true);

  await expect(page.getByText(/그 자산의 결정세액만으로 적용 여부/).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("split-carryover-land").first()).toBeAttached({ timeout: 15_000 });
});
