/**
 * 재개발 §164⑦ PHD 환산 — 기준시가 입력 **항목축 재편** + 건물 기준시가 계산기 E2E.
 * 계획서: docs/00-pm/redev-phd-stdprice-section-regroup.plan.md (V-7 브라우저 확인)
 *
 * 검증:
 *   P-1 §164⑦ 발동(취득일 < 최초공시일) 시 「토지 기준시가」·「건물 기준시가」 2섹션 렌더,
 *       종전 시점축 헤더(Sum_A/Sum_F 산정)는 사라졌다
 *   P-2 건물 섹션의 「건물 기준시가 계산」 런처가 **1개**이고 모달이 실제로 열린다
 *       (종전에는 이 자산에 계산기 진입점이 아예 없었다 — "수동 입력")
 *   P-3 §164⑦ 미발동(취득일 ≥ 최초공시일)이면 두 섹션·런처가 없고 단일 라목값 칸이 뜬다
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

function seedForm(acquisitionDate: string) {
  return {
    state: {
      formData: {
        assets: [{
          ...makeDefaultAsset(1),
          assetKind: "redevelopment_apt",
          acquisitionCause: "purchase",
          acquisitionDate,
          // ⑤ 라디오를 환산으로 — 이 값이 환산 입력 본문의 게이트다
          useEstimatedAcquisition: true,
          redevSubject: "right",
          redevApprovalLawBasis: "urban_renovation_art_74",
          redevOriginalAssetType: "housing",
          redevSettlementDirection: "pay",
          redevApprovalDate: "2009-06-01",
          redevRightsValue: "300000000",
          redevSettlementAmount: "50000000",
          redevPreApprovalExpenses: "0",
          redevPostApprovalExpenses: "0",
          redevManagementDisposalHousingPrice: "132000000",
          // 최초공시일 — 단독주택 개별주택가격 최초 공시일
          redevFirstDisclosureDate: "2005-04-30",
          redevFirstDisclosureHousingPrice: "86000000",
          redevAcquisitionHousingPrice: "100000000",
          redevLandArea: "83.2",
          redevLandPricePerSqmAtAcq: "1400000",
          redevLandPricePerSqmAtFirst: "1400000",
          redevBuildingStdPriceAtAcq: "6507200",
          redevBuildingStdPriceAtFirst: "6507200",
          addressJibun: "경기도 수원시 영통구 영통동 957-6",
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

async function openAssetStep(page: Page, acquisitionDate: string) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedForm(acquisitionDate),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByRole("button", { name: /취득정보/ }).first().click();
  await expect(page.getByText("환산 기준시가").first()).toBeVisible();
}

test.describe("재개발 §164⑦ PHD — 기준시가 항목축 재편", () => {
  test("P-1: 토지·건물 2섹션 렌더 + 종전 시점축 헤더 제거", async ({ page }) => {
    test.setTimeout(60_000);
    await openAssetStep(page, "2003-05-10"); // < 2005-04-30 → §164⑦ 발동

    await expect(page.getByText("§164⑦ 본문 발동").first()).toBeVisible();
    await expect(page.getByText("토지 기준시가", { exact: true })).toBeVisible();
    await expect(page.getByText("건물 기준시가", { exact: true })).toBeVisible();
    // 종전 시점축 헤더는 없다
    await expect(page.getByText(/Sum_A 산정/)).toHaveCount(0);
    await expect(page.getByText(/Sum_F 산정/)).toHaveCount(0);

    // 입력 4칸은 그대로 남는다 — 재편이 입력 경로를 줄이지 않는다
    await expect(page.getByText("취득시 개별공시지가 (원/㎡)")).toBeVisible();
    await expect(page.getByText("최초공시 당시 개별공시지가 (원/㎡)")).toBeVisible();
    await expect(page.getByText("취득시 건물 기준시가")).toBeVisible();
    await expect(page.getByText("최초공시 당시 건물 기준시가")).toBeVisible();
  });

  test("P-2: 건물 기준시가 계산 런처 1개 — 모달이 열린다", async ({ page }) => {
    test.setTimeout(60_000);
    await openAssetStep(page, "2003-05-10");

    const launcher = page.getByRole("button", { name: /건물 기준시가 계산/ });
    await expect(launcher).toHaveCount(1);
    await launcher.click();
    // 모달 본문 — 둘째 시점 라벨이 "최초공시 시점"으로 override 된다
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText(/최초공시 시점/).first()).toBeVisible();
  });

  test("P-3: §164⑦ 미발동이면 두 섹션·런처가 없고 단일 라목값 칸이 뜬다", async ({ page }) => {
    test.setTimeout(60_000);
    await openAssetStep(page, "2010-03-01"); // ≥ 2005-04-30 → 미발동

    await expect(page.getByText("취득당시 개별주택공시가격").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /건물 기준시가 계산/ })).toHaveCount(0);
    await expect(page.getByText("토지 기준시가", { exact: true })).toHaveCount(0);
  });
});
