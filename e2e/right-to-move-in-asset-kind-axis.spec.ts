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

function seedForm(
  assetKind: "right_to_move_in" | "redevelopment_apt",
  redevSubject = "",
  settlementDirection: "pay" | "receive" = "pay",
) {
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
          redevSettlementDirection: settlementDirection,
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
        // ⑥ 「거주개월 분리 입력」은 1세대1주택 게이트를 탄다
        // (`Step1.tsx:233` — isOneHousehold === true && householdHousingCount === "1").
        // A-6·A-7이 그 카드의 자산종류 분기를 보려면 게이트가 먼저 열려 있어야 한다.
        isOneHousehold: true,
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

async function openAcquisitionStep(
  page: Page,
  assetKind: "right_to_move_in" | "redevelopment_apt",
  redevSubject = "",
  settlementDirection: "pay" | "receive" = "pay",
) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedForm(assetKind, redevSubject, settlementDirection),
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

  /**
   * A-6·A-7 (2026-08-14) — 완공 APT 전용 입력 2종의 대칭 회귀.
   *
   * 둘 다 **신축 APT가 존재해야** 성립하는 사실이라 완공 전 권리 양도인 입주권에는 없다.
   * 종전에는 입주권 화면에 그대로 노출됐고, 값이 세액을 조용히 바꿨다(실측):
   *   ③-a 청산금 수령분 단독 신고 → 양도가액이 청산금 수령액으로 교체(양도차익 1.7억 소실)
   *   ⑥  거주개월 분리 입력       → 입주권 LTHD 14% → 68%
   */
  test("A-6: 입주권에는 완공APT 전용 입력 2종이 없다 (청산금 수령 · 1세대1주택)", async ({ page }) => {
    test.setTimeout(60_000);
    await openAcquisitionStep(page, "right_to_move_in", "", "receive");

    await expect(page.getByText("청산금 수령분 단독 신고")).toHaveCount(0);
    await expect(page.getByText("거주개월 분리 입력", { exact: false })).toHaveCount(0);
    // 입주권 고유 입력은 그대로 있어야 한다 (과잉 숨김 방지).
    await expect(page.getByText("청산금 방향").first()).toBeVisible();
    await expect(page.getByText("권리가액").first()).toBeVisible();
  });

  test("A-7: 재개발APT에는 두 입력이 남는다 (사례 45·46 회귀 방지)", async ({ page }) => {
    test.setTimeout(60_000);
    await openAcquisitionStep(page, "redevelopment_apt", "", "receive");

    await expect(page.getByText("청산금 수령분 단독 신고").first()).toBeVisible();
    await expect(page.getByText("거주개월 분리 입력", { exact: false }).first()).toBeVisible();
  });

  test("A-8: ④ 섹션 조문이 자산 종류를 따른다 (입주권 §166① / 완공APT §166②1호)", async ({ page }) => {
    test.setTimeout(60_000);
    await openAcquisitionStep(page, "right_to_move_in");
    await expect(page.getByText("재개발 일정·금액 (시행령 §166①)").first()).toBeVisible();

    await openAcquisitionStep(page, "redevelopment_apt");
    await expect(page.getByText("재개발 일정·금액 (시행령 §166②1호)").first()).toBeVisible();
  });
});
