/**
 * E2E: 컴패니언(함께양도·지분 카드)의 신축·증축 특례(소득세법 §114조의2) — 입력이 엔진에 닿는다
 *
 * 종전에는 컴패니언 카드에도 「본인이 신축 또는 증축한 건물입니까?」 칸이 있는데 ⑫·④가 그 값을 싣지 않아
 * 첫 자산만 가산세가 붙고 컴패니언은 조용히 0이었다.
 *   CS-1. 부담부증여 지분 카드(축 B) × 신축 × 감정가액 — 자산 2의 신축이 가산세 6,000,000(감정가액 5억×40%×채무비율 0.6 = 1.2억의 5%)
 *   CS-2. 함께 양도(다른 물건) × 환산 × 신축 — 자산 2의 가산세가 payload·결과에 반영된다. 일체 주택은 «해당 건물»분이 base 라
 *         건물분 입력(Q-12 PR-2)을 채운다: 1,874,999(종전 전체 base 99,999,999 · 4,999,999)
 *   CS-3. 함께 양도 × 감정가액 × 신축(자산 2) — 가산세 5,500,000(건물 감정가액 1.1억 직접 입력 × 5%, 종전 감정가액 총액 3억 · 15,000,000) · 개산공제 6,000,000(§163⑥)
 *   CS-4. 함께 양도 × 감정가액 × 증축(자산 2) — 컴패니언 카드에 「증축한 부분의 감정가액」 칸이 뜨고 그 값(6천만)이 base(가산세 3,000,000)
 * 사람이 브라우저로 직접 한 수동 확인은 아니다(headless). 포트는 `baseURL` — 워크트리는 `E2E_PORT=<포트>`.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

const SB = { isSelfBuilt: true, buildingType: "new", constructionDate: "2021-06-01" };
/** 일체 주택 본인 신축 × 환산의 건물분 입력(Q-12 PR-2) — 취득 당시 토지 1억·건물 6천만, 양도 당시 토지 6억(㎡당 600만 × 100㎡)·건물 4억 */
const SB_BLDG = {
  standardPricePerSqmAtAcq: "1000000",
  acquisitionArea: "100",
  transferArea: "100",
  buildingStandardPriceAtAcq: "60000000",
  standardPricePerSqmAtTransfer: "6000000",
  buildingStandardPriceAtTransfer: "400000000",
  saleSplitMode: "apportioned",
};

const tranche = (id: number, num: string, acq: string, over: Record<string, unknown> = {}) => ({
  ...makeDefaultAsset(id),
  addressJibun: "서울 강남구 테스트동 1-1",
  assetKind: "housing",
  acquisitionCause: "purchase",
  acquisitionDate: acq,
  ownershipNumerator: num,
  ownershipDenominator: "100",
  transferType: "burdened_gift",
  bgValuationMode: "sangjeungbeop_market",
  bgMarketValueAtTransfer: "1000000000",
  bgMortgageDebtAmount: "600000000",
  bgDonorRelation: "lineal_descendant",
  bgAcquisitionMethod: "appraisal",
  standardPriceAtTransfer: "1000000001",
  ...over,
});

const plain = (id: number, over: Record<string, unknown> = {}) => ({
  ...makeDefaultAsset(id),
  addressJibun: `서울 강남구 테스트동 ${id}-${id}`,
  assetKind: "housing",
  acquisitionCause: "purchase",
  acquisitionDate: "2021-06-01",
  standardPriceAtAcq: "200000000",
  standardPriceAtTransfer: "1000000001",
  ...over,
});

async function seedAndOpen(page: Page, assets: unknown[]) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    {
      state: {
        formData: {
          assets,
          transferDate: "2024-03-01",
          filingDate: "2024-05-31",
          contractTotalPrice: "1000000000",
          householdHousingCount: "2",
          isOneHousehold: false,
          isRegulatedArea: false,
          wasRegulatedAtAcquisition: false,
          isUnregistered: false,
          householdNoOtherHousesConfirmed: true,
          householdNoPresaleRightsConfirmed: true,
        },
        pendingMigration: false,
      },
      version: 0,
    },
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

async function gotoLastStep(page: Page) {
  for (const step of ["보유 상황", "감면·공제", "가산세"]) {
    await page.getByRole("button", { name: step }).first().click();
  }
}

async function calculate(page: Page) {
  await gotoLastStep(page);
  const rp = page.waitForResponse(
    (r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: /계산하기/ }).last().click();
  const resp = await rp;
  expect(resp.status(), await resp.text()).toBe(200);
  return resp;
}

type Prop = { penaltyTax: number; penaltyBase: number };

