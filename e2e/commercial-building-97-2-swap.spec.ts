/**
 * 상업용건물 환산취득가 §97②2호 단서 swap end-to-end E2E (Phase 1 배선 회귀 가드).
 *
 * 검증: 상가건물을 환산취득가 모드로 양도하면서 자본적지출+양도비(나목)가
 *   환산취득가+개산공제(가목)보다 크면, §97②2호 단서에 따라 나목을 필요경비로 적용한다.
 *   → 결과뷰에 "§97②2호 단서 swap 발동" caveat가 표시된다(swapApplied=true).
 *   반대로 나목이 작으면 본문(개산공제)이 유지되고 caveat는 나타나지 않는다.
 *
 * 엔진 수치(540,000,000 등)는 anchor(commercial-building-97-2-swap.anchor.test.ts)가 담당하고,
 * 본 스펙은 **UI 배선(입력 → swap 판정 → 결과뷰 표시)**만 검증한다.
 *
 * worktree 실행: E2E_PORT=3xxx npx playwright test e2e/commercial-building-97-2-swap.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

/** 상가 환산(post_disclosure) 시드. capex 인자로 나목 크기 조절. */
function seedForm(capitalExpenditure: string, transferExpense: string) {
  return {
    state: {
      formData: {
        assets: [{
          ...makeDefaultAsset(1),
          assetKind: "commercial_building",
          acquisitionCause: "purchase",
          acquisitionDate: "2010-06-01",
          useEstimatedAcquisition: true, // 환산취득가 모드
          cbEra: "post_disclosure",
          cbExclusiveArea: "150",
          cbSharedArea: "50",
          cbLandArea: "100",
          cbUnitPriceAtTransfer: "2500000",     // 양도시 ㎡당 호별고시가
          cbUnitPriceAtFirstOrAcq: "1000000",   // 취득시 ㎡당 호별고시가 (양도의 40% → 환산 ≈ 40%)
          cbLandPricePerSqmAtTransfer: "1000000",
          cbLandPricePerSqmAtAcq: "400000",     // 취득시 개별공시지가(원/㎡) — 검증 필수
          capitalExpenditure,
          transferExpense,
        }],
        transferDate: "2020-06-01",
        filingDate: "2020-08-31",
        contractTotalPrice: "1000000000", // 10억
        householdHousingCount: "1",
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function seedAndCalc(page: Page, capitalExpenditure: string, transferExpense: string) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedForm(capitalExpenditure, transferExpense),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  await page.getByText("신고서 양식", { exact: false }).first().waitFor({ timeout: 20000 });
}

const SWAP_CAVEAT = "§97②2호 단서 swap 발동";

test.describe("상업용건물 환산 §97②2호 단서 swap (Phase 1 배선)", () => {
  test("나목(자본+양도비) > 가목 → swap 발동 caveat 표시", async ({ page }) => {
    test.setTimeout(60_000);
    // 자본적지출 9억 + 양도비 1천만 = 9.1억 (환산 ≈ 4억 + 개산공제 → 가목보다 훨씬 큼)
    await seedAndCalc(page, "900000000", "10000000");
    await expect(page.getByText(SWAP_CAVEAT, { exact: false }).first()).toBeVisible();
  });

  test("나목 < 가목 → 본문 유지, swap caveat 미표시", async ({ page }) => {
    test.setTimeout(60_000);
    // 자본적지출 1천만 + 양도비 5백만 = 1.5천만 (가목 ≈ 4억보다 작음 → swap 미발동)
    await seedAndCalc(page, "10000000", "5000000");
    await expect(page.getByText(SWAP_CAVEAT, { exact: false })).toHaveCount(0);
  });
});
