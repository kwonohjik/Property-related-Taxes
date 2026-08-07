/**
 * E2E: 일반건물 **상속·증여 × 증축**(3파트) — 입력 경로가 실재하는가
 *
 * 계획서: `docs/02-design/features/transfer-gb-inheritance-extension-3part.plan.md`
 *
 * 이 조합은 종전에 validate가 하드 차단했다. 차단을 푸는 것만으로는 부족했다 —
 * 증축 카드가 `isEstimated`(환산 모드)에서만 열리는데 상속·증여는 §163⑨이 실가를 강제해
 * `isEstimated`가 **항상 false**이고, 증축을 켜는 다른 진입점인 「토지·건물 일괄(증축분 별도)」
 * 라디오는 `CompanionAcqPurchaseBlock`(**매매 전용**)에만 있었다.
 * ⇒ 엔진·validate만 고치면 **화면에서 도달 불가**였다
 * (`feedback_api_trigger_without_input_path_is_noop`).
 *
 *   X-1. 상속 취득 → 「증축 있음」 토글이 **보인다**
 *   X-2. 매매 + 실가 모드 → 종전대로 **안 보인다** (회귀 0)
 *   X-3. 증축을 켠 상속 자산이 **계산까지 도달한다** (하드 차단 해제)
 *
 * ⚠️ 금액 anchor는 vitest가 담당한다
 *    (`__tests__/tax-engine/transfer-tax/gb-inheritance-extension-3part.anchor.test.ts`).
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

/** 2005년 상속 — §164 게이트 밖(평가액 그대로)이라 증축 축만 관찰된다. */
function seedForm(over: Record<string, unknown> = {}) {
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1),
            assetKind: "general_building",
            acquisitionCause: "inheritance",
            gbBuildingAcquisitionCause: "inheritance",
            hasSeperateLandAcquisitionDate: false,
            landAcquisitionDate: "2005-05-01",
            acquisitionDate: "2005-05-01",
            decedentAcquisitionDate: "1990-01-01",
            landAcqMode: "actual",
            buildingAcqMode: "actual",
            publishedValueAtInheritance: "500000000",
            gbBuildingInheritedValue: "300000000",
            gbAcqLandPricePerSqm: "2800000",
            gbAcqBuildingValue: "2814470",
            gbLandArea: "205",
            gbBuildingArea: "300",
            gbBuildingFootprintArea: "135",
            gbZoneType: "commercial",
            gbTransferLandPricePerSqm: "5514000",
            gbTransferBuildingValue: "259072400",
            actualSalePrice: "1620000000",
            ...over,
          },
        ],
        transferDate: "2026-02-16",
        filingDate: "2026-04-30",
        contractTotalPrice: "1620000000",
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

/** 증축 ON — 건물2는 자가증축 실가 3억(§163⑨ 대상 아님). */
const EXTENSION_FIELDS = {
  gbHasExtension: true,
  gbExtensionDate: "2015-06-01",
  gbExtensionArea: "80",
  gbExtensionAcquisitionCause: "newConstruction",
  gbExtensionAcquisitionMode: "actual",
  gbExtensionActualAcquisitionPrice: "300000000",
  gbExtensionActualExpenses: "0",
  gbTransferExtensionBuildingStdPrice: "60000000",
  gbAcquisitionExtensionBuildingStdPrice: "40000000",
};

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

test.describe("일반건물 상속·증여 × 증축 — 입력 경로", () => {
  test("X-1: 상속 취득이면 「증축 있음」 토글이 보인다", async ({ page }) => {
    test.setTimeout(90_000);
    await seed(page);
    await expandAssetSection(page, 3);

    await expect(page.getByText("증축 있음").first()).toBeVisible();
  });

  test("X-1b: 증여 취득도 같다", async ({ page }) => {
    test.setTimeout(90_000);
    await seed(page, {
      acquisitionCause: "gift",
      gbBuildingAcquisitionCause: "gift",
      donorAcquisitionDate: "1995-01-01",
      publishedValueAtInheritance: "",
      gbBuildingInheritedValue: "",
      fixedAcquisitionPrice: "800000000",
    });
    await expandAssetSection(page, 3);

    await expect(page.getByText("증축 있음").first()).toBeVisible();
  });

  test("X-2: 매매 + 실가 모드는 종전대로 안 보인다 (회귀 0)", async ({ page }) => {
    test.setTimeout(90_000);
    await seed(page, {
      acquisitionCause: "purchase",
      gbBuildingAcquisitionCause: "purchase",
      useEstimatedAcquisition: false,
      publishedValueAtInheritance: "",
      gbBuildingInheritedValue: "",
      fixedAcquisitionPrice: "800000000",
    });
    await expandAssetSection(page, 3);

    await expect(page.getByText("증축 있음")).toHaveCount(0);
  });

  test("X-3: 증축을 켠 상속 자산이 계산까지 도달한다 (하드 차단 해제)", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page, EXTENSION_FIELDS);
    await page.getByRole("button", { name: "가산세", exact: true }).first().click();
    await page.getByRole("button", { name: "세금 계산하기" }).click();

    // 종전 차단 문구가 더 이상 뜨지 않는다.
    await expect(
      page.getByText(/상속 취득 일반건물은 증축 조합을 지원하지 않습니다/),
    ).toHaveCount(0);
    // 결과 화면 도달 — 산출세액 카드가 뜬다.
    await expect(page.getByText(/양도소득세 계산 결과|산출세액/).first()).toBeVisible({
      timeout: 30_000,
    });
  });
});
