/**
 * E2E: 부담부증여 **축 A(공유 소유) 지분 재개발 APT(완공 아파트) × 시가 모드 × 담보 승(상증법 §66)** — ⑧ 차단 해소 + ⑤ 취득시 기준시가 칸 + ⑦ 값 +
 * 시가·환산취득가액(K-5) 조합도 연다 (V-S1g Q-1 a → 전면 개방 Q-1 b · Q-3 a).
 * 계획서 `docs/00-pm/bg-redev-fractional-collateral-win.plan.md` §3·§4 · `bg-redev-fractional-k5-full-open.plan.md`. 종전에는 «지분 50%를 가진 자산에서 담보평가액 … 계산하지 않습니다»로 막혔다.
 * 시료: 재개발 완공 APT(원조합원 · 주택 출자 · 청산금 납부 지분 해당분 46,390,750) · 지분 50% · 시가 모드 · 시가 10억 · 본인 인수 채무 7억 > 지분 시가 5억 → 담보 승 · 취득시 기준시가 4억.
 *
 *   RD-E1. K-4 담보 승 — 200 · 취득시 기준시가 칸 · 차단 문구 없음 · ⑦ 양도차익 447,609,250 · 「인가전 분 필요경비」 칸 대신 개산공제 안내(축으로 승자 확정 — Q-3 a)
 *   RD-E2. 취득시 기준시가를 비우면 막힌다(칸이 있어 막다른 길이 아니다)
 *   RD-E3. K-5(환산취득가액) 담보 승 — 200 · 취득시 기준시가 칸 · §166③ 환산 칸(인가일 개별주택공시가격) 없음 · 양도차익 447,609,250
 *   RD-E4. 보충적평가 승(채무 3억)은 담보 승 안내가 없고 「인가전 분 필요경비」 칸이 보인다(실비 공제)
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
const LUMP = "redev-pre-expense-lump-notice";
const EXPENSE_FIELD = '[data-field="redevPreApprovalExpenses"]';

test("RD-E1: 축 A 지분 재개발 시가 K-4 담보 승 — 200 · 취득시 기준시가 칸 · 양도차익 447,609,250 · 필요경비 칸 대신 개산공제 안내", async ({ page }) => {
  test.setTimeout(240_000);
  await seedAndOpen(page, [half()]);
  await expect(page.getByTestId("bg-collateral-forced-notice")).toHaveCount(1);
  await openAcquisitionSection(page);
  await expect(page.getByTestId(LUMP).first()).toBeVisible();
  await expect(page.locator(EXPENSE_FIELD)).toHaveCount(0);
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

test("RD-E3: 시가 K-5(환산취득가액) 담보 승 지분 — 200 · 취득시 기준시가 칸 · §166③ 환산 칸 없음 · 양도차익 447,609,250", async ({ page }) => {
  test.setTimeout(240_000);
  await seedAndOpen(page, [half({ bgAcquisitionMethod: "converted", redevManagementDisposalHousingPrice: "", redevAcquisitionHousingPrice: "" })]);
  await expect(page.getByTestId("bg-collateral-forced-notice")).toHaveCount(1);
  await openAcquisitionSection(page);
  await expect(page.locator('[data-field="redevManagementDisposalHousingPrice"]')).toHaveCount(0);
  await openTransferSection(page);
  await expect(page.getByTestId("bg-acq-std-price").first()).toBeVisible();
  const r = await calculate(page);
  expect(r.status(), await r.text()).toBe(200);
  await expect(page.locator("body")).not.toContainText("«실지취득가액»을 고르세요");
  await expect(page.locator("body")).toContainText("447,609,250");
});

test("RD-E4: 보충적평가 승(채무 3억)은 담보 승 안내가 없다 — 「인가전 분 필요경비」 칸이 보인다", async ({ page }) => {
  test.setTimeout(240_000);
  await seedAndOpen(page, [half({ bgMortgageDebtAmount: "300000000", bgMortgageSetAmount: "300000000" })]);
  await expect(page.getByTestId("bg-collateral-forced-notice")).toHaveCount(0);
  await openAcquisitionSection(page);
  await expect(page.locator(EXPENSE_FIELD).first()).toBeVisible();
  await expect(page.getByTestId(LUMP)).toHaveCount(0);
});

// ── V-5 사이드바 렌더(계획서 `bg-redev-fractional-k5-full-open.plan.md` §9) — 축 B 60/40 · K-5 · 인가 전 실비 2천만 원 입력 ──
// 부담부증여는 계산 전 필요경비가 축·승자와 무관하게 «계산 후 표시»다(`transfer-per-asset-summary.ts` `usesSelfComputedTransferPrice` 분기가
// 재개발 축 분기보다 먼저 잡는다). 계산 후 사이드바는 결과 신고서 표의 카드별 필요경비와 같다.
// 담보 승(물건 전체 채무 14억)은 개산공제라 실비와 무관(7,200,000 / 4,800,000), 보충 승(전체 채무 6억)은 실비를 쓴다 — 실비 0이면 «-».
const axisB = (debtTotal: string, over: Record<string, unknown> = {}) => [
  half({ ownershipNumerator: "60", ownershipRemainderThirdParty: undefined, redevSettlementAmount: "55668900", bgMortgageDebtAmount: debtTotal, bgMortgageSetAmount: debtTotal, ...over }),
  half({ assetId: "s", ownershipNumerator: "40", ownershipRemainderThirdParty: undefined, redevSettlementAmount: "37112600", bgMortgageDebtAmount: debtTotal, bgMortgageSetAmount: debtTotal, ...over }),
];
const K5_BLANK = { bgAcquisitionMethod: "converted", redevManagementDisposalHousingPrice: "", redevAcquisitionHousingPrice: "" };

async function seedAxisB(page: Page, assets: unknown[]) {
  await page.setViewportSize({ width: 1400, height: 1000 }); // 사이드바는 lg 이상에서만 렌더
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), seedWithDeclaredRoster({
    state: {
      formData: {
        assets, transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", assetSplitMode: "fractional", contractTotalPrice: "525000000",
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
/** 사이드바 「필요경비」 라벨 바로 다음 줄(카드 순서) */
async function sidebarExpenses(page: Page) {
  const lines = (await page.locator("aside").first().innerText()).split("\n").map((s) => s.trim()).filter(Boolean);
  return lines.flatMap((l, i) => (l === "필요경비" ? [lines[i + 1]] : []));
}
async function calcAndReturn(page: Page) {
  const r = await calculate(page);
  expect(r.status(), await r.text()).toBe(200);
  const row = (await page.locator("table tr").filter({ hasText: /^\s*필요경비/ }).first().innerText()).replace(/\s+/g, " ");
  await page.getByRole("button", { name: "이전 단계로 이동" }).click();
  await page.locator("aside").first().waitFor();
  return row;
}

