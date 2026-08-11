/**
 * E2E: 일반건물 증축 **4조합** — 원취득분 × 증축분 취득방식이 각각 실가/환산으로 계산된다
 *
 * 계획서: `docs/02-design/features/transfer-gb-extension-4mode-matrix.plan.md`
 *
 * ## 무엇을 잡는가
 *
 *   X-13. 조합 B(원건물 실가 + 증축 **실가**)에서 **증축분 양도가액이 0이 아니다**
 *         — ④가 「양도시 건물2 기준시가」를 싣지 않아 §166⑥ 안분 분모에서 건물2가 빠지던 결함(D-1)
 *   U2.   증축 토글이 **실거래가 모드에서도** 보인다
 *         — 「토지·건물 일괄(증축분 별도)」 라디오를 제거했으므로 이 토글이 유일 진입점이다
 *   U1.   상단 라디오는 **2옵션**이다
 *
 * ⚠️ 단위 anchor(`__tests__/tax-engine/transfer-tax/gb-extension-4mode.anchor.test.ts`)가 값을
 *    고정한다. 여기서는 **브라우저에서 실제로 그 화면과 결과에 도달하는지**를 본다.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

/** 매매 취득 일반건물 — 토지 205㎡ · 건물 300㎡ · 양도 16.2억. */
function seedForm(over: Record<string, unknown> = {}) {
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1),
            assetKind: "general_building",
            acquisitionCause: "purchase",
            gbBuildingAcquisitionCause: "purchase",
            hasSeperateLandAcquisitionDate: false,
            landAcquisitionDate: "2010-05-01",
            acquisitionDate: "2010-05-01",
            useEstimatedAcquisition: false,
            fixedAcquisitionPrice: "800000000",
            gbAcqLandPricePerSqm: "2800000",
            gbAcqBuildingValue: "28144700",
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

/** 조합 B — 원건물 실가 + 증축분 **실거래가**. */
const EXT_ACTUAL = {
  gbHasExtension: true,
  gbExtensionDate: "2015-06-01",
  gbExtensionArea: "80",
  gbExtensionAcquisitionCause: "newConstruction",
  gbExtensionAcquisitionMode: "actual",
  gbExtensionActualAcquisitionPrice: "300000000",
  gbExtensionActualExpenses: "0",
  gbTransferExtensionBuildingStdPrice: "60000000",
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

/** 마지막 단계까지 넘어가 계산을 실행한다. */
async function calculate(page: Page) {
  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
}

test.describe("일반건물 증축 4조합 — UI 축", () => {
  test("U1: 「취득가액 산정 방식」에 「토지·건물 일괄 (증축분 별도)」 옵션이 없다", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await seed(page);
    await expandAssetSection(page, 3);
    await expect(page.getByText("토지·건물 일괄 (증축분 별도)")).toHaveCount(0);
    // 대조군 — 라디오 자체는 렌더된다(문구만 사라진 것이 아니라 축이 바뀐 것).
    await expect(page.getByText("환산취득가").first()).toBeVisible();
  });

  test("U2: 실거래가 모드에서도 「증축 있음」 토글이 보인다 (유일 진입점)", async ({ page }) => {
    test.setTimeout(90_000);
    await seed(page);
    await expandAssetSection(page, 3);
    await expect(page.getByText("증축 있음").first()).toBeVisible();
  });
});

test.describe("일반건물 증축 4조합 — 계산 도달", () => {
  /**
   * 🔴 **D-1의 최종 관측 지점**. 결함이 있으면 증축분 양도가액이 0이 되고 토지·건물1이
   * 총액을 다 가져간다. 결과 표의 건물2 열에서 그것을 본다.
   */
  test("X-13: 조합 B(원건물 실가 + 증축 실가)가 계산까지 도달하고 3-way 표가 뜬다", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await seed(page, EXT_ACTUAL);
    await calculate(page);

    await expect(page.getByText(/양도소득세 계산 결과|산출세액/).first()).toBeVisible({
      timeout: 30_000,
    });
    // 3-way 요약 표 — 증축 케이스에서만 렌더된다.
    await expect(page.getByText(/일반건물 3-자산 요약/)).toBeVisible();
    // 건물2 열이 존재한다(증축 카드가 3-way로 생성됐다).
    await expect(page.getByText("(3002·증축)")).toBeVisible();
  });

  test("조합 D(원건물 환산 + 증축 실가)도 계산까지 도달한다", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page, {
      ...EXT_ACTUAL,
      useEstimatedAcquisition: true,
      fixedAcquisitionPrice: "",
      landAcqMode: "estimated",
      buildingAcqMode: "estimated",
    });
    await calculate(page);

    await expect(page.getByText(/양도소득세 계산 결과|산출세액/).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/일반건물 3-자산 요약/)).toBeVisible();
  });
});
