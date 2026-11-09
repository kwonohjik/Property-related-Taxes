/**
 * 다건 합산 — 부담부증여(소득세법 시행령 §159) 주택을 같은 해 아파트와 함께 계산한다
 * (계획서 `docs/00-pm/multi-carryover-bg-gb-shares.plan.md` 트랙 BG — 종전에는 공통 설정 단계에서
 * 「부담부증여(소령 §159)는 단건 계산기에서만 지원됩니다.」로 막혔다).
 *
 *   MBG-E1 차단 문구 없음 → 「세액 계산」 200 · 본문 `properties[0].transferType`·`burdenedGiftInfo` 있음 ·
 *          그 자산 행을 펼치면 단건과 같은 §159 명세 카드(`BurdenedGiftDetailCard`).
 * 사람이 브라우저로 직접 한 수동 확인은 아니다(headless Playwright). 워크트리는 `E2E_PORT=<포트> npx playwright test <spec>`.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { seedWithDeclaredRoster } from "./_helpers/roster-for-declared-count";

const BG_HOUSE = {
  ...makeDefaultAsset(1), addressJibun: "인천 서구 테스트동 7-7", regionCode: "2826010100", assetKind: "housing",
  acquisitionCause: "purchase", acquisitionDate: "2015-03-01", standardPriceAtTransfer: "800000000",
  transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1,000,000,000",
  bgMortgageDebtAmount: "300,000,000", bgDonorRelation: "lineal_descendant", bgAcquisitionMethod: "actual",
  bgActualAcquisitionTotal: "400,000,000",
};
const APT = {
  ...makeDefaultAsset(1), addressJibun: "인천 서구 테스트동 2-2", regionCode: "2826010100", assetKind: "housing",
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
      parsed.state.form.taxYear = 2024;
      parsed.state.form.properties = fs.map((f: unknown, i: number) => ({
        propertyId: `mbg-${i + 1}`, propertyLabel: `양도 ${i + 1}번`, form: f, completionPercent: 100,
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

test("MBG-E1: 다건 — 부담부증여 주택 + 아파트 → 계산되고 그 자산 행에 §159 명세 카드가 뜬다", async ({ page }) => {
  test.setTimeout(150_000);
  await seedMulti(page, [formOf(BG_HOUSE, "2024-06-01", ""), formOf(APT, "2024-09-01", "900000000")]);
  await expect(page.getByText(/부담부증여\(소령 §159\)는 단건 계산기에서만 지원/)).toHaveCount(0);

  const resp = page.waitForResponse((r) => r.url().includes("/api/calc/transfer/multi") && r.request().method() === "POST", { timeout: 30_000 });
  await page.getByRole("button", { name: "세액 계산" }).click();
  const r = await resp;
  const json = (await r.json()) as Loose;
  const sent = r.request().postDataJSON() as Loose;
  expect(r.status(), JSON.stringify(json).slice(0, 400)).toBe(200);
  expect(sent.properties?.[0]?.transferType).toBe("burdened_gift");
  expect(sent.properties?.[0]?.burdenedGiftInfo).toBeDefined();
  const bg = (json.data?.properties as Loose[]).find((p) => p.propertyId === "mbg-1");
  expect(bg?.transferBurdenedGiftBreakdown).toBeDefined();

  await expect(page.getByText("부담부증여 평가 명세 (소득세법 시행령 §159)").first()).toBeAttached({ timeout: 15_000 });
});
