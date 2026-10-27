/**
 * 상속 — 재개발·겸용 화면이 켠 산정 방식 플래그가 일반 범위 진입 후 남지 않는다
 * (계획서 `docs/02-design/features/inherit-gift-scope-entry-stale-acq-flags.plan.md` — #2594 V-1).
 *
 *   SE-E1 상속 재개발 §166③ 「환산취득가액」 → 자산 종류 「주택」 → 계산. 종전 ⑧ 「취득 당시 기준시가를 입력하세요」(칸 0개).
 *   SE-E2 상속 겸용 「개별주택가격 미공시」 → 겸용 OFF → 계산. 종전 같은 막다른 길.
 * 지금: 둘 다 플래그 없이 시작한 대조와 같은 세액. 사람이 브라우저로 직접 한 수동 확인은 아니다(headless Playwright).
 * 워크트리는 `E2E_PORT=<포트> npx playwright test <spec>`.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

/** 2015 상속 주택 · 평가액 3억 · 양도 12억 — 취득 당시 기준시가 칸은 비운다(상속 일반 카드에 그 칸이 없다) */
const INH = {
  ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "inheritance", acquisitionDate: "2015-01-01",
  decedentAcquisitionDate: "2005-01-01", publishedValueAtInheritance: "300000000", inheritanceValuationMethod: "supplementary", fixedAcquisitionPrice: "",
  actualSalePrice: "1200000000", acquisitionArea: "100", transferArea: "100", standardPricePerSqmAtTransfer: "5600000",
  buildingStandardPriceAtTransfer: "840000000", standardPriceAtTransfer: "1400000000",
};
const form = (asset: unknown) => ({
  state: {
    formData: {
      assets: [asset], transferDate: "2023-02-16", filingDate: "2023-04-30", contractTotalPrice: "1200000000", householdHousingCount: "0",
      householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isOneHousehold: false, isRegulatedArea: false,
      wasRegulatedAtAcquisition: false, isUnregistered: false,
    },
    pendingMigration: false,
  },
  version: 0,
});

async function seed(page: Page, asset: Record<string, unknown>) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate((x) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(x)), form(asset));
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  for (const n of [1, 2, 3] as const) await expandAssetSection(page, n);
}
const card = (page: Page) => page.locator('[data-asset-card-index="0"]');
const storedAsset = (page: Page) =>
  page.evaluate(() => JSON.parse(sessionStorage.getItem("transfer-tax-wizard") || "{}").state?.formData?.assets?.[0]);

async function calcTax(page: Page): Promise<{ status: number; tax: number | undefined }> {
  const res = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  await page.getByRole("button", { name: /계산하기/ }).last().click();
  const r = await res;
  const json = await r.json();
  return { status: r.status(), tax: json?.data?.result?.calculatedTax as number | undefined };
}

test.describe("상속 — 일반 범위 진입 시 남는 산정 방식 플래그", () => {
  test.setTimeout(240_000);

  test("SE-E1: 재개발 「환산취득가액」 → 자산 종류 「주택」 — 대조와 같은 세액", async ({ page }) => {
    await seed(page, INH);
    const control = await calcTax(page);

    await seed(page, { ...INH, assetKind: "redevelopment_apt" });
    await card(page).getByText("환산취득가액", { exact: true }).first().click();
    await expect.poll(async () => (await storedAsset(page))?.useEstimatedAcquisition).toBe(true);
    await card(page).getByRole("button", { name: /^주택$/ }).click();
    await expect.poll(async () => {
      const a = await storedAsset(page);
      return [a?.assetKind, a?.useEstimatedAcquisition];
    }).toEqual(["housing", false]);
    const after = await calcTax(page);

    expect(control.status).toBe(200);
    expect(control.tax).toBeGreaterThan(0);
    expect(after.status).toBe(200);
    expect(after.tax).toBe(control.tax);
  });

  test("SE-E2: 겸용 「개별주택가격 미공시」 → 겸용 OFF — 대조와 같은 세액", async ({ page }) => {
    await seed(page, INH);
    const control = await calcTax(page);

    await seed(page, { ...INH, isMixedUseHouse: true, hasSeperateLandAcquisitionDate: true, landAcquisitionDate: INH.acquisitionDate });
    await card(page).locator('[data-field="usePreHousingDisclosure"]').getByRole("switch").click();
    await expect.poll(async () => (await storedAsset(page))?.useEstimatedAcquisition).toBe(true);
    await card(page).locator('[data-field="isMixedUseHouse"]').getByRole("switch").click();
    await expect.poll(async () => {
      const a = await storedAsset(page);
      return [a?.isMixedUseHouse, a?.useEstimatedAcquisition];
    }).toEqual([false, false]);
    const after = await calcTax(page);

    expect(control.status).toBe(200);
    expect(control.tax).toBeGreaterThan(0);
    expect(after.status).toBe(200);
    expect(after.tax).toBe(control.tax);
  });
});
