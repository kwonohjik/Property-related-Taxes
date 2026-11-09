/**
 * 축 B(지분 분할) × 부담부증여 — 지분 카드에 양도시 기준시가 칸이 없어도 끝까지 계산된다(D-3d · Q-10 a · Q-11 (가)).
 * 계획서 `docs/00-pm/companion-inherit-valuation-share-vp2c.plan.md` §17.
 *
 * 종전: 기준시가 평가 · 환산(K-5)에서 「다음」 → 「자산 2: … 「② 양도정보」의 양도시 기준시가를 입력하세요」 — 지분 카드에는 ②도 그 칸도 없어 막다른 길.
 * 지금: 부담부증여 지분은 자산 1의 양도시 기준시가를 쓴다(`mergePrimaryBasic`).
 *
 * - SDE-1 토지 기준시가 평가(보충) → 194,000,000 · SDE-2 토지 시가 K-5 환산 → 292,800,000 (= 100% 단건 · anchor SD-1).
 *   주택은 「보유 상황」 주택 명부 입력이 필요해 토지로 한다(anchor SD-1이 4종을 덮는다).
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

const STD = { bgValuationMode: "sangjeungbeop_standard", bgMarketValueAtTransfer: "", bgAcquisitionMethod: "", bgMortgageDebtAmount: "400000000", bgMortgageSetAmount: "400000000" };
const K5 = { bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000", bgAcquisitionMethod: "converted", bgMortgageDebtAmount: "600000000", bgMortgageSetAmount: "600000000" };

async function seed(page: Page, mode: Record<string, unknown>) {
  const primary = {
    ...makeDefaultAsset(1), assetId: "p", addressJibun: "서울 강남구 테스트동 1-1", assetKind: "land", acquisitionCause: "purchase", acquisitionDate: "2015-01-01",
    transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgLendingDepositTotal: "0", standardPriceAtTransfer: "800000000", standardPriceAtAcq: "400000000",
    landAreaM2: "100", acquisitionArea: "100", transferArea: "100", landNature: "independent", ownershipNumerator: "60", ownershipDenominator: "100", ...mode,
  };
  // 지분 2 = 「+ 지분 추가」 기본값 + 취득원인 · 취득일 · 지분율 · 이 지분 취득시 기준시가(지분 카드의 「이 지분의 취득시 기준시가」 칸). 양도시 기준시가 칸은 없다.
  const share = { ...makeDefaultAsset(2), assetId: "s", acquisitionCause: "purchase", acquisitionDate: "2018-01-01", standardPriceAtAcq: "400000000", ownershipNumerator: "40", ownershipDenominator: "100" };
  const s = {
    state: {
      formData: {
        assets: [primary, share], assetSplitMode: "fractional", transferDate: "2026-02-16", filingDate: "2026-04-30", contractTotalPrice: "1000000000", totalTransferExpense: "0",
        householdHousingCount: "2", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isOneHousehold: false,
      },
      pendingMigration: false,
    },
    version: 0,
  };
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((x) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(x)), s);
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  // hydration 대기(e2e/CLAUDE.md §6)
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="bg-tranche-basis"]');
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  });
}
async function calc(page: Page) {
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  const resp = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  await page.getByRole("button", { name: /계산하기/ }).click();
  const r = await resp;
  expect(r.status(), await r.text()).toBe(200);
  return (await r.json()) as { data: { aggregated: { totalTransferGain: number } } };
}

test.describe("축 B × 부담부증여 — 지분 카드 양도시 기준시가는 자산 1 값", () => {
  for (const [name, mode, gain] of [["SDE-1 기준시가 평가", STD, 194_000_000], ["SDE-2 시가 K-5 환산", K5, 292_800_000]] as const) {
    test(`${name} → ${gain.toLocaleString()}`, async ({ page }) => {
      test.setTimeout(120_000);
      await seed(page, mode);
      // 지분 카드에는 양도시 기준시가 칸이 없다 — 자산 1의 ② 칸만 있다(토지 총액 · ㎡당 2개)
      await expect(page.locator('[data-testid="bg-tranche-basis"] [data-field="standardPriceAtTransfer"]')).toHaveCount(0);
      await expect(page.getByText(/자산 2: 부담부증여 .*양도시 기준시가/)).toHaveCount(0);
      const j = await calc(page);
      expect(j.data.aggregated.totalTransferGain).toBe(gain);
    });
  }
});
