/**
 * 재개발/재건축(redevelopment_apt) 상속 종전자산 취득가액 §163⑨ 정합 end-to-end 회귀 E2E.
 *
 * 검증: 상속으로 취득한 종전자산은 상속개시일 상증법 평가액(§163⑨)을 종전자산 취득가액으로
 *   사용한다. 사용자가 재개발 환산모드(useEstimatedAcquisition=true)여도, 상속평가액이 확인되면
 *   §166③ 환산은 적용하지 않는다(§166③은 "취득가액 확인 불가 시에만").
 *   → 신고서 인가전 분 취득가액 = 상속개시일 평가액 200,000,000 (§166③ 환산 141,221,534 아님).
 *
 * 시나리오(case-44 재개발 파라미터 + 상속): APT-납부-주택출자 / 양도가 5.25억 /
 *   상속개시일 2005-04-09(≥1985) / 상속평가액 200,000,000 / 환산모드 ON.
 *   (버그였다면 §166③ 환산 141,221,534로 종전취득가 산정 → 과대과세.)
 *
 * PR #718 (fix/redev-inheritance-163-9) 회귀 가드.
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
          acquisitionCause: "inheritance",
          acquisitionDate: "2005-04-09", // 상속개시일 (≥1985 → post-deemed)
          decedentAcquisitionDate: "2000-01-01", // 피상속인 취득일 (상속 필수)
          inheritanceStartDate: "2005-04-09",
          inheritanceAssetKind: "house_individual",
          publishedValueAtInheritance: "200000000", // 상속개시일 상증법 평가액
          useEstimatedAcquisition: true, // 환산모드 — 수정 후 상속평가액 확인 시 §166③ 무시
          // 재개발 (case-44 미러 — APT/납부/주택출자)
          redevSubject: "apt",
          redevApprovalLawBasis: "urban_renovation_art_74",
          redevOriginalAssetType: "housing",
          redevSettlementDirection: "pay",
          redevApprovalDate: "2009-10-23",
          redevRightsValue: "219218500",
          redevSettlementAmount: "92781500",
          redevPreApprovalExpenses: "0",
          redevPostApprovalExpenses: "0",
          redevAcquisitionHousingPrice: "85034988",
          redevManagementDisposalHousingPrice: "132000000",
        }],
        transferDate: "2026-02-16",
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

test.describe("재개발 상속 종전자산 취득가액 §163⑨ 정합", () => {
  test("상속 재개발(환산모드) → 인가전 취득가액 = 상속평가액 200,000,000 (§166③ 환산 아님)", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndCalc(page);

    // 신고서 취득가액 행에 인가전 분 = 상속개시일 평가액 200,000,000 이 나타난다.
    await expect(
      page.getByRole("row", { name: /취득가액.*200,000,000/ }).first(),
    ).toBeVisible();

    // 버그(§166③ 환산) 값 141,221,534 는 나타나지 않는다.
    await expect(page.getByText("141,221,534")).toHaveCount(0);
  });
});
