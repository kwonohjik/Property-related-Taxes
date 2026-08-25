/**
 * 재개발 신축주택 §104⑦ 다주택 중과 + §95② 장특공제 배제 — 실브라우저 회귀 E2E.
 *
 * 엔진 anchor(`__tests__/tax-engine/transfer-tax/redevelopment/multi-house-surcharge.anchor.test.ts`)와
 * 표시 anchor(`.../lthd-exclusion-display.anchor.test.ts`)는 엔진·빌더를 **직접 호출**한다.
 * 본 spec은 그 판정이 **폼 → API → 결과뷰까지 실제로 도달하는지**를 지킨다
 * (memory `feedback_transfer_result_view_is_not_one` · `feedback_leaf_anchor_skips_zod_layer`).
 *
 * 검증:
 *   S-1 조정지역 3주택 → 중과 배지 + 장특공제 배제 배너
 *   S-2 대조군(비조정 1주택) → 배지·배너 모두 없음, 장특공제가 살아 있다
 *
 * 계획서: docs/00-pm/transfer-right-to-move-in-surcharge-scope.plan.md §10
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

/**
 * 사례 44 재개발APT · 양도 2026-06-01 — **유예 종료 후**.
 *
 * ⚠️ 양도일이 2026-05-09 이하이면 영 §167의3①12의2 가목 한시배제로 중과가 안 걸린다.
 *    그러면 이 spec은 결함이 있어도 초록이 된다(구별력 0).
 */
function seedForm(regulated: boolean) {
  return {
    state: {
      formData: {
        assets: [{
          ...makeDefaultAsset(1),
          assetKind: "redevelopment_apt",
          acquisitionCause: "purchase",
          acquisitionDate: "2005-04-09",
          useEstimatedAcquisition: false,
          redevActualAcquisitionPrice: "200000000",
          redevSubject: "apt",
          redevApprovalLawBasis: "urban_renovation_art_74",
          redevOriginalAssetType: "housing",
          redevSettlementDirection: "pay",
          redevApprovalDate: "2016-10-23",
          redevRightsValue: "300000000",
          redevSettlementAmount: "50000000",
          redevPreApprovalExpenses: "0",
          redevPostApprovalExpenses: "0",
        }],
        transferDate: "2026-06-01",
        filingDate: "2026-07-31",
        contractTotalPrice: "525000000",
        householdHousingCount: regulated ? "3" : "1",
        isRegulatedArea: regulated,
        wasRegulatedAtAcquisition: regulated,
        isUnregistered: false,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function seedAndCalc(page: Page, regulated: boolean) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), seedForm(regulated));
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  await page.getByText("신고서 양식", { exact: false }).first().waitFor({ timeout: 20000 });
}

test.describe("재개발 신축주택 — §104⑦ 중과 · §95② 배제 표시", () => {
  test("S-1: 조정지역 3주택 → 중과 배지 + 장특공제 배제 배너가 뜬다", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndCalc(page, true);

    // 중과 배지 (TransferTaxResultView) — 3주택+ 30%p
    await expect(page.getByText(/중과세 적용/).first()).toBeVisible();
    await expect(page.getByText(/3주택\+/).first()).toBeVisible();

    // 🔴 장특공제 배제 배너 (RedevelopmentDetailCard) — 이 배치의 산출물
    await expect(page.getByText("장기보유특별공제 배제").first()).toBeVisible();
    await expect(page.getByText(/보유기간이 짧아서가 아닙니다/).first()).toBeVisible();
  });

  test("S-2: 대조군 — 비조정 1주택은 배지·배너 모두 없다", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndCalc(page, false);

    await expect(page.getByText(/중과세 적용/)).toHaveCount(0);
    await expect(page.getByText("장기보유특별공제 배제")).toHaveCount(0);
  });
});
