/**
 * 부담부증여 — 매매에서 고른 감정가액·매매사례가액 산정 방식이 양도 유형 전환 뒤 계산을 막지 않는다
 * (계획서 `docs/02-design/features/bg-stale-acq-mode-flags.plan.md`).
 *
 *   BS-E1 매매 주택 「매매사례가액」 → 양도 유형 「부담부증여 (소령 §159)」 → 계산. 종전 ⑧ 「매매사례가액을 입력하세요」(그 칸은 부담부증여 화면에 없다).
 *   BS-E2 같은 경로 「감정가액」. 종전 ⑧ 통과 → 서버 400 `appraisalValue`.
 * 지금: 둘 다 플래그 없이 시작한 부담부증여와 같은 세액. 사람이 브라우저로 직접 한 수동 확인은 아니다(headless Playwright).
 * 워크트리는 `E2E_PORT=<포트> npx playwright test <spec>`.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

/** 2010 매매 주택 · 부담부증여 입력(직계비속 · 담보채무 2억 · 기준시가 평가)을 미리 채워 둔다 — 양도 유형을 바꾸면 그대로 쓰인다 */
const HOUSE = {
  ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2010-03-15",
  bgDonorRelation: "lineal_descendant", bgValuationMode: "sangjeungbeop_standard", bgMortgageDebtAmount: "200000000", bgLendingDepositTotal: "0",
  standardPriceAtTransfer: "400000000", standardPriceAtAcq: "200000000",
};
const form = (asset: unknown) => ({
  state: {
    formData: {
      assets: [asset], transferDate: "2023-02-16", filingDate: "2023-04-30", householdHousingCount: "0",
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

test.describe("부담부증여 — 매매에서 남은 감정·매매사례 산정 방식", () => {
  test.setTimeout(240_000);

  for (const [id, label, flag] of [["BS-E1", "매매사례가액", "isSalesCaseAcquisition"], ["BS-E2", "감정가액", "isAppraisalAcquisition"]] as const) {
    test(`${id}: 매매 「${label}」 → 부담부증여 — 대조와 같은 세액`, async ({ page }) => {
      await seed(page, { ...HOUSE, transferType: "burdened_gift" });
      const control = await calcTax(page);

      await seed(page, { ...HOUSE, transferType: "regular" });
      await card(page).locator('[data-field="useEstimatedAcquisition"]').getByText(label, { exact: true }).first().click();
      await card(page).locator('[data-field="transferType"]').getByText("부담부증여 (소령 §159)", { exact: true }).first().click();
      await expect.poll(async () => {
        const a = await storedAsset(page);
        return [a?.transferType, a?.[flag]];
      }).toEqual(["burdened_gift", true]); // 플래그는 남는다(보존) — 읽지 않을 뿐이다
      await expect(card(page).locator('[data-field="useEstimatedAcquisition"]')).toHaveCount(0);
      const after = await calcTax(page);

      expect(control.status).toBe(200);
      expect(control.tax).toBeGreaterThan(0);
      expect(after.status).toBe(200);
      expect(after.tax).toBe(control.tax);
    });
  }
});