test.describe("컴패니언 신축·증축 특례 §114조의2", () => {
  test("CS-1: 축 B 지분 카드(자산 2) × 신축 × 감정가액 → 가산세 6,000,000", async ({ page }) => {
    test.setTimeout(120_000);
    await seedAndOpen(page, [
      tranche(1, "60", "2009-03-01", { bgPresumedAcquisitionTotal: "400000000", standardPriceAtAcq: "200000000" }),
      tranche(2, "40", "2012-03-01", { bgPresumedAcquisitionTotal: "500000000", standardPriceAtAcq: "300000000", ...SB }),
    ]);
    const resp = await calculate(page);
    const sent = resp.request().postDataJSON() as { companionAssets?: Record<string, unknown>[] };
    expect(sent.companionAssets?.[0].isSelfBuilt).toBe(true);
    const body = await resp.json();
    const props = body.data.aggregated.properties as Prop[];
    expect(props[0].penaltyTax).toBe(0);
    expect(props[1].penaltyBase).toBe(120_000_000);
    expect(props[1].penaltyTax).toBe(6_000_000);
  });

  test("CS-2: 함께 양도 × 환산 × 신축(자산 2) → 자산 2 가산세 1,874,999(건물분 base 37,499,999)", async ({ page }) => {
    test.setTimeout(120_000);
    await seedAndOpen(page, [
      plain(1, { useEstimatedAcquisition: true }),
      plain(2, { useEstimatedAcquisition: true, ...SB, ...SB_BLDG }),
    ]);
    // 컴패니언 카드에 신축·증축 칸이 실제로 있고(입력 경로), 그 값이 켜져 있다
    for (const n of [1, 2, 3] as const) await expandAssetSection(page, n, 1);
    await expect(page.locator('[data-asset-card-index="1"]').getByText("본인이 신축 또는 증축한 건물입니까?")).toBeVisible();
    const resp = await calculate(page);
    const sent = resp.request().postDataJSON() as { companionAssets?: Record<string, unknown>[] };
    expect(sent.companionAssets?.[0].isSelfBuilt).toBe(true);
    expect(sent.companionAssets?.[0].constructionDate).toBe("2021-06-01");
    const props = (await resp.json()).data.aggregated.properties as Prop[];
    expect(props[0].penaltyTax).toBe(0);
    expect(props[1].penaltyBase).toBe(37_499_999);
    expect(props[1].penaltyTax).toBe(1_874_999);
  });

  test("CS-3: 함께 양도 × 감정가액 × 신축(자산 2) → 가산세 5,500,000(건물 감정가액 1.1억) · 개산공제 6,000,000", async ({ page }) => {
    test.setTimeout(120_000);
    const appraisal = { isAppraisalAcquisition: true, fixedAcquisitionPrice: "300000000" };
    await seedAndOpen(page, [plain(1, appraisal), plain(2, { ...appraisal, ...SB, selfBuiltBuildingAppraisal: "110000000" })]);
    const resp = await calculate(page);
    const sent = resp.request().postDataJSON() as { companionAssets?: Record<string, unknown>[] };
    expect(sent.companionAssets?.[0].acquisitionMethod).toBe("appraisal");
    const props = (await resp.json()).data.aggregated.properties as (Prop & { necessaryExpense: number })[];
    expect(props[1].necessaryExpense).toBe(6_000_000);
    expect(props[1].penaltyBase).toBe(110_000_000);
    expect(props[1].penaltyTax).toBe(5_500_000);
  });

  test("CS-4: 함께 양도 × 감정가액 × 증축(자산 2) → 컴패니언 카드의 증축부분 감정가액 6천만이 base(가산세 3,000,000)", async ({ page }) => {
    test.setTimeout(120_000);
    const appraisal = { isAppraisalAcquisition: true, fixedAcquisitionPrice: "300000000" };
    const ext = {
      isSelfBuilt: true, buildingType: "extension", constructionDate: "2021-06-01",
      extensionFloorArea: "120", extensionStdPriceAtAcquisition: "40000000", extensionAppraisalValue: "60000000",
    };
    await seedAndOpen(page, [plain(1, appraisal), plain(2, { ...appraisal, ...ext })]);
    for (const n of [1, 2, 3] as const) await expandAssetSection(page, n, 1);
    await expect(page.locator('[data-asset-card-index="1"]').getByTestId("extension-appraisal-value")).toHaveValue("60,000,000");
    const resp = await calculate(page);
    const sent = resp.request().postDataJSON() as { companionAssets?: Record<string, unknown>[] };
    expect(sent.companionAssets?.[0].extensionAppraisalValue).toBe(60_000_000);
    const props = (await resp.json()).data.aggregated.properties as Prop[];
    expect(props[1].penaltyBase).toBe(60_000_000);
    expect(props[1].penaltyTax).toBe(3_000_000);
  });
});
