/**
 * E2E: 이월과세 × **시가 모드** × 담보 승(상증법 §66) — ⑧ 차단 해제(2단계) 화면 확인(⑤⑥⑦).
 * 계획서 `docs/00-pm/bg-carryover-mkt-collateral-win.plan.md`. 종전에는 단건이 「이월과세(…) 자산의 부담부증여에서 이 경우의 취득가액 산정 기준을 확인하지 못해」, 묶음이
 * 「…이월과세 자산은 함께 양도와 같이 계산하지 않습니다」로 막혔다.
 * 시료: 주택 · 시가 모드 · 양도시 시가 10억 · 차입금 12억(담보평가 12억 > 시가 → 담보 승, 채무비율 100%) · 취득시 기준시가 5억 · 당초 증여자 취득시 기준시가 1.5억.
 *
 *   ME-1. 묶음 2건 — 200 · 자산마다 [A] 150,000,000 · [B] 500,000,000 비교 카드(A 채택) · 사이드바 취득가액 150,000,000
 *   ME-2. 당초 증여자 기준시가 4.8억이면 이월과세 세액이 더 적어 B 채택 — 사이드바 취득가액 500,000,000(⑥↔⑦)
 *   ME-3. 단건 · 산정방식 매매사례가액 — 당초 증여자 기준시가 칸만 있고 매매사례가액·감정가액 입력은 없다(쓰이지 않는 값을 요구하지 않는다) · 200
 *   ME-4. 당초 증여자 기준시가를 비우면 막힌다(침묵 A = B 차단)
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
  bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "300000000",
  bgDonorRelation: "lineal_descendant", bgLendingDepositTotal: "0", bgMortgageDebtAmount: "1,200,000,000", bgMortgageSetAmount: "1,200,000,000",
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

test("ME-1: 시가 모드 담보 승 이월과세 함께 양도 — 200 · 자산마다 A/B 비교 카드 · A 채택 시 사이드바 A 취득가액", async ({ page }) => {
  test.setTimeout(240_000);
  await seedAndOpen(page, [house(1), house(2)]);
  const r = await calculate(page);
  expect(r.status(), await r.text()).toBe(200);
  expect((await r.json()).data.mode).toBe("bundled");

  const body = page.locator("body");
  await expect(body).toContainText("이월과세 비교과세 결과");
  await expect(body).toContainText(/\[당초 증여자 취득가\]\s*150,000,000/);
  await expect(body).toContainText(/\[수증자 취득가 × 채무비율 · 소령 §159①1호\]\s*500,000,000/);
  // 이월과세를 적용한 신고 전체 세액이 적용하지 않은 세액보다 크면 적용한다(§97의2②3호는 적용 시 세액이 더 적을 때만 배제).
  await expect(body).toContainText(/채택 시나리오:\s*A \(이월과세 적용\)/);
  await expect(body).not.toContainText("함께 양도와 같이 계산하지 않습니다");

  const side = await sidebarAfterCalc(page);
  expect(side).toContain("취득가액 150,000,000");
  expect(side).toContain("합계 양도가액 2,400,000,000");
});

test("ME-2: 당초 증여자 기준시가가 높아 이월과세 세액이 더 적으면 B 채택 — 사이드바가 B 취득가액(⑥↔⑦)", async ({ page }) => {
  test.setTimeout(240_000);
  const donorHigh = { bgCoDonorBuildingStdPriceAtAcq: "480000000" };
  await seedAndOpen(page, [house(1, donorHigh), house(2, donorHigh)]);
  const r = await calculate(page);
  expect(r.status(), await r.text()).toBe(200);
  await expect(page.locator("body")).toContainText(/\[당초 증여자 취득가\]\s*480,000,000/);
  await expect(page.locator("body")).toContainText(/채택 시나리오:\s*B \(비교과세 미적용\)/);

  const side = await sidebarAfterCalc(page);
  expect(side).toContain("취득가액 500,000,000");
});

test("ME-3: 단건 · 산정방식 매매사례가액 — 당초 증여자 기준시가 칸만 있고 쓰이지 않는 매매·감정 입력은 없다", async ({ page }) => {
  test.setTimeout(240_000);
  await seedAndOpen(page, [house(1, { bgAcquisitionMethod: "salesCase", bgPresumedAcquisitionTotal: "", bgActualAcquisitionTotal: "300000000" })]);
  await expect(page.getByTestId("bg-codonor-building-std")).toHaveCount(1);
  await expect(page.getByTestId("bg-collateral-forced-notice")).toContainText("이월과세이므로 당초 증여자");
  // 당초 증여자 박스 안에는 매매사례가액 입력(BurdenedGiftPresumedAcquisitionSection)이 없다
  await expect(page.getByTestId("bg-codonor-block").getByTestId("bg-presumed-law-line")).toHaveCount(0);
  const r = await calculate(page);
  expect(r.status(), await r.text()).toBe(200);
});

test("ME-4: 당초 증여자 기준시가를 비우면 막힌다(침묵 A = B 차단)", async ({ page }) => {
  test.setTimeout(240_000);
  await seedAndOpen(page, [house(1, { bgCoDonorBuildingStdPriceAtAcq: "" })]);
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  await page.getByRole("button", { name: /계산하기/ }).last().click();
  await expect(page.getByText(/이월과세가 적용되므로 「당초 증여자」.*기준시가/).first()).toBeVisible({ timeout: 20_000 });
});
