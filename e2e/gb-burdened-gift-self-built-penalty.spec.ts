/**
 * E2E — 일반건물 **부담부증여 K-5(환산)·K-7(감정) × 양도인 본인 신축** §114조의2 가산세 (PR-5b, 계획서 §17)
 *
 * 종전: 부담부증여 일반건물은 신축·5년 이내여도 가산세 0 (같은 조건 단건 건물은 붙는다).
 * 지금: 카드가 산정방식별 신호를 싣는다 — K-5 = 채무비율 안분 후 건물 환산취득가액 125,000,000 × 5% = 6,250,000,
 *       K-7 = 안분 후 건물 감정가액 150,000,000 × 5% = 7,500,000. 결과 카드 라벨은 산정방식별(Q-13), 적용 고지에 «확인 필요»(Q-14).
 * 입력·요청 body 는 바뀌지 않는다(⑫ 변경 없음) — 이 스펙은 폼→계산→결과 + 안내 배지를 본다.
 *
 * 실행(워크트리): E2E_PORT=3293 npx playwright test e2e/gb-burdened-gift-self-built-penalty.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { seedWizard } from "./_helpers/split-acq-display";

function seed(over: Record<string, unknown> = {}) {
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1),
            addressJibun: "서울 강남구 테스트동 1-1",
            assetKind: "general_building",
            transferType: "burdened_gift",
            acquisitionCause: "purchase",
            gbBuildingAcquisitionCause: "newConstruction",
            hasSeperateLandAcquisitionDate: true,
            landAcquisitionDate: "2015-01-01",
            acquisitionDate: "2022-01-10", // 건물 취득일 = 신축일
            bgValuationMode: "sangjeungbeop_market",
            bgAcquisitionMethod: "converted",
            bgMarketValueAtTransfer: "1000000000",
            bgMortgageDebtAmount: "500000000",
            bgDonorRelation: "lineal_descendant",
            gbLandArea: "100",
            gbBuildingArea: "200",
            gbBuildingFootprintArea: "50",
            gbZoneType: "general_residential",
            gbTransferLandPricePerSqm: "2000000",
            gbTransferBuildingValue: "200000000",
            gbAcqLandPricePerSqm: "1000000",
            gbAcqBuildingValue: "100000000",
            ...over,
          },
        ],
        transferDate: "2026-03-01",
        filingDate: "2026-04-30",
        householdHousingCount: "2",
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function calc(page: Page) {
  const reqP = page.waitForRequest((r) => r.url().includes("/api/calc/transfer") && r.method() === "POST");
  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  const body = (await reqP).postDataJSON() as Record<string, unknown>;
  await expect(page.getByText("합산 과세 내역").first()).toBeVisible({ timeout: 60_000 });
  return body;
}

test.describe("일반건물 부담부증여 × 본인 신축 §114조의2", () => {
  test("GP-1 K-5 환산: 결과 카드 «환산취득가액 가산세 … 건물 환산취득가 125,000,000 × 5%» 6,250,000 + 확인 필요 고지", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seed());
    const body = await calc(page);
    expect((body.generalBuildingValuation as Record<string, unknown>).buildingAcquisitionCause).toBe("newConstruction");
    await expect(page.getByText("환산취득가액 가산세 (소득세법 §114조의2 ①) = 건물 환산취득가 125,000,000 × 5%").first()).toBeVisible();
    await expect(page.getByText("6,250,000").first()).toBeVisible();
    await expect(page.getByText("일반건물 부담부증여에서 양도인 본인이 신축한 건물").first()).toBeVisible();
    await expect(page.getByText("정면 해석례는 확인하지 못했습니다 — 확인 필요").first()).toBeVisible();
    if (process.env.E2E_SHOT_DIR) await page.getByText("합산 과세 내역").first().scrollIntoViewIfNeeded().then(() => page.screenshot({ path: `${process.env.E2E_SHOT_DIR}/gp1-k5-result.png` }));
  });

  test("GP-2 K-7 감정: «감정가액 가산세 … 건물 감정가액 150,000,000 × 5%» 7,500,000", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(
      page,
      seed({ bgAcquisitionMethod: "appraisal", bgPresumedAcquisitionLand: "200000000", bgPresumedAcquisitionBuilding: "300000000" }),
    );
    await calc(page);
    await expect(page.getByText("감정가액 가산세 (소득세법 §114조의2 ①) = 건물 감정가액 150,000,000 × 5%").first()).toBeVisible();
    await expect(page.getByText("환산취득가액 가산세 (소득세법 §114조의2 ①)")).toHaveCount(0);
    await expect(page.getByText("7,500,000").first()).toBeVisible();
    if (process.env.E2E_SHOT_DIR) await page.getByText("합산 과세 내역").first().scrollIntoViewIfNeeded().then(() => page.screenshot({ path: `${process.env.E2E_SHOT_DIR}/gp2-k7-result.png` }));
  });

  test("GP-3 [회귀 0] 신축이 아니면(매매) 가산세 행·고지가 없다", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seed({ gbBuildingAcquisitionCause: "purchase" }));
    await calc(page);
    await expect(page.getByText("가산세 (소득세법 §114조의2 ①)")).toHaveCount(0);
    await expect(page.getByText("일반건물 부담부증여에서 양도인 본인이 신축한 건물")).toHaveCount(0);
  });

  test("GP-4 입력 단계 안내 배지: K-5 → «환산취득가액 가산세 적용 대상» · K-7 → «감정가액 가산세 적용 대상»", async ({ page }) => {
    test.setTimeout(120_000);
    await seedWizard(page, seed());
    await expandAssetSection(page, 3);
    await expect(page.getByText("환산취득가액 가산세 적용 대상").first()).toBeVisible();
    await seedWizard(page, seed({ bgAcquisitionMethod: "appraisal", bgPresumedAcquisitionLand: "200000000", bgPresumedAcquisitionBuilding: "300000000" }));
    await expandAssetSection(page, 3);
    await expect(page.getByText("감정가액 가산세 적용 대상").first()).toBeVisible();
  });
});
