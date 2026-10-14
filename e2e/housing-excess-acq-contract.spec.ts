/**
 * E2E: 같은 날 취득 주택의 배율 초과분 분리 — 「취득 당시 계약서 토지·건물 구분금액」(#17-6, 소득세법 §100③ 30% 판정)
 *
 *   T1. 30% 미만 차이 → body 전송 · 결과 카드 «계약서 구분금액을 적용»
 *   T2. 30% 이상 차이 → 결과 카드 «안분 가액을 적용»(불분명 의제)
 *   T3. 30% 이상 + 「다른 법령에서 정하는 바에 따라 가액을 구분한 경우」 토글(양도일 2025.1.1. 이후) → 계약서 구분금액 적용
 *   T4. 합이 취득가액과 다르면 ⑧이 토지 금액 칸으로 막는다
 *
 * ⚠️ 세액 수치의 정본은 vitest anchor(`dec17-6-acq-contract-*.anchor.test.*`)다 — 여기는 «입력이 엔진·결과 화면까지 도달한다»는 배선 확인이다.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { DIRECT_RESIDENCE } from "./_helpers/residence-direct";
import { expandAssetSection } from "./_helpers/expandAssetSection";

function seedForm(assetOver: Record<string, unknown> = {}) {
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
          standardPriceAtAcq: "500000000",
          standardPricePerSqmAtAcq: "600000",
          buildingStandardPriceAtAcq: "200000000",
          standardPricePerSqmAtTransfer: "800000",
          buildingStandardPriceAtTransfer: "400000000",
          ...assetOver,
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

async function seed(page: Page, assetOver: Record<string, unknown> = {}) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), seedForm(assetOver));
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

async function calc(page: Page) {
  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  const reqP = page.waitForRequest((r) => r.url().includes("/api/calc/transfer") && r.method() === "POST");
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  return (await reqP).postDataJSON() as Record<string, unknown>;
}

test.describe("배율 초과분 분리 — 취득 당시 계약서 구분금액 (#17-6)", () => {
  test("T1: 건물 −17.9%(30% 미만) → body 전송 · 결과 «계약서 구분금액 적용»", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page);
    await expandAssetSection(page, 1);
    await expect(page.getByTestId("housing-excess-acq-contract")).toBeVisible();
    await page.getByTestId("housing-excess-acq-contract-land").fill("335714285");
    await page.getByTestId("housing-excess-acq-contract-building").fill("164285715");
    await expect(page.getByTestId("housing-excess-acq-contract-sum")).toContainText("취득가액과 같음");
    const body = await calc(page);
    expect(body.acqContractLandPrice).toBe(335_714_285);
    expect(body.acqContractBuildingPrice).toBe(164_285_715);
    const block = page.getByTestId("acq-split-judgment").filter({ visible: true }).first();
    await expect(block).toBeVisible({ timeout: 30_000 });
    await expect(block).toHaveAttribute("data-outcome", "contract");
    await expect(block).toContainText("계약서 구분금액을 적용했습니다");
  });

  test("T2: 건물 −40%(30% 이상) → 불분명 → «안분 가액 적용»", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page, { acqContractLandPrice: "380000000", acqContractBuildingPrice: "120000000" });
    await calc(page);
    const block = page.getByTestId("acq-split-judgment").filter({ visible: true }).first();
    await expect(block).toBeVisible({ timeout: 30_000 });
    await expect(block).toHaveAttribute("data-outcome", "deemed_unclear");
    await expect(block).toContainText("안분 가액을 적용했습니다");
  });

  test("T3: 30% 이상 + 단서 토글(양도 2026) → 계약서 구분금액 적용", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page, { acqContractLandPrice: "380000000", acqContractBuildingPrice: "120000000" });
    await expandAssetSection(page, 1);
    await page.getByTestId("housing-excess-acq-contract-other-law").getByRole("switch").click();
    const body = await calc(page);
    expect(body.acqContractOtherLaw).toBe(true);
    const block = page.getByTestId("acq-split-judgment").filter({ visible: true }).first();
    await expect(block).toBeVisible({ timeout: 30_000 });
    await expect(block).toHaveAttribute("data-outcome", "exempt_other_law");
  });

  test("T4: 합이 취득가액과 다르면 ⑧이 막는다(계산 요청 없음)", async ({ page }) => {
    test.setTimeout(90_000);
    await seed(page, { acqContractLandPrice: "380000000", acqContractBuildingPrice: "100000000" });
    await page.getByRole("button", { name: "가산세", exact: true }).first().click();
    await page.getByRole("button", { name: "세금 계산하기" }).click();
    await expect(page.getByText(/이 취득가액 500,000,000과 다릅니다/).first()).toBeVisible({ timeout: 30_000 });
  });
});
