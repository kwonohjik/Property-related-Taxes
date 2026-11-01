/**
 * E2E: 승계 조합원입주권 부담부증여 × 담보(상증법 §66) 승 — 취득가액 = 입주권 기준시가(소령 §165①) × 채무비율, 개산공제 1% (I-1) 화면 확인(⑤⑥⑦⑧).
 * 계획서 `docs/00-pm/bg-successor-rtmi-std-acq.plan.md`. 종전에는 시가 모드 담보 승 입주권을 ⑧이 «입력 경로가 없어»로 막았고(엔진은 실지로 계산), 기준시가 입력 칸이 없었다.
 * 시료: 승계 입주권(취득 2020-01-01 · 승계취득가액 3억 + 추가분담금 1억) · 시가 모드 · 시가 15억 · 담보 30억(채무 30억 → 담보 승 · 채무비율 1) · 양도일 2026-02-16 ·
 * 취득일 기준시가 = 납입 2억 + 프리미엄 1억 = 3억.
 * 오라클(손계산): 양도가액 30억 − 취득가액 3억 × 1 − 개산공제 3억 × 1% = 300만 → 양도차익 2,697,000,000.
 *
 *   SE-1. 200 · 승계취득가액 칸 숨김 + 기준시가 2칸 · 필요경비 «개산공제만» · ⑦ 양도차익 2,697,000,000 · ⑥ 사이드바 양도가액 3,000,000,000 / 취득가액 300,000,000 / 필요경비 3,000,000
 *   SE-2. 기준시가 2칸을 비우면 막힌다(칸이 있어 막다른 길이 아니다)
 *   SE-3. 양도일이 2023-02-27(열거 이전)이면 기준시가 칸 없이 승계취득가액 칸 · 200 · 양도차익 2,600,000,000(실지 4억)
 *   SE-4. 원조합원은 계속 막힌다 — «원조합원 입주권의 기준시가»
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

const asset = (over: Record<string, unknown> = {}) => ({
  ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 9-9", assetKind: "right_to_move_in", redevSubject: "right",
  isSuccessorRightToMoveIn: true, redevIsSuccessorMember: "yes", acquisitionCause: "purchase", acquisitionDate: "2020-01-01",
  redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2018-06-01",
  successorRightAcqPrice: "300000000", successorRightAddedContribution: "100000000",
  successorRightStdPaidAtAcq: "200000000", successorRightStdPremiumAtAcq: "100000000",
  transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1500000000",
  bgLendingDepositTotal: "0", bgMortgageDebtAmount: "3000000000", bgMortgageSetAmount: "3000000000", bgAcquisitionMethod: "actual",
  bgRightMemberRightsValue: "1200000000", bgRightPaidInstallments: "200000000", bgRightPremium: "100000000", bgActualAcquisitionTotal: "",
  actualSalePrice: "", fixedAcquisitionPrice: "", ...over,
});

async function seed(page: Page, a: unknown, transferDate = "2026-02-16") {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), {
    state: {
      formData: {
        assets: [a], transferDate, filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "2", isOneHousehold: false,
        householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false,
      },
      pendingMigration: false,
    },
    version: 0,
  });
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  for (const n of [1, 2, 3] as const) await expandAssetSection(page, n);
}
const card = (page: Page) => page.locator('[data-asset-card-index="0"]');

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

test.describe("승계 입주권 부담부증여 × 담보 승 — 입주권 기준시가", () => {
  test.setTimeout(240_000);

  test("SE-1: 시가 모드 담보 승 — 200 · 기준시가 2칸 · 개산공제만 · 양도차익 2,697,000,000 · 사이드바 값", async ({ page }) => {
    await seed(page, asset());
    await expect(card(page).getByTestId("bg-successor-right-std-forced")).toBeVisible();
    await expect(card(page).locator('[data-field="successorRightStdPaidAtAcq"]')).toBeVisible();
    await expect(card(page).locator('[data-field="successorRightAcqPrice"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: /자본적 지출.*개산공제만/ }).first()).toBeVisible();
    const r = await calculate(page);
    expect(r.status(), await r.text()).toBe(200);
    expect((await r.json()).data.result.transferGain).toBe(2_697_000_000);
    await expect(page.locator("body")).toContainText("2,697,000,000");
    const side = await sidebarAfterCalc(page);
    expect(side, side).toContain("양도가액 3,000,000,000");
    expect(side, side).toContain("취득가액 300,000,000");
    expect(side, side).toContain("필요경비 3,000,000");
  });

  test("SE-2: 기준시가 2칸을 비우면 막힌다 — 칸이 있어 막다른 길이 아니다", async ({ page }) => {
    await seed(page, asset({ successorRightStdPaidAtAcq: "", successorRightStdPremiumAtAcq: "" }));
    await expect(card(page).locator('[data-field="successorRightStdPaidAtAcq"]')).toBeVisible();
    await clickToCalc(page);
    await expect(page.getByText(/취득일까지 납입한 금액과 취득일 현재의 프리미엄을 입력하세요/).first()).toBeVisible({ timeout: 20_000 });
  });

  test("SE-3: 양도일 2023-02-27(열거 이전)이면 기준시가 칸 없이 승계취득가액 칸 · 200 · 양도차익 2,600,000,000", async ({ page }) => {
    await seed(page, asset(), "2023-02-27");
    await expect(card(page).getByTestId("bg-successor-right-std-forced")).toHaveCount(0);
    await expect(card(page).locator('[data-field="successorRightAcqPrice"]')).toBeVisible();
    const r = await calculate(page);
    expect(r.status(), await r.text()).toBe(200);
    expect((await r.json()).data.result.transferGain).toBe(2_600_000_000);
  });

  test("SE-4: 원조합원은 계속 막힌다", async ({ page }) => {
    await seed(page, asset({ isSuccessorRightToMoveIn: false, redevIsSuccessorMember: "", acquisitionDate: "2009-07-01", bgActualAcquisitionTotal: "300000000" }));
    await clickToCalc(page);
    await expect(page.getByText(/원조합원 입주권의 기준시가/).first()).toBeVisible({ timeout: 20_000 });
  });
});
