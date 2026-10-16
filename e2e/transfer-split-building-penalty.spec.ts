/**
 * 양도소득세 — 토지·건물 분리 자산(별개 취득)의 건물 파트 §114조의2 가산세 (2026-10-16)
 *
 *   SB-1. 건물 파트 감정가액 × 증축 — 카드에 「증축한 부분의 감정가액」 칸이 뜨고 그 값(6천만)이 base(가산세 3,000,000)
 *         (종전: 칸이 없고 건물 파트 감정가액 전체 2.5억이 base → 12,500,000)
 *   SB-2. 건물 파트 환산 × 신축 × 양도차손 — 산출세액 0이어도 가산세 3,750,000(= 건물 환산취득가 75,000,000 × 5%, 법 §114조의2②)
 *         (종전: 손실 경로가 건물 파트 축을 읽지 않아 0)
 * 사람이 브라우저로 직접 한 수동 확인은 아니다(headless Playwright). 포트는 `baseURL` — 워크트리는 `E2E_PORT=<포트> npx playwright test <spec>`.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

const SPLIT_BASE = {
  addressJibun: "서울 강남구 테스트동 1-1",
  assetKind: "building",
  acquisitionCause: "purchase",
  acquisitionDate: "2021-01-01",
  landAcquisitionDate: "2015-06-01",
  hasSeperateLandAcquisitionDate: true,
  landAcqMode: "actual",
  landAcquisitionPrice: "200000000",
  standardPricePerSqmAtAcq: "1000000",
  acquisitionArea: "200",
  isSelfBuilt: true,
  constructionDate: "2021-01-01",
};

async function seedAndOpen(page: Page, asset: Record<string, unknown>, contractTotalPrice: string) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    {
      state: {
        formData: {
          assets: [asset],
          transferDate: "2024-03-01",
          filingDate: "2024-05-31",
          contractTotalPrice,
          householdHousingCount: "2",
          householdNoOtherHousesConfirmed: true,
          householdNoPresaleRightsConfirmed: true,
          isOneHousehold: false,
          isRegulatedArea: false,
          wasRegulatedAtAcquisition: false,
          isUnregistered: false,
        },
        pendingMigration: false,
      },
      version: 0,
    },
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

async function calculate(page: Page) {
  const calcResponse = page.waitForResponse(
    (r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST",
    { timeout: 30_000 },
  );
  for (const step of ["보유 상황", "감면·공제", "가산세"]) {
    await page.getByRole("button", { name: step }).first().click();
  }
  await page.getByRole("button", { name: /계산하기/ }).last().click();
  const res = await calcResponse;
  expect(res.status(), await res.text()).toBe(200);
  return res;
}

const resultOf = async (res: Awaited<ReturnType<typeof calculate>>) => {
  const body = await res.json();
  return (body.data?.result ?? body.result ?? body.data) as { penaltyBase: number; penaltyTax: number; calculatedTax: number; transferGain: number };
};

test.describe("분리 자산 건물 파트 §114조의2", () => {
  test("SB-1: 건물 파트 감정가액 × 증축 → 칸이 뜨고 증축부분 감정가액 6천만이 base(3,000,000)", async ({ page }) => {
    test.setTimeout(120_000);
    await seedAndOpen(
      page,
      {
        ...makeDefaultAsset(1),
        ...SPLIT_BASE,
        actualSalePrice: "800000000",
        buildingAcqMode: "appraisal",
        buildingAcquisitionPrice: "250000000",
        saleSplitMode: "apportioned",
        landStandardPriceAtTransfer: "480000000",
        buildingStandardPriceAtTransfer: "320000000",
        buildingStandardPriceAtAcq: "200000000",
        buildingType: "extension",
        extensionFloorArea: "120",
        extensionStdPriceAtAcquisition: "40000000",
        extensionAppraisalValue: "60000000",
      },
      "800000000",
    );
    for (const n of [1, 2, 3] as const) await expandAssetSection(page, n);
    await expect(page.locator('[data-asset-card-index="0"]').getByTestId("extension-appraisal-value")).toHaveValue("60,000,000");
    const res = await calculate(page);
    expect((res.request().postDataJSON() as Record<string, unknown>).extensionAppraisalValue).toBe(60_000_000);
    const r = await resultOf(res);
    expect(r.penaltyBase).toBe(60_000_000);
    expect(r.penaltyTax).toBe(3_000_000);
  });

  test("SB-2: 건물 파트 환산 × 신축 × 양도차손 → 산출세액 0이어도 가산세 3,750,000", async ({ page }) => {
    test.setTimeout(120_000);
    await seedAndOpen(
      page,
      {
        ...makeDefaultAsset(1),
        ...SPLIT_BASE,
        actualSalePrice: "250000000",
        buildingAcqMode: "estimated",
        saleSplitMode: "actual",
        landTransferPrice: "150000000",
        buildingTransferPrice: "100000000",
        landStandardPriceAtTransfer: "450000000",
        buildingStandardPriceAtTransfer: "300000000",
        buildingStandardPriceAtAcq: "225000000",
        buildingType: "new",
      },
      "250000000",
    );
    const r = await resultOf(await calculate(page));
    expect(r.transferGain).toBeLessThan(0);
    expect(r.calculatedTax).toBe(0);
    expect(r.penaltyBase).toBe(75_000_000);
    expect(r.penaltyTax).toBe(3_750_000);
  });
});
