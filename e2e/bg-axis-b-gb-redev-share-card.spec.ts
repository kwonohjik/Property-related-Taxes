/**
 * 축 B(지분 분할) × 부담부증여 — 「+ 지분 추가」 기본값 지분 카드의 일반건물 · 재개발 막다른 길(D-3e · D-3f · Q-12 a · Q-13 a).
 * 계획서 `docs/00-pm/companion-inherit-valuation-share-vp2c.plan.md` §19.
 *
 * - GRE-1 일반건물(기준시가 평가 · K-4): 종전에는 지분 카드 ③이 「일반 양도」로 판정돼 취득시 기준시가 칸이 숨고 쓰이지 않는 일반 산정방식 · 취득가액 칸이 떴다
 *   → ⑧ 「취득시 토지 ㎡당 공시지가를 입력하세요」에 막혔다. 지금: 칸이 지분 카드에 보이고 거기 입력해 끝까지 계산(194,000,000 · 450,000,000 = 100% 단건).
 *   안내는 숨은 「위 ‘부담부증여’ 카드」가 아니라 자산 1의 ② 양도정보를 가리킨다.
 * - RDE-1 재개발(기준시가 평가): 지분 카드에 양도시 기준시가 칸이 없어 ⑧에 막혔다 → 자산 1 값을 써서 147,609,250(= 100% 단건).
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { rosterForDeclaredCount } from "./_helpers/roster-for-declared-count";

type A = Record<string, unknown>;
const COMMON: A = { addressJibun: "서울 강남구 테스트동 1-1", acquisitionCause: "purchase", transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgLendingDepositTotal: "0", ownershipNumerator: "60", ownershipDenominator: "100" };
const GB: A = { assetKind: "general_building", acquisitionDate: "2015-01-01", standardPriceAtTransfer: "800000000", standardPriceAtAcq: "400000000",
  gbAcqLandPricePerSqm: "2000000", gbAcqBuildingValue: "200000000", gbLandArea: "100", gbBuildingArea: "300", gbBuildingFootprintArea: "135", gbZoneType: "general_residential",
  gbTransferLandPricePerSqm: "6000000", gbTransferBuildingValue: "200000000", bgGiftBuildingStdPriceAtTransfer: "200000000", gbBuildingAcquisitionCause: "purchase", hasSeperateLandAcquisitionDate: false, landAcquisitionDate: "2015-01-01",
  useEstimatedAcquisition: false, bgActualAcquisitionLand: "100000000", bgActualAcquisitionBuilding: "150000000" };
const REDEV: A = { assetKind: "redevelopment_apt", acquisitionDate: "2015-01-01", standardPriceAtTransfer: "800000000", standardPriceAtAcq: "400000000", redevSubject: "apt", redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2018-06-01",
  redevRightsValue: "219218500", redevSettlementDirection: "pay", redevSettlementAmount: "55668900", redevCompletionDate: "2022-09-01", redevPreApprovalExpenses: "0", redevOriginalAssetType: "housing",
  redevActualAcquisitionPrice: "100000000", bgActualAcquisitionTotal: "250000000", useEstimatedAcquisition: false };
/** 재개발 지분 카드 ③에 보이는 칸(청산금은 지분 해당분) — 양도시 기준시가 칸은 없다. */
const REDEV_SHARE: A = { acquisitionDate: "2015-01-01", redevSubject: "apt", redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2018-06-01", redevRightsValue: "219218500", redevSettlementDirection: "pay",
  redevSettlementAmount: "37112600", redevPreApprovalExpenses: "0", redevOriginalAssetType: "housing", redevActualAcquisitionPrice: "100000000", redevCompletionDate: "2022-09-01", standardPriceAtAcq: "400000000" };
const STD: A = { bgValuationMode: "sangjeungbeop_standard", bgMarketValueAtTransfer: "", bgAcquisitionMethod: "", bgMortgageDebtAmount: "400000000", bgMortgageSetAmount: "400000000" };
const K4: A = { bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000", bgAcquisitionMethod: "actual", bgMortgageDebtAmount: "600000000", bgMortgageSetAmount: "600000000" };

async function seed(page: Page, primary: A, share: A) {
  const assets = [
    { ...makeDefaultAsset(1), assetId: "p", ...COMMON, ...primary },
    // 지분 2 = 「+ 지분 추가」 기본값(양도 형태 「일반 양도」) + 그 카드에 보이는 칸
    { ...makeDefaultAsset(2), assetId: "s", acquisitionCause: "purchase", ownershipNumerator: "40", ownershipDenominator: "100", ...share },
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
/** 지분 2 카드 — 지분 카드 안내(`fractional-basic-inherited-notice`)를 품은 카드. ③ 섹션을 펼친다. */
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

test.describe("축 B × 부담부증여 — 「+ 지분 추가」 기본값 지분 카드(일반건물 · 재개발)", () => {
  for (const [name, mode, gain, source] of [
    ["GRE-1a 일반건물 기준시가 평가", STD, 194_000_000, "자산 1의 ② 양도정보 ‘부담부증여’ 카드에서 선택"],
    ["GRE-1b 일반건물 시가 K-4", K4, 450_000_000, "자산 1의 ② 양도정보 ‘부담부증여’ 카드에서 선택 — 이 지분을 자산 1과 다른 가액으로 취득했으면"],
  ] as const) {
    test(`${name} → 지분 카드 취득시 기준시가 칸에 입력 → ${gain.toLocaleString()}`, async ({ page }) => {
      test.setTimeout(120_000);
      await seed(page, { ...GB, ...mode }, { acquisitionDate: "2015-01-01" });
      const card = await shareCard(page);
      // 쓰이지 않는 일반 산정방식 · 취득가액 칸은 없다
      await expect(card.locator('[data-field="fixedAcquisitionPrice"]')).toHaveCount(0);
      await expect(card.locator('[data-field="useEstimatedAcquisition"]')).toHaveCount(0);
      await expect(card.getByTestId("bg-acq-method-source")).toContainText(source);
      // 취득시 기준시가 칸이 지분 카드에 있다 — 빈 칸에 입력
      await card.locator('[data-field="gbAcqLandPricePerSqm"] input, input[data-field="gbAcqLandPricePerSqm"]').first().fill("2000000");
      await card.locator('[data-field="gbAcqBuildingValue"] input, input[data-field="gbAcqBuildingValue"]').first().fill("200000000");
      const j = await calc(page);
      expect(j.data.aggregated.totalTransferGain).toBe(gain);
    });
  }

  test("RDE-1 재개발 기준시가 평가 — 지분 카드에 양도시 기준시가 칸 없이 → 147,609,250", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page, { ...REDEV, ...STD }, REDEV_SHARE);
    const card = await shareCard(page);
    await expect(card.locator('[data-field="standardPriceAtTransfer"]')).toHaveCount(0);
    const j = await calc(page);
    expect(j.data.aggregated.totalTransferGain).toBe(147_609_250);
  });
});
