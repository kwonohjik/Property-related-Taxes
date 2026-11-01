/**
 * E2E: 공유 지분(축 A) 승계 조합원입주권 부담부증여 × 담보 승 — 입주권 기준시가 2칸 · 양도차익 (X-2) 화면 확인(⑤⑥⑦⑧).
 * 계획서 `docs/00-pm/bg-successor-rtmi-axis-a-share.plan.md`. 종전에는 기준시가 모드에서 ⑧ 통과 ∧ ⑫ 400 막다른 길(칸이 숨겨짐), 시가 모드는 ⑧ 차단이었다.
 * 시료: I-1 시료 + 지분 50%(제3자 공유) · 담보 본인분 15억 · 시가 15억(물건 전체) · 취득일 기준시가 3억(물건 전체) · 양도일 2026-02-16.
 * 오라클(손계산): 양도가액 15억 − 취득가액 3억 × 0.5 × 1 = 1.5억 − 개산공제 1.5억 × 1% = 150만 → 양도차익 1,348,500,000.
 *
 *   XE-1. 시가 모드: 기준시가 2칸 노출(승계취득가액 숨김) · 200 · 1,348,500,000 · ⑥ 사이드바 양도가액(지분 50%) 1,500,000,000 / 취득가액 150,000,000 / 필요경비 1,500,000
 *   XE-2. 기준시가 모드: 같은 칸 노출 · 200 · 1,348,500,000 (종전 막다른 길)
 *   XE-3. 기준시가 2칸을 비우면 막힌다(칸이 있어 막다른 길이 아니다)
 *   XE-4. 원조합원 열거 이후는 계속 막힌다
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

test.describe("공유 지분 승계 입주권 × 담보 승 — 입주권 기준시가", () => {
  test.setTimeout(240_000);
  const SHARE = { ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "yes", bgMortgageDebtAmount: "1500000000", bgMortgageSetAmount: "1500000000" };

  for (const [id, mode] of [["XE-1", "sangjeungbeop_market"], ["XE-2", "sangjeungbeop_standard"]] as const) {
    test(`${id}: ${mode === "sangjeungbeop_market" ? "시가" : "기준시가"} 모드 — 기준시가 2칸 · 200 · 1,348,500,000`, async ({ page }) => {
      await seed(page, asset({ ...SHARE, bgValuationMode: mode }));
      await expect(card(page).getByTestId("bg-successor-right-std-forced")).toBeVisible();
      await expect(card(page).locator('[data-field="successorRightStdPaidAtAcq"]')).toBeVisible();
      await expect(card(page).locator('[data-field="successorRightAcqPrice"]')).toHaveCount(0);
      const r = await calculate(page);
      expect(r.status(), await r.text()).toBe(200);
      expect((await r.json()).data.result.transferGain).toBe(1_348_500_000);
      await expect(page.locator("body")).toContainText("1,348,500,000");
      if (id === "XE-1") {
        const side = await sidebarAfterCalc(page);
        expect(side, side).toContain("양도가액 지분 50% 1,500,000,000");
        expect(side, side).toContain("취득가액 150,000,000");
        expect(side, side).toContain("필요경비 1,500,000");
      }
    });
  }

  test("XE-3: 기준시가 2칸을 비우면 막힌다 — 칸이 있어 막다른 길이 아니다", async ({ page }) => {
    await seed(page, asset({ ...SHARE, bgValuationMode: "sangjeungbeop_standard", successorRightStdPaidAtAcq: "", successorRightStdPremiumAtAcq: "" }));
    await expect(card(page).locator('[data-field="successorRightStdPaidAtAcq"]')).toBeVisible();
    await clickToCalc(page);
    await expect(page.getByText(/취득일까지 납입한 금액과 취득일 현재의 프리미엄을 입력하세요/).first()).toBeVisible({ timeout: 20_000 });
  });

  test("XE-4: 원조합원 열거 이후는 계속 막힌다", async ({ page }) => {
    await seed(page, asset({ ...SHARE, isSuccessorRightToMoveIn: false, redevIsSuccessorMember: "", acquisitionDate: "2009-07-01", bgActualAcquisitionTotal: "300000000" }));
    await clickToCalc(page);
    await expect(page.getByText(/원조합원 입주권의 기준시가/).first()).toBeVisible({ timeout: 20_000 });
  });
});
