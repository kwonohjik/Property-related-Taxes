/**
 * 축 B(지분 분할) × 부담부증여 — 재개발 · 입주권 원조합원 지분 카드(D-3g · D-3h · Q-18 a · Q-19 a).
 * 계획서 `docs/00-pm/companion-inherit-valuation-share-vp2c.plan.md` §25 · §26.
 *
 * - ROE-1 재개발 원조합원 K-4: 지분 카드에 쓰이지 않던 ⑤ 「실거래가 취득가액」 칸이 없다 · 「이 지분 실지취득가액」 3억 → 382,331,100(= 지분별 축 A 단건 합).
 * - ROE-2 입주권 원조합원 기준시가: 토글을 켜면 자산 1 값(3억)으로 시작 → 440,000,000(= 토글 끔) · 안내가 숨은 ⑤ 대신 자산 1의 ② 를 가리킨다.
 * - ROE-3 재개발 원조합원 K-5: 판정값이 부담부증여로 바뀌어 ⑤ 라디오가 사라져도 §166③ D · E 칸이 뜬다 → 475,865,550(= 100% 단건).
 * - ROE-4 지분별 산정방식(remaining-4-measurements Q-47 a): 자산 1 K-4 · 지분 2 K-5 → D · E 칸 · 417,816,140(= 축 A 단건 합).
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { rosterForDeclaredCount } from "./_helpers/roster-for-declared-count";

type A = Record<string, unknown>;
const BG: A = { transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgLendingDepositTotal: "0", ownershipNumerator: "60", ownershipDenominator: "100" };
const REDEV: A = { addressJibun: "서울 강남구 테스트동 1-1", assetKind: "redevelopment_apt", acquisitionCause: "purchase", acquisitionDate: "2015-01-01", standardPriceAtTransfer: "800000000", standardPriceAtAcq: "400000000", redevSubject: "apt",
  redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2018-06-01", redevRightsValue: "219218500", redevSettlementDirection: "pay", redevSettlementAmount: "55668900",
  redevCompletionDate: "2022-09-01", redevPreApprovalExpenses: "0", redevOriginalAssetType: "housing", redevActualAcquisitionPrice: "100000000", bgActualAcquisitionTotal: "250000000", useEstimatedAcquisition: false,
  redevManagementDisposalHousingPrice: "300000000", redevAcquisitionHousingPrice: "150000000" };
const K4: A = { bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000", bgAcquisitionMethod: "actual", bgMortgageDebtAmount: "600000000", bgMortgageSetAmount: "600000000" };
const REDEV_SHARE: A = { acquisitionCause: "purchase", acquisitionDate: "2017-01-01", redevSubject: "apt", redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2018-06-01", redevRightsValue: "219218500",
  redevPreApprovalExpenses: "0", redevSettlementDirection: "pay", redevSettlementAmount: "37112600", redevCompletionDate: "2022-09-01", redevOriginalAssetType: "housing", standardPriceAtAcq: "400000000" };
const ORIG = (set: string): A => ({ isSuccessorRightToMoveIn: false, acquisitionDate: "2009-07-01", acquisitionCause: "purchase", redevOriginalAssetType: "housing", redevRightsValue: "900000000",
  redevSettlementDirection: "pay", redevSettlementAmount: set, redevPreApprovalExpenses: "0", redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2018-06-01" });
const RTMI: A = { addressJibun: "서울 강남구 테스트동 9-9", assetKind: "right_to_move_in", redevSubject: "right", bgRightMemberRightsValue: "1200000000", bgRightPaidInstallments: "200000000", bgRightPremium: "100000000",
  standardPriceAtAcq: "", standardPriceAtTransfer: "", bgValuationMode: "sangjeungbeop_standard", bgAcquisitionMethod: "", bgMortgageDebtAmount: "600000000", bgMortgageSetAmount: "600000000", bgActualAcquisitionTotal: "300000000" };

async function seed(page: Page, primary: A, share: A, contractTotalPrice: string) {
  const assets = [
    { ...makeDefaultAsset(1), assetId: "p", ...BG, ...primary },
    // 지분 2 = 「+ 지분 추가」 기본값(양도 형태 「일반 양도」) + 그 카드에 보이는 칸
    { ...makeDefaultAsset(2), assetId: "s", ownershipNumerator: "40", ownershipDenominator: "100", ...share },
  ];
  const s = {
    state: {
      formData: rosterForDeclaredCount({
        assets, assetSplitMode: "fractional", transferDate: "2026-02-16", filingDate: "2026-04-30", contractTotalPrice, totalTransferExpense: "0",
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

test.describe("축 B × 부담부증여 — 재개발 · 입주권 원조합원 지분 카드", () => {
  test("ROE-1 재개발 원조합원 K-4 — ⑤ 실거래가 칸 없음 · 이 지분 실지취득가액 3억 → 382,331,100", async ({ page }) => {
    test.setTimeout(120_000);
    // 토글은 켠 상태 · 칸은 비워 시드한다 — 값이 있는 칸에 fill()하면 전체 선택(SelectOnFocusProvider RAF)과 엇갈릴 수 있다(e2e/bg-axis-b-share-own-acquisition.spec.ts)
    await seed(page, { ...REDEV, ...K4 }, { ...REDEV_SHARE, bgShareOwnAcquisition: true, bgActualAcquisitionTotal: "" }, "1000000000");
    const card = await shareCard(page);
    await expect(card.locator('[data-field="redevActualAcquisitionPrice"]')).toHaveCount(0);
    const block = page.getByTestId("bg-share-own-acquisition");
    await expect(block).toHaveCount(1);
    // 재개발 지분은 산정방식도 지분 칸이다(Q-47 a) — 비어 있으면 자산 1의 실지(K-4)
    await expect(block.locator('[data-field="bgAcquisitionMethod"]')).toHaveCount(1);
    await expect(block.getByRole("radio", { name: /실지취득가액 안분/ })).toBeChecked();
    const input = block.locator('[data-field="bgActualAcquisitionTotal"] input, input[data-field="bgActualAcquisitionTotal"]').first();
    await input.fill("300000000");
    await expect(input).toHaveValue(/^300,?000,?000$/);
    // 재개발 지분은 산정방식도 이 카드에서 고른다(Q-47 a) — 출처 안내가 그 블록을 가리킨다
    await expect(card.getByTestId("bg-acq-method-source")).toContainText("이 카드 위 「이 지분의 취득가액을 자산 1과 따로 입력」에서 선택");
    const j = await calc(page);
    expect(j.data.aggregated.totalTransferGain).toBe(382_331_100);
  });

  test("ROE-2 입주권 원조합원 기준시가 — 토글 켬 → 자산 1 값으로 시작 · 안내는 자산 1의 ② → 440,000,000", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page, { ...RTMI, ...ORIG("60000000") }, { ...ORIG("40000000"), acquisitionDate: "2012-01-01" }, "1500000000");
    const card = await shareCard(page);
    await expect(card.locator('[data-field="redevActualAcquisitionPrice"]')).toHaveCount(0);
    await expect(card.getByText("부담부증여에서는 종전 부동산의 실지취득가액을 자산 1의 ② 양도정보")).toBeVisible();
    const block = page.getByTestId("bg-share-own-acquisition");
    const sw = block.getByRole("switch", { name: /이 지분의 취득가액을 자산 1과 따로 입력/ });
    await sw.click();
    await expect(sw).toHaveAttribute("aria-checked", "true");
    const input = block.locator('[data-field="bgActualAcquisitionTotal"] input, input[data-field="bgActualAcquisitionTotal"]').first();
    await expect(input).toHaveValue(/^300,?000,?000$/);
    await expect(block.getByText("이 지분 종전 부동산 실지취득가액")).toBeVisible();
    const j = await calc(page);
    expect(j.data.aggregated.totalTransferGain).toBe(440_000_000);
  });

  test("ROE-3 재개발 원조합원 K-5 — ⑤ 라디오 없이 §166③ D · E 칸 → 475,865,550", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page, { ...REDEV, ...K4, bgAcquisitionMethod: "converted" },
      { ...REDEV_SHARE, acquisitionDate: "2015-01-01", useEstimatedAcquisition: false, redevManagementDisposalHousingPrice: "300000000", redevAcquisitionHousingPrice: "150000000" }, "1000000000");
    const card = await shareCard(page);
    await expect(card.getByTestId("redev-bg-sec166-3-notice")).toBeVisible();
    await expect(card.locator('[data-field="redevManagementDisposalHousingPrice"]').first()).toBeVisible();
    // 지분별 산정방식(Q-47 a) — 토글은 보이지만 꺼져 있으면 자산 1의 K-5 그대로
    await expect(page.getByTestId("bg-share-own-acquisition").getByRole("switch")).toHaveAttribute("aria-checked", "false");
    const j = await calc(page);
    expect(j.data.aggregated.totalTransferGain).toBe(475_865_550);
  });

  test("ROE-4 재개발 원조합원 — 자산 1 K-4 · 지분 2 K-5(지분별 산정방식 · Q-47 a) → §166③ D · E 칸 · 417,816,140", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page, { ...REDEV, ...K4, redevSettlementAmount: "55668900" },
      { ...REDEV_SHARE, bgShareOwnAcquisition: true, bgAcquisitionMethod: "converted", redevManagementDisposalHousingPrice: "300000000", redevAcquisitionHousingPrice: "200000000" }, "1000000000");
    const card = await shareCard(page);
    const block = page.getByTestId("bg-share-own-acquisition");
    await expect(block.getByRole("radio", { name: /환산취득가액/ })).toBeChecked();
    await expect(card.locator('[data-field="redevManagementDisposalHousingPrice"]').first()).toBeVisible();
    const j = await calc(page);
    expect(j.data.aggregated.totalTransferGain).toBe(417_816_140);
  });
});
