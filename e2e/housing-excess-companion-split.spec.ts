/**
 * E2E: 함께 양도 주택 카드(컴패니언)의 배율 초과분 분리 — 기준시가 5칸 카드 · ⑧ 차단 · ④ 전송 (#17-1)
 *
 *   T1. 컴패니언 주택(초과 200㎡)에만 분리 카드가 뜬다 — 한도 이내인 주 자산 카드에는 없다
 *   T2. 5칸을 채워 계산 → companionAssets[0]에 면적 사실·분리 축이 실린다 (200)
 *   T3. 컴패니언 5칸 중 하나(건물 기준시가)를 비우면 ⑧이 「자산 2」로 막는다 — 계산 요청 없음
 *
 * 같은 날 함께양도에 주택 2채가 묶이면 결정 #40이 막는 것은 «1세대 비과세 가능 또는 조정대상지역»일 때뿐이라 1세대 해당 아님 + 비조정으로 시드한다.
 * ⚠️ 세액 수치의 정본은 vitest anchor(`dec17-companion-excess-split.anchor.test.ts`)다 — 여기는 입력이 엔진까지 도달한다는 배선 확인이다.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { DIRECT_RESIDENCE } from "./_helpers/residence-direct";
import { expandAssetSection } from "./_helpers/expandAssetSection";

const HOUSE = {
  assetKind: "housing",
  acquisitionCause: "purchase",
  acquisitionDate: "2012-01-02",
  fixedAcquisitionPrice: "300000000",
  actualSalePrice: "500000000",
  standardPriceAtTransfer: "500000000",
  residencePeriodMonthsAsset: "120",
  buildingFootprintArea: "100",
  appurtenantLandZone: "metropolitan_residential",
  isUrbanArea: true,
  areaScenario: "same",
};
const FIVE = {
  standardPriceAtAcq: "300000000",
  standardPricePerSqmAtAcq: "400000",
  buildingStandardPriceAtAcq: "150000000",
  standardPricePerSqmAtTransfer: "800000",
  buildingStandardPriceAtTransfer: "400000000",
};

function seedForm(companionOver: Record<string, unknown> = {}) {
  return {
    state: {
      formData: {
        assets: [
          { ...makeDefaultAsset(1), ...DIRECT_RESIDENCE, ...HOUSE, addressJibun: "서울 테스트동 1", acquisitionArea: "250", transferArea: "250" },
          { ...makeDefaultAsset(2), ...DIRECT_RESIDENCE, ...HOUSE, addressJibun: "서울 테스트동 2", acquisitionArea: "500", transferArea: "500", ...FIVE, ...companionOver },
        ],
        transferDate: "2026-02-16",
        contractTotalPrice: "1000000000",
        isOneHousehold: false,
        householdHousingCount: "2",
        householdNoOtherHousesConfirmed: true,
        householdNoPresaleRightsConfirmed: true,
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        residencePeriodMonths: "120",
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function seed(page: Page, companionOver: Record<string, unknown> = {}) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), seedForm(companionOver));
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

const card = (page: Page, index: number) => page.locator(`[data-asset-card-index="${index}"]`).getByTestId("housing-excess-split-card");

test.describe("컴패니언 주택 배율 초과분 분리 (#17-1)", () => {
  test("T1: 분리 카드는 초과가 있는 컴패니언 주택 카드에만 뜬다", async ({ page }) => {
    test.setTimeout(90_000);
    await seed(page);
    await expandAssetSection(page, 1, 0);
    await expandAssetSection(page, 1, 1);
    await expect(card(page, 1)).toBeVisible();
    await expect(card(page, 0)).toHaveCount(0);
  });

  test("T2: 5칸 입력 → 계산 요청에 컴패니언 면적 사실·분리 축이 실린다", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page);
    await page.getByRole("button", { name: "가산세", exact: true }).first().click();
    const reqP = page.waitForRequest((r) => r.url().includes("/api/calc/transfer") && r.method() === "POST");
    await page.getByRole("button", { name: "세금 계산하기" }).click();
    const body = (await reqP).postDataJSON() as { companionAssets: Record<string, unknown>[] };
    const c = body.companionAssets[0];
    expect(c.companionHousingLand).toEqual({ landAreaM2: 500, footprintM2: 100, zone: "metropolitan_residential" });
    expect(c.landAcquisitionDate).toBe("2012-01-02");
    expect(c.buildingStandardPriceAtAcquisition).toBe(150_000_000);
    expect(c.landStandardPriceAtTransfer).toBe(400_000_000);
  });

  test("T3: 컴패니언 건물 기준시가를 비우면 ⑧이 막는다", async ({ page }) => {
    test.setTimeout(90_000);
    await seed(page, { buildingStandardPriceAtAcq: "" });
    await page.getByRole("button", { name: "가산세", exact: true }).first().click();
    await page.getByRole("button", { name: "세금 계산하기" }).click();
    await expect(page.getByText(/자산 2: 토지 면적이 건물 정착면적의 지역별 배율 한도를/).first()).toBeVisible({ timeout: 30_000 });
  });
});
