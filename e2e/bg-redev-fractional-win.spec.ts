/**
 * E2E: 부담부증여 **축 A(공유 소유) 지분 재개발 APT(완공 아파트) × 시가 모드 × 담보 승(상증법 §66)** — ⑧ 차단 해소 + ⑤ 취득시 기준시가 칸 + ⑦ 값 +
 * 시가·환산취득가액(K-5) 조합은 계속 막힌다 (V-S1g Q-1 a · Q-2 b).
 * 계획서 `docs/00-pm/bg-redev-fractional-collateral-win.plan.md` §3·§4. 종전에는 «지분 50%를 가진 자산에서 담보평가액 … 계산하지 않습니다»로 막혔다.
 * 시료: 재개발 완공 APT(원조합원 · 주택 출자 · 청산금 납부 지분 해당분 46,390,750) · 지분 50% · 시가 모드 · 시가 10억 · 본인 인수 채무 7억 > 지분 시가 5억 → 담보 승 · 취득시 기준시가 4억.
 *
 *   RD-E1. K-4 담보 승 — 200 · 취득시 기준시가 칸 · 차단 문구 없음 · ⑦ 양도차익 447,609,250 · 필요경비 칸 옆 «담보평가 … 쓰이지 않고 개산공제» 안내
 *   RD-E2. 취득시 기준시가를 비우면 막힌다(칸이 있어 막다른 길이 아니다)
 *   RD-E3. K-5(환산취득가액)는 계속 막힌다 — «실지취득가액»을 고르라는 안내, 요청이 나가지 않는다(종전 ⑧ 0건 → ⑫ 400 막다른 길 방지)
 *   RD-E4. 보충적평가 승(채무 3억)은 담보 승 안내가 없고 안내 문구(승자에 따라 필요경비가 갈림)는 그대로 보인다
 * 사람이 브라우저로 직접 한 수동 확인은 아니다(headless Playwright). 워크트리는 `E2E_PORT=<포트> npx playwright test <spec>`.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { seedWithDeclaredRoster } from "./_helpers/roster-for-declared-count";

const half = (over: Record<string, unknown> = {}) => ({
  ...makeDefaultAsset(1),
  assetId: "p", addressJibun: "서울 강남구 테스트동 1-1", assetKind: "redevelopment_apt", redevSubject: "apt", acquisitionCause: "purchase", acquisitionDate: "2015-01-01",
  ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "yes",
  actualSalePrice: "525000000", redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2018-06-01", redevRightsValue: "219218500",
  redevSettlementDirection: "pay", redevSettlementAmount: "46390750", redevCompletionDate: "2022-09-01", redevPreApprovalExpenses: "0", redevOriginalAssetType: "housing",
  redevActualAcquisitionPrice: "100000000", useEstimatedAcquisition: false,
  transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", standardPriceAtTransfer: "800000000", standardPriceAtAcq: "400000000",
  bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "250000000",
  bgLendingDepositTotal: "0", bgMortgageDebtAmount: "700000000", bgMortgageSetAmount: "700000000", ...over,
});

async function seedAndOpen(page: Page, assets: unknown[]) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), seedWithDeclaredRoster({
    state: {
      formData: {
        assets, transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0",
        householdHousingCount: "1", isOneHousehold: false, householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
        isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false,
      },
      pendingMigration: false,
    },
    version: 0,
  }));
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

async function openTransferSection(page: Page) {
  await page.getByRole("button", { name: /^양도정보/ }).first().click();
}
/** 재개발 블록(인가전 분 필요경비 칸)은 «취득정보» 섹션 안에 있다 — 접힌 상태에서는 hidden. */
async function openAcquisitionSection(page: Page) {
  await page.getByRole("button", { name: /^취득정보/ }).first().click();
}
async function clickToCalc(page: Page) {
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  await page.getByRole("button", { name: /계산하기/ }).last().click();
}
async function calculate(page: Page) {
  const res = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  await clickToCalc(page);
  return res;
}
const NOTE = /담보평가.*증여재산 평가액으로 정해지면 이 금액은 쓰이지 않고 개산공제/;

test("RD-E1: 축 A 지분 재개발 시가 K-4 담보 승 — 200 · 취득시 기준시가 칸 · 양도차익 447,609,250 · 필요경비 칸 안내", async ({ page }) => {
  test.setTimeout(240_000);
  await seedAndOpen(page, [half()]);
  await expect(page.getByTestId("bg-collateral-forced-notice")).toHaveCount(1);
  await openAcquisitionSection(page);
  await expect(page.getByText(NOTE).first()).toBeVisible();
  await openTransferSection(page);
  await expect(page.getByTestId("bg-acq-std-price").first()).toBeVisible();
  const r = await calculate(page);
  expect(r.status(), await r.text()).toBe(200);
  await expect(page.locator("body")).not.toContainText("지분 50%를 가진 자산에서 담보평가액");
  await expect(page.locator("body")).toContainText("447,609,250");
});

test("RD-E2: 취득시 기준시가를 비우면 막힌다 — 칸이 있어 막다른 길이 아니다", async ({ page }) => {
  test.setTimeout(240_000);
  await seedAndOpen(page, [half({ standardPriceAtAcq: "" })]);
  await openTransferSection(page);
  await expect(page.getByTestId("bg-acq-std-price").first()).toBeVisible();
  await clickToCalc(page);
  await expect(page.getByText(/취득시 기준시가.*입력하세요/).first()).toBeVisible({ timeout: 20_000 });
});

test("RD-E3: 시가 K-5(환산취득가액) 담보 승 지분은 계속 막힌다 — «실지취득가액» 안내 · 요청이 나가지 않는다", async ({ page }) => {
  test.setTimeout(240_000);
  await seedAndOpen(page, [half({ bgAcquisitionMethod: "converted", redevManagementDisposalHousingPrice: "300000000", redevAcquisitionHousingPrice: "150000000" })]);
  let posted = false;
  page.on("request", (q) => { if (q.url().includes("/api/calc/transfer") && q.method() === "POST") posted = true; });
  await clickToCalc(page);
  await expect(page.getByText(/«환산취득가액»으로 고르면 계산하지 않으니 «실지취득가액»을 고르세요/).first()).toBeVisible({ timeout: 20_000 });
  expect(posted).toBe(false);
});

test("RD-E4: 보충적평가 승(채무 3억)은 담보 승 안내가 없다 — 필요경비 칸 안내는 그대로", async ({ page }) => {
  test.setTimeout(240_000);
  await seedAndOpen(page, [half({ bgMortgageDebtAmount: "300000000", bgMortgageSetAmount: "300000000" })]);
  await expect(page.getByTestId("bg-collateral-forced-notice")).toHaveCount(0);
  await openAcquisitionSection(page);
  await expect(page.getByText(NOTE).first()).toBeVisible();
});
