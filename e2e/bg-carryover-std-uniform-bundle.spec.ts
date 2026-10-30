/**
 * E2E: 이월과세 × 기준시가 모드 × 담보 승 × 함께 양도 — ⑧ 묶음 게이트 해제(1단계) 화면 확인(⑤⑥⑦).
 * 계획서 `docs/00-pm/bg-carryover-std-uniform-bundle.plan.md`. 종전에는 「이월과세 자산은 함께 양도와 같이 계산하지 않습니다」로 막혔다.
 * 시료: 주택 2건 · 기준시가 모드 · 양도시 기준시가 10억 · 차입금 15억(담보 승, 채무비율 100%) · 취득시 기준시가 5억 · 당초 증여자 취득시 기준시가 1.5억.
 *
 *   BU-E1. 계산이 200으로 끝나고 자산마다 [A] 당초 증여자 150,000,000 · [B] 수증자 500,000,000 비교 카드가 뜬다(B 채택) · 사이드바 취득가액 500,000,000
 *   BU-E2. 당초 증여자 취득일이 최근이면 A 채택 — 사이드바 취득가액 150,000,000 · 필요경비 4,500,000(⑥↔⑦ 일치)
 *   BU-E3. 둘째 자산의 당초 증여자 취득시 기준시가 칸이 화면에 있고, 비우면 「자산 2」로 막힌다
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

const house = (id: number, over: Record<string, unknown> = {}, carryover: Record<string, unknown> = {}) => ({
  ...makeDefaultAsset(id),
  addressJibun: `서울 강남구 테스트동 ${id}-1`, assetKind: "housing", transferType: "burdened_gift", acquisitionCause: "carryover_gift", acquisitionDate: "2023-06-01",
  carryover: {
    giftRegistryDate: "2023-06-01", donorAcquisitionDate: "2000-06-01", donorAcquisitionCause: "purchase", donorAcquisitionPrice: "100000000", useEstimatedAcquisition: false,
    estimationMode: "", giftTaxAmount: "0", donorCapitalExpenditure: "0", giftDateValuation: "600000000", exclusionDeclared: {}, donorRelation: "lineal", donorSameHousehold: "no", ...carryover,
  },
  bgValuationMode: "sangjeungbeop_standard", bgDonorRelation: "lineal_descendant", bgLendingDepositTotal: "0", bgMortgageDebtAmount: "1,500,000,000", bgMortgageSetAmount: "1,500,000,000",
  standardPriceAtTransfer: "1000000000", standardPriceAtAcq: "500000000", bgCoDonorLandStdPriceAtAcq: "0", bgCoDonorBuildingStdPriceAtAcq: "150000000",
  ...over,
});

async function seedAndOpen(page: Page, assets: unknown[]) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), {
    state: {
      formData: {
        assets, transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "2", isOneHousehold: false,
        householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false,
      },
      pendingMigration: false,
    },
    version: 0,
  });
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

async function calculate(page: Page) {
  const res = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  await page.getByRole("button", { name: /계산하기/ }).last().click();
  return res;
}

/** 결과 → 입력 단계로 돌아가 사이드바(⑥)를 읽는다 — 계산 전에는 「계산 후 표시」다. */
async function sidebarAfterCalc(page: Page) {
  await page.getByRole("button", { name: /^이전/ }).last().click();
  await page.getByRole("button", { name: "가산세" }).first().click();
  const aside = page.locator("aside");
  await expect(aside).toContainText("합계");
  return (await aside.innerText()).replace(/\s+/g, " ");
}

test("BU-E1: 담보 승 이월과세 함께 양도 — 200 · 자산마다 A/B 비교 카드 · 사이드바 B 취득가액", async ({ page }) => {
  test.setTimeout(240_000);
  await seedAndOpen(page, [house(1), house(2)]);
  const r = await calculate(page);
  expect(r.status(), await r.text()).toBe(200);
  expect((await r.json()).data.mode).toBe("bundled");

  const body = page.locator("body");
  await expect(body).toContainText("이월과세 비교과세 결과");
  await expect(body).toContainText(/\[당초 증여자 취득가\]\s*150,000,000/);
  await expect(body).toContainText(/\[수증자 취득가 × 채무비율 · 소령 §159①1호\]\s*500,000,000/);
  await expect(body).toContainText(/채택 시나리오:\s*B \(비교과세 미적용\)/);

  const side = await sidebarAfterCalc(page);
  expect(side).toContain("취득가액 500,000,000");
  expect(side).toContain("필요경비 15,000,000");
  expect(side).toContain("합계 양도가액 3,000,000,000");
});

test("BU-E2: 당초 증여자 취득일이 최근이면 A 채택 — 사이드바가 A 취득가액(⑥↔⑦)", async ({ page }) => {
  test.setTimeout(240_000);
  await seedAndOpen(page, [house(1, {}, { donorAcquisitionDate: "2020-01-01" }), house(2, {}, { donorAcquisitionDate: "2020-01-01" })]);
  const r = await calculate(page);
  expect(r.status(), await r.text()).toBe(200);
  await expect(page.locator("body")).toContainText(/채택 시나리오:\s*A \(이월과세 적용\)/);

  const side = await sidebarAfterCalc(page);
  expect(side).toContain("취득가액 150,000,000");
  expect(side).toContain("필요경비 4,500,000");
});

test("BU-E3: 둘째 자산의 당초 증여자 기준시가 칸이 화면에 있고, 비우면 「자산 2」로 막힌다", async ({ page }) => {
  test.setTimeout(240_000);
  await seedAndOpen(page, [house(1), house(2, { bgCoDonorBuildingStdPriceAtAcq: "" })]);
  await expect(page.getByTestId("bg-codonor-building-std")).toHaveCount(2);
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  await page.getByRole("button", { name: /계산하기/ }).last().click();
  await expect(page.getByText(/자산 2: 이월과세가 적용되므로 「당초 증여자」.*기준시가/).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("함께 양도와 같이 계산하지 않습니다")).toHaveCount(0);
});
