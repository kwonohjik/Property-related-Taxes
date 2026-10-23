/**
 * E2E — 일반건물 **지분 분할 취득(축 B) × 부담부증여** §159 반영 (PR-3 · 계획서 `docs/00-pm/gb-burdened-gift-silent-drop.plan.md` 결함 1-a)
 *
 * 종전: route 5-0 이 부담부증여를 읽지 않아 지분 카드가 일반 양도로 계산됐다(채무 전액이 양도차익 · 취득가액 0 — 총납부 141,966,000) +
 *       결과 화면에 «부담부증여 평가 명세»·증여세 카드가 없었다.
 * 지금: 지분 합이 단건 100%와 같다(K-5 57,552,880) + 물건 단위 §159 명세·증여세 카드가 뜬다 + 사이드바가 지분별 §159 값(300,000,000 / 200,000,000)을 보인다.
 *       본인 신축이면 §114조의2 가산세가 지분율만큼(75,000,000 / 50,000,000 × 5%) 붙고 «확인 필요» 고지가 1회 뜬다.
 *
 * 실행(워크트리): E2E_PORT=3295 npx playwright test e2e/gb-burdened-gift-shares.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { seedWizard } from "./_helpers/split-acq-display";

const gb = (id: number, over: Record<string, unknown> = {}) => ({
  ...makeDefaultAsset(id),
  addressJibun: "서울 강남구 테스트동 1-1",
  assetKind: "general_building",
  acquisitionCause: "purchase",
  acquisitionDate: "2015-03-01",
  gbBuildingAcquisitionCause: "purchase",
  gbLandArea: "100", gbBuildingArea: "200", gbBuildingFootprintArea: "50", gbZoneType: "general_residential",
  gbTransferLandPricePerSqm: "2000000", gbTransferBuildingValue: "200000000",
  gbAcqLandPricePerSqm: "1000000", gbAcqBuildingValue: "100000000",
  ...over,
});
/** 자산 1 = 부담부증여 입력 전부(60%) · 자산 2 = 지분 카드(② 숨김 → 일반 양도 기본값 · 취득 정보만) */
const sharesSeed = (o1: Record<string, unknown> = {}, o2: Record<string, unknown> = {}) => ({
  state: {
    formData: {
      assets: [
        gb(1, {
          transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000",
          bgMortgageDebtAmount: "500000000", bgMortgageSetAmount: "500000000", bgDonorRelation: "lineal_descendant", bgAcquisitionMethod: "converted",
          ownershipNumerator: "60", ownershipDenominator: "100", ...o1,
        }),
        gb(2, { ownershipNumerator: "40", ownershipDenominator: "100", addressJibun: "서울 강남구 테스트동 1-1", ...o2 }),
      ],
      transferDate: "2026-03-01", filingDate: "2026-04-30", contractTotalPrice: "1000000000", householdHousingCount: "2",
      isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false,
    },
    pendingMigration: false,
  },
  version: 0,
});
const SELF = { gbBuildingAcquisitionCause: "newConstruction", hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2015-01-01", acquisitionDate: "2022-01-10" };

async function calc(page: Page) {
  const reqP = page.waitForRequest((r) => r.url().includes("/api/calc/transfer") && r.method() === "POST");
  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  const body = (await reqP).postDataJSON() as Record<string, unknown>;
  await expect(page.getByText("합산 과세 내역").first()).toBeVisible({ timeout: 60_000 });
  return body;
}

test.describe("일반건물 지분(축 B) × 부담부증여", () => {
  test("GSH-1 K-5 60/40: 총납부 57,552,880(= 단건 100%) · §159 명세 · 사이드바 지분별 값", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, sharesSeed());
    const body = await calc(page);
    const shares = body.generalBuildingShares as Record<string, unknown>[];
    expect(shares.length).toBe(2);
    expect(shares.every((s) => s.burdenedGiftInfo)).toBe(true);
    const text = page.locator("body");
    await expect(text).toContainText("57,552,880");
    await expect(text).not.toContainText("141,966,000");
    await expect(text).toContainText("부담부증여 평가 명세 (소득세법 시행령 §159)");
    if (process.env.E2E_SHOT_DIR) await page.screenshot({ path: `${process.env.E2E_SHOT_DIR}/gsh-1-result.png`, fullPage: true });
    // 사이드바(입력 단계로 복귀) — 지분별 §159 값: 양도가액 300,000,000 / 200,000,000 · 취득가액 150,000,000 (종전: 계산 후에도 «계산 후 표시»)
    await page.getByRole("button", { name: "이전 화면" }).first().click();
    await expect(text).toContainText("300,000,000");
    await expect(text).toContainText("200,000,000");
    await expect(text).toContainText("150,000,000");
    if (process.env.E2E_SHOT_DIR) await page.screenshot({ path: `${process.env.E2E_SHOT_DIR}/gsh-1-sidebar.png` });
  });

  test("GSH-2 취득일 2009/2015: 총납부 52,597,072 (지분별 보유기간)", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, sharesSeed({ acquisitionDate: "2009-03-01" }));
    await calc(page);
    await expect(page.locator("body")).toContainText("52,597,072");
  });

  test("GSH-3 두 지분 모두 본인 신축: 총납부 71,655,100 · 가산세 6,250,000 · «확인 필요» 고지", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, sharesSeed(SELF, SELF));
    await calc(page);
    const text = page.locator("body");
    await expect(text).toContainText("71,655,100");
    await expect(text).toContainText("6,250,000");
    await expect(text).toContainText("일반건물 부담부증여에서 양도인 본인이 신축한 건물");
  });
});
