/**
 * 상속 — 매매에서 고른 취득가액 산정 방식이 남은 상태 (계획서 `docs/02-design/features/inherit-stale-acq-mode-flags.plan.md`)
 *
 *   IS-E1~3 매매 카드에서 감정가액·환산취득가·매매사례가액을 고르고(값 없음) 화면에서 「상속」으로 바꾼다 — 종전에는 플래그가 남아
 *           감정은 서버 400(「감정가액 방식 선택 시 감정가액을 입력하세요」), 환산·매매사례는 ⑧이 화면에 없는 칸을 요구했다(막다른 길).
 *           지금: 플래그가 비고 계산이 200.
 *   IS-E4 플래그가 남은 채 저장된 상속 폼을 복원 → 200.
 * 사람이 브라우저로 직접 한 수동 확인은 아니다(headless Playwright). 워크트리는 `E2E_PORT=<포트> npx playwright test <spec>`.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

const BASE = {
  ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2015-01-01",
  actualSalePrice: "500000000", standardPriceAtTransfer: "400000000", fixedAcquisitionPrice: "",
  // 상속 카드의 칸은 미리 채워 둔다(매매 카드에선 숨김) — 원인 전환 뒤 플래그만 본다.
  decedentAcquisitionDate: "2005-01-01", publishedValueAtInheritance: "300000000", inheritanceValuationMethod: "supplementary",
};
const form = (asset: unknown) => ({
  state: {
    formData: {
      assets: [asset], transferDate: "2023-02-16", filingDate: "2023-04-30", contractTotalPrice: "500000000", householdHousingCount: "0",
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
  await page.evaluate((x) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(x)), s);
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

async function calculateStatus(page: Page): Promise<number> {
  const res = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  await page.getByRole("button", { name: /계산하기/ }).last().click();
  return (await res).status();
}

const storedAsset = (page: Page) =>
  page.evaluate(() => JSON.parse(sessionStorage.getItem("transfer-tax-wizard") || "{}").state?.formData?.assets?.[0]);

test.describe("상속 — 남은 취득가액 산정 방식", () => {
  for (const [id, label, radio] of [["IS-E1", "감정가액을", /감정가액/], ["IS-E2", "환산취득가를", /환산취득가/], ["IS-E3", "매매사례가액을", /매매사례가액/]] as const) {
    test(`${id}: 매매에서 ${label} 고르고 상속으로 바꾸면 플래그가 비고 200`, async ({ page }) => {
      test.setTimeout(180_000);
      await seed(page, form(BASE));
      for (const n of [1, 2, 3] as const) await expandAssetSection(page, n);
      const card = page.locator('[data-asset-card-index="0"]');
      await card.getByRole("radio", { name: radio }).first().click();
      await card.getByRole("radio", { name: "상속", exact: true }).click();
      await expect.poll(async () => {
        const a = await storedAsset(page);
        return [a?.acquisitionCause, a?.useEstimatedAcquisition, a?.isAppraisalAcquisition, a?.isSalesCaseAcquisition];
      }).toEqual(["inheritance", false, false, false]);
      expect(await calculateStatus(page)).toBe(200);
    });
  }

  /**
   * IS-E5 매매에서 환산을 고르고 「토지·건물 취득일 다름」을 켜면 파트 방식이 승격 기록된다 → 상속으로 바꾸고 「토지·건물 소유자 다름」을
   *       켠다. 상속 소유자 분리 화면에는 파트 방식 라디오가 없다 — 남은 파트 방식이 상속 건물 파트를 환산으로 계산했다. 지금: 비워지고
   *       세액이 환산을 고르지 않은 대조 경로와 같다.
   */
  const OWN = {
    ...BASE, actualSalePrice: "1200000000", acquisitionArea: "100", transferArea: "100", standardPricePerSqmAtTransfer: "5600000",
    buildingStandardPriceAtTransfer: "840000000", standardPricePerSqmAtAcq: "2400000", standardPriceAtAcq: "480000000",
    buildingStandardPriceAtAcq: "360000000", standardPriceAtTransfer: "1400000000",
  };
  async function ownerSplitTax(page: Page, pickEstimated: boolean) {
    await seed(page, { ...form(OWN), state: { ...form(OWN).state, formData: { ...form(OWN).state.formData, contractTotalPrice: "1200000000" } } });
    for (const n of [1, 2, 3] as const) await expandAssetSection(page, n);
    const card = page.locator('[data-asset-card-index="0"]');
    if (pickEstimated) await card.getByRole("radio", { name: /환산취득가/ }).first().click();
    await card.getByText("토지·건물 취득일 다름", { exact: true }).first().click();
    await card.getByRole("radio", { name: "상속", exact: true }).click();
    await card.getByText("토지·건물 소유자 다름", { exact: true }).first().click();
    await expect.poll(async () => (await storedAsset(page))?.selfOwns).toBe("building_only");
    const a = await storedAsset(page);
    const res = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
    for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
    await page.getByRole("button", { name: /계산하기/ }).last().click();
    const r = await res;
    const json = await r.json();
    return { status: r.status(), tax: json?.data?.result?.calculatedTax as number | undefined, modes: [a?.landAcqMode, a?.buildingAcqMode] };
  }
  test("IS-E5: 매매 환산 → 취득일 다름 → 상속 → 소유자 다름 — 남은 파트 방식이 비고 세액이 대조와 같다", async ({ page }) => {
    test.setTimeout(240_000);
    const control = await ownerSplitTax(page, false);
    const stale = await ownerSplitTax(page, true);
    expect(control.status).toBe(200);
    expect(stale.status).toBe(200);
    expect(control.tax).toBeGreaterThan(0);
    expect(stale.modes).toEqual(["", ""]);
    expect(stale.tax).toBe(control.tax);
  });

  /**
   * IS-E6 매매 「취득일 다름」에서 건물 파트 취득가액을 넣고 → 상속 → 「소유자 다름」. 상속 소유자 분리 화면에는 파트 금액 칸이 없다 —
   *       남은 금액이 상속 건물 파트 취득가액으로 쓰였다. 지금: 비워지고 세액이 금액을 넣지 않은 대조 경로와 같다.
   */
  async function ownerSplitPartPriceTax(page: Page, price: string) {
    await seed(page, { ...form(OWN), state: { ...form(OWN).state, formData: { ...form(OWN).state.formData, contractTotalPrice: "1200000000" } } });
    for (const n of [1, 2, 3] as const) await expandAssetSection(page, n);
    const card = page.locator('[data-asset-card-index="0"]');
    await card.getByText("토지·건물 취득일 다름", { exact: true }).first().click();
    if (price) await card.getByTestId("split-building-acq-price").first().fill(price);
    await card.getByRole("radio", { name: "상속", exact: true }).click();
    await card.getByText("토지·건물 소유자 다름", { exact: true }).first().click();
    await expect.poll(async () => (await storedAsset(page))?.selfOwns).toBe("building_only");
    const a = await storedAsset(page);
    const res = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
    for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
    await page.getByRole("button", { name: /계산하기/ }).last().click();
    const r = await res;
    const json = await r.json();
    return { status: r.status(), tax: json?.data?.result?.calculatedTax as number | undefined, price: a?.buildingAcquisitionPrice };
  }
  test("IS-E6: 매매 「취득일 다름」 건물 파트 취득가액 → 상속 → 소유자 다름 — 남은 금액이 비고 세액이 대조와 같다", async ({ page }) => {
    test.setTimeout(240_000);
    const control = await ownerSplitPartPriceTax(page, "");
    const stale = await ownerSplitPartPriceTax(page, "100000000");
    expect(control.status).toBe(200);
    expect(control.tax).toBeGreaterThan(0);
    expect(stale.status).toBe(200);
    expect(stale.price).toBe("");
    expect(stale.tax).toBe(control.tax);
  });

  test("IS-E4: 감정 플래그가 남은 채 저장된 상속 폼을 복원하면 200", async ({ page }) => {
    test.setTimeout(180_000);
    await seed(page, form({ ...BASE, acquisitionCause: "inheritance", isAppraisalAcquisition: true }));
    expect(await calculateStatus(page)).toBe(200);
  });
});
