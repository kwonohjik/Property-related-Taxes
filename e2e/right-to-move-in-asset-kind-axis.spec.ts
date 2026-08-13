/**
 * 자산 종류 축 일원화 — 입주권 / 재개발APT (2026-08-13 사용자 지시).
 *
 *   입주권(`right_to_move_in`)      = 조합원입주권 양도 전담 (§166① · §95② 단서 · §89①4호)
 *   재개발APT(`redevelopment_apt`)  = 재개발·재건축으로 완공된 APT 양도 전담 (§166②)
 *
 * 종전 결함: `AssetSectionAcquisition.tsx`의 렌더 게이트가 `redevelopment_apt` 하나뿐이라
 * **입주권을 고르면 §166 입력 UI가 아예 없었다**(관리처분 인가일·권리가액·청산금 입력 불가).
 * API 변환·validate·엔진은 이미 두 종류를 모두 §166 경로로 처리하고 있었다 — UI만 빠져 있었다.
 *
 * 함께 정리한 것:
 *   - ① 「양도 대상」 라디오 폐지 — 자산 종류가 축을 결정하므로 이중 입력이었다
 *   - ②-a 「조합원 구분」은 완공APT 전용 — 입주권의 승계 여부는 ① 기본정보 「조합원 유형」이 받는다
 *     (전자는 §166 우회 산식(사례 48), 후자는 §95② LTHD 배제 — **다른 사실**)
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

function seedForm(assetKind: "right_to_move_in" | "redevelopment_apt", redevSubject = "") {
  return {
    state: {
      formData: {
        assets: [{
          ...makeDefaultAsset(1),
          assetKind,
          redevSubject,
          acquisitionCause: "purchase",
          acquisitionDate: "2009-04-09",
          fixedAcquisitionPrice: "180000000",
          useEstimatedAcquisition: false,
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

async function openAcquisitionStep(
  page: Page,
  assetKind: "right_to_move_in" | "redevelopment_apt",
  redevSubject = "",
) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedForm(assetKind, redevSubject),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByRole("button", { name: /취득정보/ }).first().click();
}

test.describe("자산 종류 축 — 입주권 / 재개발APT", () => {
  test("A-1: 입주권 자산에서 §166 입력 UI가 표시된다 (종전에는 아예 없었다)", async ({ page }) => {
    test.setTimeout(60_000);
    await openAcquisitionStep(page, "right_to_move_in");

    await expect(page.getByText("재개발 일정·금액", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("관리처분 인가일").first()).toBeVisible();
    await expect(page.getByText("권리가액").first()).toBeVisible();
    await expect(page.getByText("인가전 분 종전 부동산 취득가액").first()).toBeVisible();
  });

  test("A-2: ① 「양도 대상」 라디오가 폐지됐다 (자산 종류가 축)", async ({ page }) => {
    test.setTimeout(60_000);
    await openAcquisitionStep(page, "right_to_move_in");

    await expect(page.getByRole("radio", { name: /완공 APT 양도/ })).toHaveCount(0);
    await expect(page.getByRole("radio", { name: /입주권 양도/ })).toHaveCount(0);
  });

  test("A-3: 입주권 자산에는 ②-a 「조합원 구분」이 없다 (완공APT 전용)", async ({ page }) => {
    test.setTimeout(60_000);
    await openAcquisitionStep(page, "right_to_move_in");

    await expect(page.getByText("조합원 구분")).toHaveCount(0);
    // 입주권의 승계 여부는 ① 기본정보의 「조합원 유형」이 받는다.
    await expect(page.getByText("조합원 유형").first()).toBeVisible();
  });

  test("A-4: 재개발APT 자산에는 ②-a 「조합원 구분」이 남는다 (사례 48)", async ({ page }) => {
    test.setTimeout(60_000);
    await openAcquisitionStep(page, "redevelopment_apt");

    await expect(page.getByText("조합원 구분").first()).toBeVisible();
  });

  test("A-5: 저장된 「APT 자산 + 입주권 양도」는 입주권 자산으로 승격된다 (의미 보존)", async ({ page }) => {
    test.setTimeout(60_000);
    // 마이그레이션 대상 조합을 그대로 seed — 종전 UI로 저장 가능했던 상태.
    await openAcquisitionStep(page, "redevelopment_apt", "right");

    // 자산 종류 버튼이 「입주권」으로 승격돼 선택돼 있다.
    const selected = page.locator("button", { hasText: /^입주권$/ }).first();
    await expect(selected).toHaveClass(/bg-primary/);
    // 승격됐으므로 완공APT 전용 카드는 사라진다.
    await expect(page.getByText("조합원 구분")).toHaveCount(0);
  });
});
