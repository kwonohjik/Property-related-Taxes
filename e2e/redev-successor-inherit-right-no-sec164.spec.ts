/**
 * 승계조합원 완공 아파트 — 준공 전(입주권 상태)에 상속받았으면 §164 기준시가(②)와 비교하지 않는다
 * (계획서 `docs/02-design/features/redev-successor-inherit-right-no-sec164.plan.md` Q-1 a · Q-3 a).
 *
 *   RN-1 ② 칸까지 채워 저장된 폼(종전 화면에서 입력 가능) — ② 칸이 사라지고, 계산하면 ②를 싣지 않고 ①(1억)로 계산한다
 *        (종전 취득가액 250,000,000 · 산출세액 160,660,000 → 지금 204,090,000).
 *   RN-2 대조 — 준공 뒤 상속(받은 것이 건물)은 ② 칸이 그대로 보인다.
 * 사람이 브라우저로 직접 한 수동 확인은 아니다(headless Playwright). 워크트리는 `E2E_PORT=<포트> npx playwright test <spec>`.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { seedWithDeclaredRoster } from "./_helpers/roster-for-declared-count";

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const BEFORE = {
  ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "redevelopment_apt", actualSalePrice: "920000000",
  redevSubject: "apt", redevApprovalLawBasis: "urban_renovation_art_74", redevIsSuccessorMember: "yes", redevSettlementDirection: "pay",
  redevSettlementAmount: "0", redevPreApprovalExpenses: "0", redevPostApprovalExpenses: "0", standardPriceAtTransfer: "600000000",
  acquisitionCause: "inheritance", fixedAcquisitionPrice: "", publishedValueAtInheritance: "100000000", inheritanceValuationMethod: "supplementary",
  acquisitionDate: "2004-03-01", redevApprovalDate: "2003-02-20", redevCompletionDate: "2006-12-02", decedentAcquisitionDate: "2000-01-01",
  inheritanceAssetKind: "house_individual", inhHouseValLandArea: "100", inhHouseValLandPricePerSqmAtTransfer: "5000000",
  inhHouseValLandPricePerSqmAtFirst: "3000000", inhHouseValHousePriceAtFirst: "300000000", inhHouseValLandPricePerSqmAtInheritance: "2500000",
};
const AFTER = { ...BEFORE, redevApprovalDate: "2001-02-20", redevCompletionDate: "2003-12-01" };
const form = (asset: unknown) => ({
  state: {
    formData: {
      assets: [asset], transferDate: "2023-02-16", filingDate: "2023-04-30", contractTotalPrice: "920000000", householdHousingCount: "0",
      householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isOneHousehold: false, isRegulatedArea: false,
      wasRegulatedAtAcquisition: false, isUnregistered: false,
    },
    pendingMigration: false,
  },
  version: 0,
});

async function seed(page: Page, s: unknown) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate((x) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(x)), seedWithDeclaredRoster(s));
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  for (const n of [1, 2, 3] as const) await expandAssetSection(page, n);
}

test.describe("승계조합원 완공 아파트 — 입주권 상태로 상속받으면 ② 비교 없음", () => {
  test("RN-2: 준공 뒤 상속 — ② 칸이 보인다(대조)", async ({ page }) => {
    test.setTimeout(180_000);
    await seed(page, form(AFTER));
    const card = page.locator('[data-asset-card-index="0"]');
    await expect(card.locator('[data-field="inhHouseValLandPricePerSqmAtFirst"]').first()).toBeVisible();
  });

  test("RN-1: 준공 전 상속 · ② 채운 저장 폼 — ② 칸이 없고 ①로 계산한다(204,090,000)", async ({ page }) => {
    test.setTimeout(180_000);
    await seed(page, form(BEFORE));
    const card = page.locator('[data-asset-card-index="0"]');
    await expect(card.locator('[data-field="publishedValueAtInheritance"]').first()).toBeVisible();
    await expect(card.locator('[data-field="inhHouseValLandPricePerSqmAtFirst"]')).toHaveCount(0);
    const res = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
    for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
    await page.getByRole("button", { name: /계산하기/ }).last().click();
    const r = await res;
    const json = (await r.json()) as Loose;
    expect(r.status(), JSON.stringify(json).slice(0, 600)).toBe(200);
    const sent = r.request().postDataJSON() as Loose;
    expect(sent.inheritedHouseValuation).toBeUndefined();
    expect(sent.inheritedAcquisition?.reportedValue).toBe(100_000_000);
    expect((json.data?.result ?? json.result)?.calculatedTax).toBe(204_090_000);
  });
});
