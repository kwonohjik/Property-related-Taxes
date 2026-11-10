/**
 * 축 B(지분 분할) × 재개발 — 「+ 지분 추가」 기본값 지분 카드(D-3j · D-3k · Q-16 a · Q-17 a).
 * 계획서 `docs/00-pm/companion-inherit-valuation-share-vp2c.plan.md` §23 · §24.
 *
 * - LAE-1 토지 출자 × 부담부증여 K-5: 종전에는 ⑧ 「토지면적(㎡)을 입력하세요」인데 지분 카드에 그 칸이 없었다 → 자산 1 값을 써서 475,865,550(= 100% 단건).
 * - SCE-1 승계조합원 × 부담부증여 K-4: 종전에는 지분 카드에 일반 「취득가액」 칸이 떴는데 계산에 쓰이지 않았다 → 칸이 숨고 §159 안내 · 450,000,000(= 100% 단건).
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { rosterForDeclaredCount } from "./_helpers/roster-for-declared-count";

type A = Record<string, unknown>;
const COMMON: A = { addressJibun: "서울 강남구 테스트동 1-1", transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgLendingDepositTotal: "0", ownershipNumerator: "60", ownershipDenominator: "100" };
const REDEV: A = { assetKind: "redevelopment_apt", acquisitionCause: "purchase", acquisitionDate: "2015-01-01", standardPriceAtTransfer: "800000000", standardPriceAtAcq: "400000000", redevSubject: "apt",
  redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2018-06-01", redevRightsValue: "219218500", redevSettlementDirection: "pay", redevSettlementAmount: "55668900",
  redevCompletionDate: "2022-09-01", redevPreApprovalExpenses: "0", redevOriginalAssetType: "housing", redevActualAcquisitionPrice: "100000000", bgActualAcquisitionTotal: "250000000", useEstimatedAcquisition: false,
  redevManagementDisposalHousingPrice: "300000000", redevAcquisitionHousingPrice: "150000000" };
const K4: A = { bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000", bgAcquisitionMethod: "actual", bgMortgageDebtAmount: "600000000", bgMortgageSetAmount: "600000000" };
const K5: A = { ...K4, bgAcquisitionMethod: "converted" };
const SHARE: A = { acquisitionCause: "purchase", redevSubject: "apt", redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2018-06-01", redevRightsValue: "219218500", redevPreApprovalExpenses: "0", redevSettlementDirection: "pay" };

async function seed(page: Page, primary: A, share: A) {
  const assets = [
    { ...makeDefaultAsset(1), assetId: "p", ...COMMON, ...REDEV, ...primary },
    // 지분 2 = 「+ 지분 추가」 기본값(양도 형태 「일반 양도」) + 그 카드에 보이는 칸
    { ...makeDefaultAsset(2), assetId: "s", ownershipNumerator: "40", ownershipDenominator: "100", ...SHARE, ...share },
  ];
  const s = {
    state: {
      formData: rosterForDeclaredCount({
        assets, assetSplitMode: "fractional", transferDate: "2026-02-16", filingDate: "2026-04-30", contractTotalPrice: "1000000000", totalTransferExpense: "0",
        householdHousingCount: "2", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isOneHousehold: false,
      } as never),
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
    const el = document.querySelector('[data-testid="fractional-basic-inherited-notice"]');
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  });
}
/** 지분 2 카드 — ③ 섹션을 펼친다. */
async function shareCard(page: Page) {
  const card = page.locator('[data-testid="fractional-basic-inherited-notice"]').locator("xpath=ancestor::*[.//*[@data-asset-section='3']][1]");
  const header = card.locator('[data-asset-section="3"] > button').first();
  if ((await header.innerText()).includes("펼치기")) await header.click();
  return card;
}
async function calc(page: Page) {
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  const resp = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  await page.getByRole("button", { name: /계산하기/ }).click();
  const r = await resp;
  expect(r.status(), await r.text()).toBe(200);
  return (await r.json()) as { data: { aggregated: { totalTransferGain: number } } };
}

test.describe("축 B × 재개발 — 「+ 지분 추가」 기본값 지분 카드", () => {
  test("LAE-1 토지 출자 × 부담부증여 K-5 — 지분 카드에 토지면적 칸 없이 → 475,865,550", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page, { ...K5, redevOriginalAssetType: "land", redevLandArea: "100", redevLandStdPriceAtAcq: "150000000", redevLandStdPriceAtApproval: "300000000" },
      { acquisitionDate: "2015-01-01", redevSettlementAmount: "37112600", redevOriginalAssetType: "land", useEstimatedAcquisition: true, redevLandPricePerSqmAtAcq: "1500000", redevLandPricePerSqmAtApproval: "3000000" });
    const card = await shareCard(page);
    await expect(card.locator('[data-field="redevLandArea"]')).toHaveCount(0);
    const j = await calc(page);
    expect(j.data.aggregated.totalTransferGain).toBe(475_865_550);
  });

  test("SCE-1 승계조합원 × 부담부증여 K-4 — 일반 「취득가액」 칸 없음 · §159 안내 → 450,000,000", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page, { ...K4, redevIsSuccessorMember: "yes", acquisitionDate: "2019-03-01", redevSettlementAmount: "0" },
      { acquisitionDate: "2019-03-01", redevSettlementAmount: "0", redevOriginalAssetType: "housing", redevIsSuccessorMember: "yes", redevCompletionDate: "2022-09-01" });
    const card = await shareCard(page);
    await expect(card.locator('[data-field="fixedAcquisitionPrice"]')).toHaveCount(0);
    await expect(card.getByTestId("redev-successor-bg-acq-note")).toBeVisible();
    await expect(card.getByTestId("bg-acq-method-source")).toContainText("자산 1의 ② 양도정보");
    const j = await calc(page);
    expect(j.data.aggregated.totalTransferGain).toBe(450_000_000);
  });
});
