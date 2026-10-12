/**
 * E2E: 같은 날 취득 주택의 배율 초과분 분리 — 「그중 토지분 자본적지출」 칸 (#17 후속)
 *
 *   T1. 자본적지출 1억 → 카드에 토지분 칸 · 건물분 계산값 표시 → 토지분 6천만 입력 → body에 파트 값(6천만 · 4천만) → 결과 세액
 *   T2. 토지분 미입력 → ⑧ 차단 메시지(계산 요청 없음)
 *
 * ⚠️ 세액 수치의 정본은 vitest anchor(`dec17-housing-excess-capex.anchor.test.ts`)다 — 여기 금액은 «입력이 엔진까지 도달한다»는 배선 확인이다.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { DIRECT_RESIDENCE } from "./_helpers/residence-direct";
import { expandAssetSection } from "./_helpers/expandAssetSection";

function seedForm() {
  return {
    state: {
      formData: {
        assets: [{
          ...makeDefaultAsset(1), ...DIRECT_RESIDENCE,
          assetKind: "housing",
          acquisitionCause: "purchase",
          acquisitionDate: "2012-01-02",
          fixedAcquisitionPrice: "500000000",
          actualSalePrice: "1000000000",
          addressJibun: "서울 테스트동 1",
          residencePeriodMonthsAsset: "120",
          buildingFootprintArea: "100",
          appurtenantLandZone: "metropolitan_residential",
          isUrbanArea: true,
          areaScenario: "same",
          acquisitionArea: "500",
          transferArea: "500",
          standardPriceAtAcq: "300000000",
          standardPricePerSqmAtAcq: "400000",
          buildingStandardPriceAtAcq: "150000000",
          standardPricePerSqmAtTransfer: "800000",
          buildingStandardPriceAtTransfer: "400000000",
          capitalExpenditure: "100000000",
        }],
        transferDate: "2026-02-16",
        contractTotalPrice: "1000000000",
        isOneHousehold: true,
        householdHousingCount: "1",
        householdNoOtherHousesConfirmed: true,
        householdNoPresaleRightsConfirmed: true,
        residencePeriodMonths: "120",
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function seed(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), seedForm());
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

test.describe("배율 초과분 분리 — 자본적지출 토지분 칸 (#17 후속)", () => {
  test("T1: 토지분 6천만 입력 → 건물분 4천만 표시 · body 파트 값 · 결과 세액", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page);
    await expandAssetSection(page, 1);
    const land = page.getByTestId("housing-excess-land-capex");
    await expect(land).toBeVisible();
    await expect(page.getByTestId("housing-excess-building-capex")).toContainText("토지분 입력 후 표시");
    await land.fill("60000000");
    await expect(page.getByTestId("housing-excess-building-capex")).toContainText("40,000,000");

    await page.getByRole("button", { name: "가산세", exact: true }).first().click();
    const reqP = page.waitForRequest((r) => r.url().includes("/api/calc/transfer") && r.method() === "POST");
    await page.getByRole("button", { name: "세금 계산하기" }).click();
    const body = (await reqP).postDataJSON() as Record<string, unknown>;
    expect(body.landDirectExpenses).toBe(60_000_000);
    expect(body.buildingDirectExpenses).toBe(40_000_000);
    await expect(page.getByText("5,533,156").filter({ visible: true }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/자산 전체 자본적지출 .*넣지 않았습니다/)).toHaveCount(0);
  });

  test("T2: 토지분 미입력 → ⑧이 막는다", async ({ page }) => {
    test.setTimeout(90_000);
    await seed(page);
    await page.getByRole("button", { name: "가산세", exact: true }).first().click();
    await page.getByRole("button", { name: "세금 계산하기" }).click();
    await expect(page.getByText(/그중 토지분 자본적지출을 입력하세요/).first()).toBeVisible({ timeout: 30_000 });
  });
});
