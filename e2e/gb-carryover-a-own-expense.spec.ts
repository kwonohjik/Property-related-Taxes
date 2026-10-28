/**
 * E2E — 일반건물(환산) × 토지 이월과세 × 양도자 본인 자본적지출·양도비 — 시나리오 A 필요경비에 본인 지출이 들어간다
 *
 * 수정 前(브라우저 실측 2026-10-28 전 vitest 동형): 본인 지출을 넣어도 결정세액이 160,572,000 으로 **불변**(증여세 상당액 12,000,000 만 A 필요경비) —
 * 이월과세 엔진 A 입력이 `capitalExpenditure`를 항상 선언해 일반건물 카드의 `expenses`(= 본인 환산 개산공제) 스칼라를 읽지 않았다.
 * 수정 後: 본인 지출 30,000,000 의 토지 몫 15,000,000 이 A 필요경비에 들어가 156,372,000.
 *
 * 손계산: 토지 양도차익 500,000,000 − 증여자 150,000,000 − 증여세 12,000,000 − 몫 15,000,000 = 323,000,000 → 장특 30% → 226,100,000
 *        + 건물 247,000,000 → 장특 6% → 232,180,000 → 합 458,280,000 − 기본공제 2,500,000 = 455,780,000 × 40% − 25,940,000 = 156,372,000.
 * vitest anchor: `__tests__/api/transfer.route.gb-carryover-a-own-expense.anchor.test.ts`
 *
 * 실행(워크트리): E2E_PORT=3156 npx playwright test e2e/gb-carryover-a-own-expense.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "../lib/stores/calc-wizard-asset-carryover";
import { calculate, seedWizard } from "./_helpers/split-acq-display";
import { expandAssetSection } from "./_helpers/expandAssetSection";

const CO = {
  ...CARRYOVER_DEFAULTS, giftRegistryDate: "2021-03-01", donorAcquisitionDate: "2005-06-15", donorAcquisitionPrice: "150000000",
  giftTaxAmount: "", giftTaxCalculated: "30000000", giftTaxBase: "1000000000", giftDateValuation: "400000000", donorRelation: "lineal",
};
const asset = (own: { capitalExpenditure?: string; transferExpense?: string }) => ({
  ...makeDefaultAsset(1), assetLabel: "자산 1", addressJibun: "서울 강남구 테스트동 1-1", assetKind: "general_building",
  acquisitionCause: "carryover_gift", gbBuildingAcquisitionCause: "purchase", acquisitionDate: "2021-03-01", landAcquisitionDate: "2021-03-01",
  useEstimatedAcquisition: true, landAcqMode: "estimated", buildingAcqMode: "estimated",
  gbLandArea: "100", gbBuildingArea: "200", gbBuildingFootprintArea: "50", gbTransferLandPricePerSqm: "2000000", gbTransferBuildingValue: "200000000",
  gbZoneType: "general_residential", gbAcqLandPricePerSqm: "1000000", gbAcqBuildingValue: "100000000", carryover: CO, ...own,
});
const seedOf = (own: { capitalExpenditure?: string; transferExpense?: string }) => ({
  state: {
    formData: {
      assets: [asset(own)], transferDate: "2024-03-01", filingDate: "2024-05-31", contractTotalPrice: "1000000000", totalTransferExpense: "0",
      householdHousingCount: "2", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isOneHousehold: false,
      isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false,
    },
    pendingMigration: false,
  },
  version: 0,
});

/** 총 양도가액(「2 양도」)은 시드 복원에서 비므로 화면에서 넣는다(gb-carryover-gift-tax-pair 와 같다). */
async function prepare(page: Page, own: { capitalExpenditure?: string; transferExpense?: string }) {
  await seedWizard(page, seedOf(own));
  await expandAssetSection(page, 2, 0);
  const tp = page.locator('[data-field="contractTotalPrice"] input, input[data-field="contractTotalPrice"]').filter({ visible: true }).first();
  if (!(await tp.inputValue())) await tp.fill("1000000000");
}

test.describe("일반건물 환산 × 토지 이월과세 × 본인 지출", () => {
  test("GBCO-E1 본인 지출 0 → 160,572,000 (대조군 · 수정 前후 불변)", async ({ page }) => {
    test.setTimeout(180_000);
    await prepare(page, {});
    await calculate(page);
    await expect(page.locator('[data-print-id="form-table"]').first()).toContainText("160,572,000");
  });

  test("GBCO-E2 자본적지출 20,000,000 + 양도비 10,000,000 → 156,372,000 · 요청 본문에 본인 지출이 실린다", async ({ page }) => {
    test.setTimeout(180_000);
    await prepare(page, { capitalExpenditure: "20000000", transferExpense: "10000000" });
    const reqPromise = page.waitForRequest((r) => r.url().includes("/api/calc/transfer") && r.method() === "POST");
    await calculate(page);
    const body = JSON.parse((await reqPromise).postData() ?? "{}");
    // Network 탭 확인 — ④가 자산 단위 본인 지출을 일반건물 payload 에 싣는다(⑫⑬⑭ 불변).
    expect(body.generalBuildingValuation.capitalExpenditure).toBe(20_000_000);
    expect(body.generalBuildingValuation.transferExpense).toBe(10_000_000);
    const table = page.locator('[data-print-id="form-table"]').first();
    await expect(table).toContainText("156,372,000");
    await expect(table).not.toContainText("160,572,000");
  });

  /**
   * 신고서 A 열 「취득가액」 칸 — 이월과세 A 는 본인 **자본적지출 몫만** 증여자 취득가액에 얹는다(양도비는 필요경비 칸).
   * 토지 몫은 환산 카드 (환산취득가 + 개산공제) 비례 50%: 자본적지출 20,000,000 → 10,000,000 · 양도비 10,000,000 → 5,000,000.
   * 수정 前에는 합산 15,000,000 이 취득가액 칸에 얹혀 165,000,000 이었다(계획서 carryover-a-gb-card-filing-acq-cell-label §2).
   */
  test("GBCO-E3 신고서 토지 취득가액 칸 = 증여자 150,000,000 + 자본적지출 몫 10,000,000 (양도비 몫 5,000,000 은 필요경비 칸)", async ({ page }) => {
    test.setTimeout(180_000);
    await prepare(page, { capitalExpenditure: "20000000", transferExpense: "10000000" });
    await calculate(page);
    const table = page.locator('[data-print-id="form-table"]').first();
    await expect(table).toContainText("156,372,000");
    await expect(table).toContainText("160,000,000");
    await expect(table).not.toContainText("165,000,000");
  });
});
