/**
 * 청산금 수령분 단독 신고(사례 46) — 결과탭 「신고서 양식」 합계 열 회귀 E2E.
 *
 * 결함: 신고 대상은 청산금 수령분뿐인데 합계 열이 폼의 자산-수준 양도가액(신축APT 양도가)과
 *   폼 양도일을 그대로 읽어 ①+②+③ 파트 합과 어긋났다.
 *   → 양도가액 525,000,000(파트 합 114,000,000) · 취득가액 456,600,000(파트 합 45,600,000)
 *
 * 계획서: docs/02-design/features/redev-receive-only-display-total-mismatch.plan.md (E-1)
 *
 * 단위 anchor(`__tests__/components/redev-receive-only-filing-total.anchor.test.ts`)는
 * buildRows/buildStatementItems를 직접 호출한다. 본 spec은 그 보정이 **실제 결과뷰에 도달하는지**를
 * 지킨다(memory `feedback_transfer_result_view_is_not_one` — 양도세 결과뷰는 하나가 아니다).
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

function seedForm() {
  return {
    state: {
      formData: {
        assets: [{
          ...makeDefaultAsset(1),
          assetKind: "redevelopment_apt",
          acquisitionCause: "purchase",
          acquisitionDate: "2002-04-09",
          fixedAcquisitionPrice: "200000000",
          useEstimatedAcquisition: false,
          // 실가 모드 — 인가전 분 종전 주택 취득가액 (§166①1호 · validate 필수)
          redevActualAcquisitionPrice: "200000000",
          redevSubject: "apt",
          redevApprovalLawBasis: "urban_renovation_art_74",
          redevOriginalAssetType: "housing",
          redevSettlementDirection: "receive",
          redevReceiveOnlyMode: "yes",            // 청산금 수령분 단독 신고
          redevExemptionEligibleAtApproval: "no",
          redevApprovalDate: "2009-10-23",
          redevRightsValue: "500000000",
          redevSettlementAmount: "114000000",
          redevSettlementSaleDate: "2024-01-26",  // 소유권이전 고시일(2024-01-25) 익일
          redevPreApprovalExpenses: "0",
          redevPostApprovalExpenses: "0",
        }],
        // 폼에 남은 신축APT 양도가·양도일 — receiveOnly에서는 신고 대상이 아니다.
        transferDate: "2026-03-02",
        filingDate: "2026-04-30",
        contractTotalPrice: "525000000",
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

async function seedAndCalc(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), seedForm());
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  await page.getByText("신고서 양식", { exact: false }).first().waitFor({ timeout: 20000 });
}

test.describe("청산금 수령분 단독 신고 — 신고서 합계 열", () => {
  test("합계 양도가액 = 청산금 114,000,000 · 취득가액 = 안분 45,600,000 (신축APT 양도가 아님)", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndCalc(page);

    await expect(page.getByRole("row", { name: /양도가액.*114,000,000/ }).first()).toBeVisible();
    await expect(page.getByRole("row", { name: /취득가액.*45,600,000/ }).first()).toBeVisible();

    // 결함 값(폼 양도가액 그대로 · 역산 취득가액)이 화면에 없어야 한다.
    await expect(page.getByText("525,000,000")).toHaveCount(0);
    await expect(page.getByText("456,600,000")).toHaveCount(0);
  });
});
