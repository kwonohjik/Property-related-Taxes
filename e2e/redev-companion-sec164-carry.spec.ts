/**
 * 함께 양도하는 재개발 자산 — 상속 §164 기준시가(②)를 주 자산처럼 운반한다
 * (계획서 `docs/02-design/features/redev-companion-sec164-carry.plan.md` Q-1 a · Q-2 a · V-3).
 *
 *   RC-1 토지(매매) + 원조합원 입주권(종전 주택 · 2000 상속 · ① 3억 · ② 7.2억)을 함께 양도 — 둘째 카드에 ② 칸이 보이고,
 *        계산하면 본문 `companionAssets[0].inheritedHouseValuation`이 실리고 합산 결정세액 116,260,000(종전 266,250,000 = ① 단독).
 * 사람이 브라우저로 직접 한 수동 확인은 아니다(headless Playwright). 워크트리는 `E2E_PORT=<포트> npx playwright test <spec>`.
 */
import { test, expect } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const LAND = {
  ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "land", landNature: "standalone", acquisitionCause: "purchase",
  acquisitionDate: "2015-01-01", fixedAcquisitionPrice: "100000000", actualSalePrice: "200000000", fixedSalePrice: "200000000",
};
const OM = {
  ...makeDefaultAsset(2), addressJibun: "서울 강남구 테스트동 7-1", assetKind: "right_to_move_in", redevSubject: "right",
  redevApprovalLawBasis: "urban_renovation_art_74", redevOriginalAssetType: "housing", redevSettlementDirection: "pay", redevApprovalDate: "2015-03-01",
  redevRightsValue: "500000000", redevPreApprovalExpenses: "0", redevIsSuccessorMember: "no", isSuccessorRightToMoveIn: false, useEstimatedAcquisition: false,
  redevActualAcquisitionPrice: "100000000", redevSettlementAmount: "100000000", actualSalePrice: "1100000000", fixedSalePrice: "1100000000",
  transferType: "regular", acquisitionCause: "inheritance", publishedValueAtInheritance: "300000000", inheritanceValuationMethod: "supplementary",
  decedentAcquisitionDate: "1980-01-01", acquisitionDate: "2000-06-01", inheritanceStartDate: "2000-06-01",
  inheritanceAssetKind: "house_individual", inhHouseValLandArea: "100", inhHouseValLandPricePerSqmAtTransfer: "3000000",
  inhHouseValLandPricePerSqmAtFirst: "1000000", inhHouseValHousePriceAtFirst: "900000000", inhHouseValLandPricePerSqmAtInheritance: "800000",
};
const seed = {
  state: {
    formData: {
      assets: [LAND, OM], transferDate: "2026-02-16", filingDate: "2026-04-30", contractTotalPrice: "1300000000", bundledSaleMode: "actual",
      householdHousingCount: "1", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isOneHousehold: false,
      isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, totalTransferExpense: "0",
    },
    pendingMigration: false,
  },
  version: 0,
};

test("RC-1: 함께 양도하는 원조합원 입주권 — ② 칸이 보이고 ②로 계산한다(116,260,000)", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate((x) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(x)), seed);
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  const card = page.locator('[data-asset-card-index="1"]');
  for (const n of [1, 2, 3] as const) await expandAssetSection(page, n, 1);
  await expect(card.locator('[data-field="inhHouseValLandPricePerSqmAtFirst"]').first()).toBeVisible();

  const res = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  await page.getByRole("button", { name: /계산하기/ }).last().click();
  const r = await res;
  const json = (await r.json()) as Loose;
  expect(r.status(), JSON.stringify(json).slice(0, 600)).toBe(200);
  const sent = r.request().postDataJSON() as Loose;
  expect(sent.companionAssets?.[0]?.inheritedHouseValuation).toBeDefined();
  const agg = json.data?.aggregated as Loose;
  expect(agg?.totalDeterminedTax ?? agg?.determinedTax).toBe(116_260_000);
});
