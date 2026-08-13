/**
 * ⑤ 「인가전 분 종전 부동산 취득가액」 — 실가/환산 **단일 섹션 라디오** E2E 회귀 가드
 * (2026-08-13 사용자 지시로 통합).
 *
 * 종전에는 실가 카드(⑤ sky)와 「환산취득가 사용」 ToggleCard(⑥ rose)가 분리돼 모드 전환이
 * 두 카드에 흩어져 있었다. 이제 한 섹션의 라디오가 모드를 결정하고, 고른 쪽 입력만 뜬다.
 *
 * 모드 값은 기존 `useEstimatedAcquisition`(boolean) 그대로다 — 신규 필드 없음.
 *
 * 검증:
 *   R-1 실지거래가액 선택 → 「실거래가 취득가액」만 노출, 환산 입력 미노출
 *   R-2 환산취득가액 선택 → 환산 입력 노출, 실거래가 입력 미노출
 *   R-3 종전 「환산취득가 사용」 토글은 더 이상 없다 (중복 컨트롤 제거 확인)
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

function seedForm() {
  return {
    state: {
      formData: {
        assets: [{
          ...makeDefaultAsset(1),
          // ⚠️ assetKind="right_to_move_in"이면 RedevelopmentBlock이 렌더되지 않는다
          //    (AssetSectionAcquisition.tsx의 게이트가 redevelopment_apt 한정 — 별건 미결).
          //    입주권 양도는 redevelopment_apt + redevSubject="right"로 진입한다.
          assetKind: "redevelopment_apt",
          acquisitionCause: "purchase",
          acquisitionDate: "2009-04-09",
          useEstimatedAcquisition: false,
          redevSubject: "right",
          redevApprovalLawBasis: "urban_renovation_art_74",
          redevOriginalAssetType: "housing",
          redevSettlementDirection: "pay",
          redevApprovalDate: "2016-10-23",
          redevRightsValue: "300000000",
          redevSettlementAmount: "50000000",
          redevPreApprovalExpenses: "0",
          redevPostApprovalExpenses: "0",
          redevActualAcquisitionPrice: "180000000",
        }],
        transferDate: "2026-03-02",
        filingDate: "2026-04-30",
        contractTotalPrice: "420000000",
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

async function openAssetStep(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), seedForm());
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  // 자산 카드의 ③ 취득정보 섹션을 펼쳐야 재개발 블록이 보인다(기본 접힘).
  await page.getByRole("button", { name: /취득정보/ }).first().click();
}

test.describe("⑤ 종전 부동산 취득가액 — 실가/환산 라디오 통합", () => {
  test("R-1/R-2: 라디오 선택에 따라 해당 입력 UI만 표시된다", async ({ page }) => {
    test.setTimeout(60_000);
    await openAssetStep(page);

    const section = page.getByText("인가전 분 종전 부동산 취득가액").first();
    await expect(section).toBeVisible();

    // R-1: 실지거래가액(기본) — 실거래가 입력만
    await expect(page.getByText("실거래가 취득가액").first()).toBeVisible();
    await expect(page.getByText("환산 기준시가")).toHaveCount(0);

    // R-2: 환산취득가액으로 전환 — 환산 입력 노출 + 실거래가 입력 사라짐
    await page.getByRole("radio", { name: /환산취득가액/ }).first().check();
    await expect(page.getByText("환산 기준시가").first()).toBeVisible();
    await expect(page.getByText("실거래가 취득가액")).toHaveCount(0);

    // 다시 실지거래가액으로 복귀 가능
    await page.getByRole("radio", { name: /실지거래가액/ }).first().check();
    await expect(page.getByText("실거래가 취득가액").first()).toBeVisible();
  });

  test("R-3: 종전 「환산취득가 사용」 토글이 더 이상 존재하지 않는다", async ({ page }) => {
    test.setTimeout(60_000);
    await openAssetStep(page);

    await expect(page.getByRole("switch", { name: "환산취득가 사용" })).toHaveCount(0);
  });
});
