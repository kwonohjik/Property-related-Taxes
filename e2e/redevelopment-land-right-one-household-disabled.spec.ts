/**
 * 토지 출자 조합원입주권 — 「보유 상황」의 **1세대 해당 토글 비활성화** E2E 회귀 가드.
 *
 * 법령 근거 (소득세법 원문 확인 2026-08-13):
 *   §89①4호 본문 — 「…관리처분계획의 인가일… 현재 제3호가목에 해당하는 **기존주택을 소유하는
 *     세대**」가 요건 ⇒ 토지만 출자한 조합원은 인가일 현재 기존주택이 없어 비과세 불성립.
 *   §95② 단서 — 「1세대 1주택…에 해당하는 **자산**」 ⇒ 종전자산이 주택이 아니면 표2 진입 불가.
 *
 * 종전에는 토글을 켤 수 있었고, 실가 경로에서 실제로 LTHD 표2가 적용돼 세액이 과소했다
 * (엔진 가드는 `land-contributed-right-no-one-house.anchor.test.ts`가 별도로 고정한다).
 *
 * 대비군으로 **주택 출자**는 토글이 활성 상태여야 한다 — 과잉 차단 방지.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

function seedForm(originalAssetType: "land" | "housing") {
  return {
    state: {
      formData: {
        assets: [{
          ...makeDefaultAsset(1),
          assetKind: "right_to_move_in",
          acquisitionCause: "purchase",
          acquisitionDate: "2009-04-09",
          fixedAcquisitionPrice: "180000000",
          useEstimatedAcquisition: false,
          redevSubject: "right",
          redevApprovalLawBasis: "urban_renovation_art_74",
          redevOriginalAssetType: originalAssetType,
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

async function openHoldingStep(page: Page, originalAssetType: "land" | "housing") {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedForm(originalAssetType),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByRole("button", { name: "보유 상황", exact: true }).first().click();
}

test.describe("토지 출자 입주권 — 1세대 해당 토글", () => {
  test("토지 출자: 1세대 해당 토글이 비활성화된다 (§89①4호 본문·§95② 단서)", async ({ page }) => {
    test.setTimeout(60_000);
    await openHoldingStep(page, "land");

    const toggle = page.getByRole("switch", { name: "1세대 해당" });
    await expect(toggle).toBeVisible();
    await expect(toggle).toBeDisabled();
    // 비활성 사유가 화면에 근거와 함께 보인다.
    await expect(page.getByText(/토지를 출자한 조합원입주권은 1세대1주택 특례/)).toBeVisible();
  });

  test("주택 출자: 1세대 해당 토글은 활성 상태 (과잉 차단 방지)", async ({ page }) => {
    test.setTimeout(60_000);
    await openHoldingStep(page, "housing");

    const toggle = page.getByRole("switch", { name: "1세대 해당" });
    await expect(toggle).toBeVisible();
    await expect(toggle).toBeEnabled();
  });
});
