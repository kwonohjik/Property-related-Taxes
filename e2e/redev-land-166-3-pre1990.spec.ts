/**
 * E2E: 원조합원 재개발 자산 「취득당시 토지 ㎡당 단가」의 영 §164④ 파생. 계획서 `docs/02-design/features/successor-right-carryover-contribution.plan.md` §18.
 *
 *   RL-E1. 토지 출자 입주권 · 매매 1987 · 환산 — ⑤ 분자 칸 아래 §164④ 칸에 1990.1.1. 공시지가·등급 3종을 입력하면 분자 칸에 2,400,000이 보이고
 *          ④가 분자 480,000,000을 싣는다 · 인가 전 분 취득가액 200,000,000(종전: ⑧ 「취득당시 토지 ㎡당 단가를 입력하세요」로 막힘)
 *   RL-E2. 토지 출자 입주권 · 상속 1984 — ⑤는 안내만(칸은 취득 정보의 ② 칸) · 등급 한 번 입력으로 ③ 분자 480,000,000
 *   RL-E3. 주택 출자 입주권 · 매매 1988 · §164⑦ 본문 — §164④ 칸이 뜨고 ④가 취득시 토지 ㎡당 단가 2,400,000을 싣는다
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

async function seed(page: Page, assets: unknown[]) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    {
      state: {
        formData: {
          assets, contractTotalPrice: "1300000000", transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "1", isOneHousehold: false,
          householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false,
        },
        pendingMigration: false,
      },
      version: 0,
    },
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

async function calc(page: Page) {
  const res = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  await page.getByRole("button", { name: /계산하기/ }).last().click();
  const r = await res;
  expect(r.status(), await r.text()).toBe(200);
  return { body: r.request().postDataJSON(), data: (await r.json()).data };
}

const OM = (over: Record<string, unknown>) => ({
  ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 7-1", assetKind: "right_to_move_in", redevSubject: "right", redevApprovalLawBasis: "urban_renovation_art_74", redevOriginalAssetType: "land",
  redevSettlementDirection: "pay", redevApprovalDate: "2015-03-01", redevRightsValue: "500000000", redevPreApprovalExpenses: "0", redevIsSuccessorMember: "no",
  isSuccessorRightToMoveIn: false, useEstimatedAcquisition: true, redevActualAcquisitionPrice: "", redevSettlementAmount: "100000000", redevLandArea: "200",
  actualSalePrice: "1,300,000,000", fixedSalePrice: "1,300,000,000", transferType: "regular", acquisitionCause: "purchase", acquisitionDate: "1987-06-01",
  ...over,
});
// ② §164④ ㎡당 = 3,000,000 × 80,000 ÷ 100,000 = 2,400,000
const GRADE = { pre1990GradeMode: "value", pre1990Grade_current: "100000", pre1990Grade_prev: "100000", pre1990Grade_atAcq: "80000", pre1990PricePerSqm_1990: "3000000" };
const acqInput = (page: Page) => page.locator('[data-field="redevLandPricePerSqmAtAcq"] input').first();

test("RL-E1: 토지 출자 매매 1987 — ⑤ §164④ 칸 입력 → 분자 2,400,000 · 인가 전 분 취득가액 200,000,000", async ({ page }) => {
  test.setTimeout(240_000);
  await seed(page, [OM({ redevLandPricePerSqmAtApproval: "6000000", pre1990GradeMode: "value" })]);
  await page.getByRole("button", { name: /3\s*취득/ }).first().click();
  const card = page.getByTestId("redev-land-sec164-input");
  await expect(card).toBeVisible();
  await expect(acqInput(page)).toHaveValue("");
  const p1990 = card.locator('[data-field="pre1990PricePerSqm_1990"]');
  await ((await p1990.evaluate((e) => e.tagName)) === "INPUT" ? p1990 : p1990.locator("input")).fill("3000000");
  await card.locator('[data-field="pre1990Grade_current"] input').fill("100000");
  await card.locator('[data-field="pre1990Grade_prev"] input').fill("100000");
  await card.locator('[data-field="pre1990Grade_atAcq"] input').fill("80000");
  await expect(acqInput(page)).toHaveValue("2,400,000");
  await expect(card).toContainText("2,400,000원/㎡");
  const { body, data } = await calc(page);
  expect(body.redevelopment.landStdPriceAtAcq).toBe(480_000_000);
  expect(body.pre1990Land).toBeUndefined();
  expect(data.result.redevelopmentDetail?.preApproval?.apportionedAcquisition ?? data.result.redevelopment?.preApproval?.apportionedAcquisition).toBe(200_000_000);
});

test("RL-E2: 토지 출자 상속 1984 — ⑤는 안내만 · 취득 정보 ② 칸 한 번 입력으로 ③ 분자 480,000,000", async ({ page }) => {
  test.setTimeout(240_000);
  const a = OM({ ...GRADE, acquisitionCause: "inheritance", acquisitionDate: "1984-06-01", inheritanceStartDate: "1984-06-01", publishedValueAtInheritance: "300000000",
    inheritanceValuationMethod: "supplementary", decedentAcquisitionDate: "1980-01-01", redevLandPricePerSqmAtApproval: "2000000" });
  await seed(page, [a]);
  await page.getByRole("button", { name: /3\s*취득/ }).first().click();
  await expect(page.getByTestId("redev-land-sec164-shared-note")).toContainText("2,400,000원/㎡");
  await expect(page.getByTestId("redev-land-sec164-input")).toHaveCount(0);
  await expect(page.locator('[data-field="pre1990Grade_current"]')).toHaveCount(1);
  await expect(page.locator('[data-field="pre1990Grade_current"]').first()).toBeVisible();
  const { body, data } = await calc(page);
  expect(body.redevelopment.landStdPriceAtAcq).toBe(480_000_000);
  expect(data.result.inheritedAcquisitionDetail.acquisitionPrice).toBe(600_000_000);
});

test("RL-E3: 주택 출자 매매 1988 §164⑦ 본문 — §164④ 칸 · 취득시 토지 ㎡당 단가 2,400,000", async ({ page }) => {
  test.setTimeout(240_000);
  const a = OM({ ...GRADE, redevOriginalAssetType: "housing", acquisitionDate: "1988-06-01", redevManagementDisposalHousingPrice: "500000000", redevFirstDisclosureDate: "2005-04-30",
    redevFirstDisclosureHousingPrice: "100000000", redevLandArea: "100", redevBuildingStdPriceAtAcq: "10000000", redevLandPricePerSqmAtFirst: "800000", redevBuildingStdPriceAtFirst: "15000000" });
  await seed(page, [a]);
  await page.getByRole("button", { name: /3\s*취득/ }).first().click();
  await expect(page.getByTestId("redev-land-sec164-input")).toBeVisible();
  await expect(acqInput(page)).toHaveValue("2,400,000");
  const { body } = await calc(page);
  expect(body.redevelopment.landPricePerSqmAtAcq).toBe(2_400_000);
});
