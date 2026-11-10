/**
 * 재개발 · 입주권 부담부증여 × 상속 · 증여 종전 부동산 — §163⑨ 안내가 계산에 쓰이는 칸을 가리킨다(D-3l · Q-20 a).
 * 계획서 `docs/00-pm/companion-inherit-valuation-share-vp2c.plan.md` §27 · §28.
 *
 * - SNE-1 입주권 상속 단건: 안내가 「‘부담부증여’ 카드의 실지취득가액 칸」 · 없는 「상속개시일 평가액」 칸을 가리키지 않는다 · 그 칸 hint에 §163⑨ · 값 400,000,000(칸 4억 — §27.2).
 * - SNE-2 입주권 증여 지분 카드: 안내가 이 카드 위 지분 토글 · 토글 칸 hint에 증여일 평가액 · 값 424,000,000(= 축 A 합 · §27.2).
 * - SNE-3 재개발 기준시가 상속: 실지 칸이 쓰이지 않아 안내가 뜨지 않는다.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { rosterForDeclaredCount } from "./_helpers/roster-for-declared-count";

type A = Record<string, unknown>;
const RV: A = { bgRightMemberRightsValue: "1200000000", bgRightPaidInstallments: "200000000", bgRightPremium: "100000000" };
const ORIG = (set: string): A => ({ isSuccessorRightToMoveIn: false, acquisitionDate: "2012-01-01", acquisitionCause: "purchase", redevOriginalAssetType: "housing", redevRightsValue: "900000000",
  redevSettlementDirection: "pay", redevSettlementAmount: set, redevPreApprovalExpenses: "0", redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2018-06-01" });
const RTMI: A = { addressJibun: "서울 강남구 테스트동 9-9", assetKind: "right_to_move_in", redevSubject: "right", transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgLendingDepositTotal: "0", ...RV,
  standardPriceAtAcq: "", standardPriceAtTransfer: "", bgValuationMode: "sangjeungbeop_standard", bgAcquisitionMethod: "", bgMortgageDebtAmount: "600000000", bgMortgageSetAmount: "600000000" };
const INH: A = { acquisitionCause: "inheritance", inheritanceStartDate: "2012-01-01", decedentAcquisitionDate: "2000-01-01" };
const GIFT: A = { acquisitionCause: "gift", giftDate: "2012-01-01" };

async function seed(page: Page, assets: A[], contractTotalPrice: string, split?: string) {
  const s = {
    state: {
      formData: rosterForDeclaredCount({
        assets, ...(split ? { assetSplitMode: split } : {}), transferDate: "2026-02-16", filingDate: "2026-04-30", contractTotalPrice, totalTransferExpense: "0",
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
    const el = document.querySelector('[data-asset-section="3"]');
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  });
}
async function openSection3(scope: ReturnType<Page["locator"]>) {
  const header = scope.locator('[data-asset-section="3"] > button').first();
  if ((await header.innerText()).includes("펼치기")) await header.click();
}
async function calc(page: Page) {
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  const resp = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  await page.getByRole("button", { name: /계산하기/ }).click();
  const r = await resp;
  expect(r.status(), await r.text()).toBe(200);
  return (await r.json()) as { data: { result?: { transferGain: number }; aggregated?: { totalTransferGain: number } } };
}

test.describe("재개발 · 입주권 부담부증여 × 상속 · 증여 — §163⑨ 안내", () => {
  test("SNE-1 입주권 상속 단건 — 안내 · 칸 hint · 400,000,000", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page, [{ ...makeDefaultAsset(1), assetId: "p", ...RTMI, ...ORIG("100000000"), ...INH, bgActualAcquisitionTotal: "400000000" }], "1500000000");
    await openSection3(page.locator("body"));
    const notice = page.getByTestId("redev-bg-sec163-9-notice");
    await expect(notice).toContainText("② 양도정보 ‘부담부증여’ 카드의 실지취득가액 칸");
    await expect(page.getByText("“상속개시일 평가액” 입력값")).toHaveCount(0);
    await expect(page.getByText("실거래가로는 계산하지 않습니다")).toHaveCount(0);
    // 칸 hint는 ② 양도정보 ‘부담부증여’ 카드 안이다
    const s2 = page.locator('[data-asset-section="2"] > button').first();
    if ((await s2.innerText()).includes("펼치기")) await s2.click();
    await expect(page.getByText("상속으로 취득했으면 상속개시일 현재 상증법 평가액").first()).toBeVisible();
    const j = await calc(page);
    expect(j.data.result?.transferGain ?? j.data.aggregated?.totalTransferGain).toBe(400_000_000);
  });

  test("SNE-2 입주권 증여 지분 카드 — 안내가 지분 토글 · 토글 칸 hint · 424,000,000", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page, [
      { ...makeDefaultAsset(1), assetId: "p", ...RTMI, ...ORIG("60000000"), ownershipNumerator: "60", ownershipDenominator: "100", bgActualAcquisitionTotal: "300000000" },
      { ...makeDefaultAsset(2), assetId: "s", ownershipNumerator: "40", ownershipDenominator: "100", ...ORIG("40000000"), ...GIFT, bgShareOwnAcquisition: true, bgActualAcquisitionTotal: "400000000" },
    ], "1500000000", "fractional");
    const card = page.locator('[data-testid="fractional-basic-inherited-notice"]').locator("xpath=ancestor::*[.//*[@data-asset-section='3']][1]");
    await openSection3(card);
    await expect(card.getByTestId("redev-bg-sec163-9-notice")).toContainText("이 카드 위 「이 지분의 취득가액을 자산 1과 따로 입력」");
    await expect(card.getByText("“증여 신고가액” 입력값")).toHaveCount(0);
    await expect(page.getByTestId("bg-share-own-acquisition").getByText("증여로 취득했으면 증여일 현재 상증법 평가액")).toBeVisible();
    const j = await calc(page);
    expect(j.data.aggregated?.totalTransferGain).toBe(424_000_000);
  });

  test("SNE-3 재개발 기준시가 상속 — 실지 칸이 쓰이지 않아 안내 없음", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page, [{ ...makeDefaultAsset(1), assetId: "p", addressJibun: "서울 강남구 테스트동 1-1", transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgLendingDepositTotal: "0",
      assetKind: "redevelopment_apt", redevSubject: "apt", ...INH, acquisitionDate: "2012-01-01", standardPriceAtTransfer: "800000000", standardPriceAtAcq: "400000000", redevApprovalLawBasis: "urban_renovation_art_74",
      redevApprovalDate: "2018-06-01", redevRightsValue: "219218500", redevSettlementDirection: "pay", redevSettlementAmount: "92781500", redevCompletionDate: "2022-09-01", redevPreApprovalExpenses: "0",
      redevOriginalAssetType: "housing", bgValuationMode: "sangjeungbeop_standard", bgMortgageDebtAmount: "400000000", bgMortgageSetAmount: "400000000" }], "1000000000");
    await openSection3(page.locator("body"));
    await expect(page.locator('[data-asset-section="3"]').first()).toBeVisible();
    await expect(page.getByTestId("redev-bg-sec163-9-notice")).toHaveCount(0);
    await expect(page.getByText("종전자산 취득가액 — 상속개시일 상증법 평가액")).toHaveCount(0);
  });
});