test("RD-E5: 축 B 60/40 · K-5 · 담보 승 — 사이드바 계산 전 «계산 후 표시» × 2 · 계산 후 7,200,000 / 4,800,000 = 신고서 표", async ({ page }) => {
  test.setTimeout(240_000);
  await seedAxisB(page, axisB("1400000000", { ...K5_BLANK, redevPreApprovalExpenses: "20000000" }));
  expect(await sidebarExpenses(page)).toEqual(["계산 후 표시", "계산 후 표시"]);
  const row = await calcAndReturn(page);
  expect(row).toContain("12,000,000 7,200,000 4,800,000");
  await expect.poll(() => sidebarExpenses(page)).toEqual(["7,200,000", "4,800,000"]);
});

test("RD-E6: 축 B 60/40 · 보충 승(물건 전체 채무 6억) · 실비 0 — 실비를 쓰므로 계산 후 사이드바 «-» × 2 (축 A로 읽으면 40% 카드가 담보 승이 된다)", async ({ page }) => {
  test.setTimeout(240_000);
  await seedAxisB(page, axisB("600000000", { redevPreApprovalExpenses: "0" }));
  expect(await sidebarExpenses(page)).toEqual(["계산 후 표시", "계산 후 표시"]);
  const row = await calcAndReturn(page);
  expect(row).toContain("필요경비 0 0 0");
  await expect.poll(() => sidebarExpenses(page)).toEqual(["-", "-"]);
});
