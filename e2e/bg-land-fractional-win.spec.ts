/**
 * E2E: 부담부증여 **축 A(공유 소유) 지분 토지 × 시가 모드 × 담보 승(상증법 §66)** — ⑧ 차단 해소 + ⑤ 취득시 기준시가 칸 + ⑥⑦ 값 화면 확인 (V-S1 Q-1 a).
 * 계획서 `docs/00-pm/bg-fractional-winner-kinds-grid.plan.md` §3.1·§3.1.1. 종전에는 «지분 50%를 가진 자산에서 담보평가액 … 계산하지 않습니다»로 막혔다.
 * 시료: 토지 · 지분 50%(나머지 타인 소유) · 시가 모드 · 시가 10억 · 본인 인수 채무 7억 > 지분 시가 5억 → 담보 승 · 취득시 기준시가 4억.
 * 오라클(손계산): 양도가액 7억 − 취득가액(4억 × 50% × 채무비율 1 = 2억) − 개산공제 600만 = 양도차익 494,000,000.
 *
 *   BL-E1. 200 · 담보 승 안내 · 취득시 기준시가 칸 · 필요경비 «개산공제만» · 「지분 … 계산하지 않습니다」 차단 없음 · ⑦ 양도차익 494,000,000 · ⑥ 사이드바 양도가액 700,000,000 · 취득가액 200,000,000 · 필요경비 6,000,000
 *   BL-E2. 실지취득가액을 비워도 200
 *   BL-E3. 취득시 기준시가를 비우면 막힌다(칸이 있어 막다른 길이 아니다)
 *   BL-E4. 보충적평가 승(채무 3억)이면 실지취득가액 요구가 그대로다
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { seedWithDeclaredRoster } from "./_helpers/roster-for-declared-count";

const half = (over: Record<string, unknown> = {}) => ({
  ...makeDefaultAsset(1),
  assetId: "p", addressJibun: "서울 강남구 테스트동 1-1", assetKind: "land", acquisitionCause: "purchase", acquisitionDate: "2015-01-01",
  ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "yes",
  transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", standardPriceAtTransfer: "800000000", standardPriceAtAcq: "400000000",
  bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000", bgAcquisitionMethod: "actual", bgActualAcquisitionLand: "250000000", landAreaM2: "100", landNature: "independent", companionLandNature: "independent",
  bgLendingDepositTotal: "0", bgMortgageDebtAmount: "700000000", bgMortgageSetAmount: "700000000", ...over,
});

async function seedAndOpen(page: Page, assets: unknown[]) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), seedWithDeclaredRoster({
    state: {
      formData: {
        assets, transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0",
        householdHousingCount: "2", isOneHousehold: false, householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
        isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false,
      },
      pendingMigration: false,
    },
    version: 0,
  }));
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

/** 첫 카드의 «양도정보» 섹션을 펼친다 — 취득시 기준시가 칸(`bg-acq-std-price`)이 그 안에 있다(접힌 상태에서는 hidden). */
async function openTransferSection(page: Page) {
  await page.getByRole("button", { name: /^양도정보/ }).first().click();
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

/** 결과 → 입력 단계로 돌아가 사이드바(⑥)를 읽는다 — 계산 전에는 「계산 후 표시」다. */
async function sidebarAfterCalc(page: Page) {
  await page.getByRole("button", { name: /^이전/ }).last().click();
  await page.getByRole("button", { name: "가산세" }).first().click();
  const aside = page.locator("aside");
  await expect(aside).toContainText("취득가액");
  return (await aside.innerText()).replace(/\s+/g, " ");
}

test("BL-E1: 축 A 지분 토지 시가 담보 승 — 200 · 담보 승 안내 · 취득시 기준시가 칸 · 양도차익 494,000,000 · 사이드바 취득가액", async ({ page }) => {
  test.setTimeout(240_000);
  await seedAndOpen(page, [half()]);
  await expect(page.getByTestId("bg-collateral-forced-notice")).toHaveCount(1);
  await expect(page.getByRole("button", { name: /자본적 지출.*개산공제만/ }).first()).toBeVisible();
  await openTransferSection(page);
  await expect(page.getByTestId("bg-acq-std-price").first()).toBeVisible();
  const r = await calculate(page);
  expect(r.status(), await r.text()).toBe(200);
  await expect(page.locator("body")).not.toContainText("지분 50%를 가진 자산에서 담보평가액");
  await expect(page.locator("body")).toContainText("494,000,000");
  const side = await sidebarAfterCalc(page);
  // 단건 사이드바는 «합계» 접두 없이 «양도가액 · 취득가액 · 필요경비»를 보인다 — 손계산: 7억 · 5억×50%×채무비율 1 = 2.5억 · 개산공제 750만.
  expect(side, side).toContain("양도가액 지분 50% 700,000,000");
  expect(side, side).toContain("취득가액 200,000,000");
  expect(side, side).toContain("필요경비 6,000,000");
});

test("BL-E2: 실지취득가액을 비워도 계산된다 — 엔진이 읽지 않는 값을 요구하지 않는다", async ({ page }) => {
  test.setTimeout(240_000);
  await seedAndOpen(page, [half({ bgActualAcquisitionLand: "" })]);
  const r = await calculate(page);
  expect(r.status(), await r.text()).toBe(200);
});

test("BL-E3: 취득시 기준시가를 비우면 막힌다 — 칸이 있어 막다른 길이 아니다", async ({ page }) => {
  test.setTimeout(240_000);
  await seedAndOpen(page, [half({ standardPriceAtAcq: "" })]);
  await openTransferSection(page);
  await expect(page.getByTestId("bg-acq-std-price").first()).toBeVisible();
  await clickToCalc(page);
  await expect(page.getByText(/취득시 기준시가.*입력하세요/).first()).toBeVisible({ timeout: 20_000 });
});

test("BL-E4: 보충적평가 승(채무 3억)이면 실지취득가액 요구가 그대로다", async ({ page }) => {
  test.setTimeout(240_000);
  await seedAndOpen(page, [half({ bgMortgageDebtAmount: "300000000", bgMortgageSetAmount: "300000000", bgActualAcquisitionLand: "" })]);
  await expect(page.getByTestId("bg-collateral-forced-notice")).toHaveCount(0);
  await clickToCalc(page);
  await expect(page.getByText(/실지취득가액을 입력하세요|취득가액.*입력/).first()).toBeVisible({ timeout: 20_000 });
});
