/**
 * 재개발·재건축 §166③ 환산 — 화면 경로 (계획서 `docs/02-design/features/companion-redev-166-3-required.plan.md` · PR #2574)
 *
 *   RS-1 리뷰 게이트 D-2: §164⑦ 본문 발동 중 건물 기준시가 2칸을 비우면 ④가 0을 싣고, 결과가 「0」 직접 입력·화면 미리보기와 같다
 *        (종전: ④가 칸을 생략해 본문이 발동하지 않았고 숨은 분자 칸 0으로 200 · 취득가액 0)
 *   RS-2 리뷰 게이트 D-1: 부담부증여 기준시가 평가에 남은 「환산」 · §166③ 칸 비움 → 200 · 산정방식 「실지」와 같은 세액
 *        (엔진은 §159①1호 괄호로 취득가액을 기준시가로 강제해 §166③을 쓰지 않는다 — ⑫가 화면에 없는 칸을 요구하면 안 된다)
 *   RS-3 함께 양도 재개발(일반 양도 환산) → 200 · 컴패니언 §166③ 141,221,534 (평가액 219,218,500 × 85,034,988 ÷ 132,000,000)
 *   RS-4 함께 양도 재개발 분자 비움 → 「계산하기」에서 ⑧이 막고 요청이 나가지 않는다
 *        (사이드바 단계 이동은 검증 없이 넘어간다 — 막는 시점은 계산하기)
 * 사람이 브라우저로 직접 한 수동 확인은 아니다(headless Playwright). 워크트리는 `E2E_PORT=<포트> npx playwright test <spec>`.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const PHD_MAIN = (building: string) => ({
  ...makeDefaultAsset(1),
  addressJibun: "경기도 수원시 영통구 영통동 957-6",
  assetKind: "redevelopment_apt",
  acquisitionCause: "purchase",
  acquisitionDate: "2003-05-10",
  useEstimatedAcquisition: true,
  redevSubject: "apt",
  redevApprovalLawBasis: "urban_renovation_art_74",
  redevOriginalAssetType: "housing",
  redevSettlementDirection: "pay",
  redevApprovalDate: "2009-06-01",
  redevCompletionDate: "2012-09-01",
  redevRightsValue: "300000000",
  redevSettlementAmount: "50000000",
  redevPreApprovalExpenses: "0",
  redevPostApprovalExpenses: "0",
  redevManagementDisposalHousingPrice: "132000000",
  redevFirstDisclosureDate: "2005-04-30",
  redevFirstDisclosureHousingPrice: "86000000",
  redevLandArea: "83.2",
  redevLandPricePerSqmAtAcq: "1200000",
  redevLandPricePerSqmAtFirst: "1400000",
  redevBuildingStdPriceAtAcq: building,
  redevBuildingStdPriceAtFirst: building,
});

const REDEV: Record<string, unknown> = {
  addressJibun: "서울 강남구 테스트동 1-1",
  assetKind: "redevelopment_apt",
  actualSalePrice: "525,000,000",
  redevSubject: "apt",
  redevApprovalLawBasis: "urban_renovation_art_74",
  redevApprovalDate: "2009-10-23",
  redevRightsValue: "219,218,500",
  redevSettlementDirection: "pay",
  redevSettlementAmount: "92,781,500",
  redevCompletionDate: "2012-09-01",
  redevManagementDisposalHousingPrice: "132,000,000",
  redevAcquisitionHousingPrice: "85,034,988",
  acquisitionCause: "inheritance",
  acquisitionDate: "1980-01-01",
  inheritanceStartDate: "1980-01-01",
  decedentAcquisitionDate: "1970-01-01",
  inheritanceAssetKind: "house_individual",
  transferType: "burdened_gift",
  bgDonorRelation: "lineal_descendant",
  standardPriceAtTransfer: "400,000,000",
  bgValuationMode: "sangjeungbeop_market",
  bgMarketValueAtTransfer: "525,000,000",
  bgMortgageDebtAmount: "210,000,000",
};
const STD_MODE = { bgValuationMode: "sangjeungbeop_standard", bgMortgageDebtAmount: "160,000,000", standardPriceAtAcq: "50,000,000" };
const STALE = { acquisitionCause: "purchase", bgAcquisitionMethod: "converted", redevManagementDisposalHousingPrice: "", redevAcquisitionHousingPrice: "" };
const ACTUAL = { acquisitionCause: "purchase", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "200,000,000", redevManagementDisposalHousingPrice: "", redevAcquisitionHousingPrice: "" };
const REGULAR_EST = { transferType: "regular", bgValuationMode: "", bgMarketValueAtTransfer: "", bgMortgageDebtAmount: "", bgAcquisitionMethod: "", bgActualAcquisitionTotal: "", acquisitionCause: "purchase", useEstimatedAcquisition: true };
const HOUSING_REGULAR = {
  ...makeDefaultAsset(1),
  addressJibun: "서울 강남구 테스트동 2-2", assetKind: "housing", actualSalePrice: "300,000,000", acquisitionCause: "purchase", acquisitionDate: "2000-01-01",
  transferType: "regular", fixedAcquisitionPrice: "100,000,000", standardPriceAtTransfer: "200,000,000",
};

function form(assets: unknown[], over: Record<string, unknown>) {
  return {
    state: {
      formData: {
        assets,
        totalTransferExpense: "0",
        householdHousingCount: "2",
        householdNoOtherHousesConfirmed: true,
        householdNoPresaleRightsConfirmed: true,
        isOneHousehold: false,
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
        ...over,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function seedAndOpen(page: Page, seed: unknown) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), seed);
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

async function calculate(page: Page) {
  const calcResponse = page.waitForResponse(
    (r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST",
    { timeout: 60_000 },
  );
  for (const step of ["보유 상황", "감면·공제", "가산세"]) {
    await page.getByRole("button", { name: step }).first().click();
  }
  await page.getByRole("button", { name: /계산하기/ }).last().click();
  const res = await calcResponse;
  const json = (await res.json()) as Loose;
  expect(res.status(), JSON.stringify(json).slice(0, 800)).toBe(200);
  await page.locator('[data-print-id="form-table"]').first().waitFor({ timeout: 60_000 });
  return { sent: res.request().postDataJSON() as Loose, json };
}

const resultOf = (j: Loose) => (j.data?.result ?? j.result) as Loose;

test.describe("재개발 §166③ 환산 — 화면 경로", () => {
  test("RS-1: §164⑦ 건물 기준시가 비움 → 0 전송 · 「0」 입력과 같은 결과 · 미리보기 167,532,465와 일치", async ({ page }) => {
    test.setTimeout(240_000);
    const runOne = async (building: string) => {
      await seedAndOpen(page, form([PHD_MAIN(building)], { transferDate: "2026-03-02", filingDate: "2026-04-30", contractTotalPrice: "420000000" }));
      for (const n of [1, 2, 3] as const) await expandAssetSection(page, n);
      const preview = page.locator('[data-asset-card-index="0"]').getByText("환산취득가 미리보기").locator("..");
      await expect(preview).toContainText("발동 — 2단계 산식 적용");
      await expect(preview).toContainText("= 167,532,465");
      const { sent, json } = await calculate(page);
      return { rd: sent.redevelopment as Loose, result: resultOf(json) };
    };
    const empty = await runOne("");
    expect(empty.rd.buildingStdPriceAtAcq).toBe(0);
    expect(empty.rd.buildingStdPriceAtFirst).toBe(0);
    expect(empty.result.redevelopmentDetail.preApproval.apportionedAcquisition).toBe(167_532_465);
    const zero = await runOne("0");
    expect(zero.result.redevelopmentDetail.preApproval.apportionedAcquisition).toBe(167_532_465);
    expect(empty.result.determinedTax).toBe(zero.result.determinedTax);
  });

  test("RS-2: 부담부증여 기준시가 평가 · 남은 「환산」 · §166③ 칸 비움 → 200 · 「실지」와 같은 세액", async ({ page }) => {
    test.setTimeout(240_000);
    const over = { transferDate: "2026-02-16", filingDate: "2026-04-30", contractTotalPrice: "525000000", householdHousingCount: "0" };
    await seedAndOpen(page, form([{ ...makeDefaultAsset(1), ...REDEV, ...STD_MODE, ...STALE }], over));
    const stale = await calculate(page);
    expect(stale.sent.burdenedGiftInfo.acquisitionMethod).toBe("converted");
    await seedAndOpen(page, form([{ ...makeDefaultAsset(1), ...REDEV, ...STD_MODE, ...ACTUAL }], over));
    const actual = await calculate(page);
    expect(resultOf(stale.json).determinedTax).toBe(resultOf(actual.json).determinedTax);
  });

  test("RS-3: 함께 양도 재개발(일반 양도 환산) → 200 · 컴패니언 §166③ 141,221,534", async ({ page }) => {
    test.setTimeout(240_000);
    const over = { transferDate: "2026-02-16", filingDate: "2026-04-30", contractTotalPrice: "825000000", householdHousingCount: "0" };
    await seedAndOpen(page, form([HOUSING_REGULAR, { ...makeDefaultAsset(2), ...REDEV, ...REGULAR_EST }], over));
    const { sent, json } = await calculate(page);
    expect(sent.companionAssets[0].useEstimatedAcquisition).toBe(true);
    expect(json.data.aggregated.properties[1].redevelopmentDetail.preApproval.apportionedAcquisition).toBe(141_221_534);
  });

  test("RS-4: 함께 양도 재개발 분자 비움 → 계산하기에서 막히고 요청 없음", async ({ page }) => {
    test.setTimeout(240_000);
    const over = { transferDate: "2026-02-16", filingDate: "2026-04-30", contractTotalPrice: "825000000", householdHousingCount: "0" };
    await seedAndOpen(page, form([HOUSING_REGULAR, { ...makeDefaultAsset(2), ...REDEV, ...REGULAR_EST, redevAcquisitionHousingPrice: "" }], over));
    let posted = false;
    page.on("request", (r) => { if (r.url().includes("/api/calc/transfer") && r.method() === "POST") posted = true; });
    for (const step of ["보유 상황", "감면·공제", "가산세"]) {
      await page.getByRole("button", { name: step }).first().click();
    }
    await page.getByRole("button", { name: /계산하기/ }).last().click();
    await expect(page.getByText("자산 2: 환산 모드 — 취득당시 개별주택공시가격을 입력하세요", { exact: false }).first()).toBeVisible();
    await expect(page.locator('[data-print-id="form-table"]')).toHaveCount(0);
    expect(posted).toBe(false);
  });
});
