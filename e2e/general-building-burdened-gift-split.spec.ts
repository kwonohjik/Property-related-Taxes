/**
 * E2E: 일반건물 **부담부증여 × 「토지·건물 취득일 다름」**(V-4) — 입력 경로가 실재하는가
 *
 * 계획서: `docs/02-design/features/transfer-gb-inheritance-extension-3part.plan.md` §10-1
 *
 * §9-6은 이 조합을 「그대로 막는다」고 적었으나, 실측하니 ⑧ validate의 V-4 차단은
 * 부담부증여 분기의 조기 `return null` 뒤에 있어 **한 번도 실행되지 않는 코드**였다.
 * 즉 조합은 처음부터 열려 있었고, 라우트 엔진도 파트별 취득일을 맞게 계산한다.
 *
 * 그렇다면 남는 질문은 **화면**이다 — 엔진이 옳아도 토글에 닿을 수 없으면 no-op이다
 * (`feedback_api_trigger_without_input_path_is_noop`). 이 스펙이 그것을 본다:
 *
 *   BG-1. 부담부증여 일반건물에서 「토지·건물 취득일 다름」 토글이 **보인다**
 *   BG-2. 켜면 토지·건물 취득일 **두 칸**이 뜬다
 *   BG-3. 파트별 **취득가액 산정 방식**은 뜨지 않는다 (§159가 정하므로 — 입력해도 무시된다)
 *   BG-4. 분리 ON 상태로 **계산까지 도달한다**
 *
 * ⚠️ 금액 anchor는 vitest가 담당한다
 *    (`__tests__/tax-engine/transfer-tax/gb-burdened-gift-split-date.anchor.test.ts`).
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

/** 사례 34 기준시가 · 토지 1998 취득 / 건물 2023 신축 · 2026 부담부증여. */
function seedForm(over: Record<string, unknown> = {}) {
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1),
            assetKind: "general_building",
            transferType: "burdened_gift",
            bgValuationMode: "sangjeungbeop_standard",
            bgLendingDepositTotal: "1000000000",
            bgMortgageDebtAmount: "3120000000",
            bgAnnualRentTotal: "130000000",
            bgDonorRelation: "lineal_descendant",
            acquisitionCause: "purchase",
            gbBuildingAcquisitionCause: "purchase",
            // M-1a 규약 — acquisitionDate = 건물, landAcquisitionDate = 토지
            hasSeperateLandAcquisitionDate: true,
            landAcquisitionDate: "1998-09-07",
            acquisitionDate: "2023-01-01",
            gbLandArea: "1279",
            gbBuildingArea: "1341.5",
            gbBuildingFootprintArea: "388.27",
            gbZoneType: "commercial",
            gbTransferLandPricePerSqm: "6215000",
            gbTransferBuildingValue: "631846500",
            gbAcqLandPricePerSqm: "2130000",
            gbAcqBuildingValue: "424472064",
            ...over,
          },
        ],
        transferDate: "2026-02-16",
        filingDate: "2026-04-30",
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

async function seed(page: Page, over: Record<string, unknown> = {}) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedForm(over),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

test.describe("일반건물 부담부증여 × 취득일 분리 — 입력 경로", () => {
  test("BG-1: 「토지·건물 취득일 다름」 토글이 보인다", async ({ page }) => {
    test.setTimeout(90_000);
    await seed(page, { hasSeperateLandAcquisitionDate: false });
    await expandAssetSection(page, 3);

    await expect(page.getByText("토지·건물 취득일 다름").first()).toBeVisible();
  });

  test("BG-2: 분리 ON이면 토지·건물 취득일 두 칸이 뜬다", async ({ page }) => {
    test.setTimeout(90_000);
    await seed(page);
    await expandAssetSection(page, 3);

    await expect(page.getByText("토지 취득", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("건물 취득일").first()).toBeVisible();
  });

  test("BG-3: 파트별 취득가액 산정 방식은 뜨지 않는다 (§159가 정한다)", async ({ page }) => {
    test.setTimeout(90_000);
    await seed(page);
    await expandAssetSection(page, 3);

    // 일반건물의 파트 축은 `PartAcqModeField`다(`LandBuildingSplitSection`은 `isSplitable`이
    // housing·building 한정이라 일반건물에서는 애초에 렌더되지 않는다 — 그것으로 단언하면
    // 부담부증여와 무관하게 항상 통과하는 **무의미한 테스트**가 된다. mutation probe로 확인했다).
    // 남겨 두면 「입력했는데 세액이 그대로」인 칸이 된다 — anchor가 그 불변식을 고정한다.
    await expect(page.getByText("토지 취득가액 산정 방식")).toHaveCount(0);
    await expect(page.getByText("건물 취득가액 산정 방식")).toHaveCount(0);
    await expect(page.getByText("토지 자본적지출")).toHaveCount(0);
  });

  test("BG-4: 분리 ON 상태로 계산까지 도달한다", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page);
    await page.getByRole("button", { name: "가산세", exact: true }).first().click();
    await page.getByRole("button", { name: "세금 계산하기" }).click();

    // 삭제된 V-4 차단 문구가 되살아나지 않았는지 — 되살리면 사용자가 틀린 값으로 몰린다.
    await expect(page.getByText(/「토지·건물 취득일 다름」을 끄세요/)).toHaveCount(0);
    await expect(page.getByText(/양도소득세 계산 결과|산출세액/).first()).toBeVisible({
      timeout: 30_000,
    });
  });
});
