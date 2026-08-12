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

  test("U2: 실거래가 모드에서도 「증축한 부분이 있음」 토글이 보인다 (유일 진입점)", async ({ page }) => {
    test.setTimeout(90_000);
    await seed(page);
    await expandAssetSection(page, 3);
    await expect(page.getByText("증축한 부분이 있음").first()).toBeVisible();
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

  /**
   * 🔴 **D-11의 화면 도달 지점** (계획서 §4 D-11 · §14 O-3 종결).
   *
   * 부분 혼합(토지 실가 + 건물1 환산)은 **분리 ON에서만** 만들 수 있다 — 파트별 산정방식
   * 라디오가 `GeneralBuildingAcquisitionCards`의 분리 ON 분기에만 있기 때문이다.
   * 그 조합 × 증축에서 양도비가 payload에서 통째로 빠졌다(실측 58,948,319원 과대).
   *
   * 값은 `general-building-extension-transfer-expense.anchor.test.ts`가 고정한다.
   * 여기서는 **그 조합의 입력 화면이 실재하고 계산까지 도달하는지**만 본다 —
   * 입력 경로가 없으면 배관 수정은 no-op이다(메모리 `feedback_api_trigger_without_input_path_is_noop`).
   */
  test("D-11: 분리 ON × 부분 혼합 × 증축 — 파트별 산정방식 + 양도비 칸이 있고 계산에 도달한다", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await seed(page, {
      ...EXT_ACTUAL,
      hasSeperateLandAcquisitionDate: true,
      landAcquisitionDate: "2008-03-01",
      landAcqMode: "actual",
      buildingAcqMode: "estimated",
      landAcquisitionPrice: "500000000",
      // V-8 — 부분 혼합에서 자산 단위 자본적지출은 validate가 막는다. 파트 칸이 정본이다.
      capitalExpenditure: "",
      landDirectExpenses: "100000000",
      buildingDirectExpenses: "200000000",
      transferExpense: "300000000",
    });
    await expandAssetSection(page, 3);
    // 파트별 산정방식 라디오 — 이 조합의 유일한 진입점.
    await expect(page.getByText("토지 취득가액 산정 방식").first()).toBeVisible();
    await expect(page.getByText("건물 취득가액 산정 방식").first()).toBeVisible();

    // 양도비 칸(§97① 나목)이 실재한다 — 배관이 살아도 칸이 없으면 no-op이다.
    await expandAssetSection(page, 4);
    await expect(page.getByText(/양도비 \(원\)/).first()).toBeVisible();

    await calculate(page);
    await expect(page.getByText(/양도소득세 계산 결과|산출세액/).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/일반건물 3-자산 요약/)).toBeVisible();
  });

  /**
   * 🔴 **O-4 — 일부 양도 × 증축**(계획서 §15).
   *
   * 종전에는 두 겹으로 막혀 있었다: ① 일반건물이 `AREA_SCENARIOS_BY_ASSET_KIND` 미등재라
   * `areaScenario`를 `"partial"`로 만들 UI 경로가 없었고, ② 안분 계산기 게이트에
   * `!gbHasExtension`이 있었다(Q-3).
   *
   * 여기서는 **토글이 화면에 있고, 켜면 안분 계산기가 열리며, 계산까지 도달하는지**를 본다.
   * 값·검증은 `gb-partial-transfer-extension.anchor.test.tsx`가 고정한다.
   */
  test("O-4: 일부 양도 × 증축 — 토글 → 안분 계산기 → 계산 도달", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page, {
      ...EXT_ACTUAL,
      areaScenario: "partial",
      // 「구분됨」을 미리 골라 둔다 — 미선택이면 validate가 계산을 막는다(V-9).
      partialAcqDistinct: "yes",
    });

    // ① 기본정보 — 「일부 양도」 토글이 면적 카드에 있다.
    await expandAssetSection(page, 1);
    await expect(page.getByText("일부 양도").first()).toBeVisible();
    await expect(page.getByText("양도분 토지 면적")).toBeVisible();
    // 축 A(면적 입력 방식 Select)는 뜨지 않는다 — 같은 면적을 두 곳에서 받지 않는다.
    await expect(page.getByText("면적 입력 방식")).toHaveCount(0);

    // ③ 취득정보 — 안분 계산기가 증축에서도 열린다.
    await expandAssetSection(page, 3);
    await expect(page.getByText("구분됨").first()).toBeVisible();

    await calculate(page);
    await expect(page.getByText(/양도소득세 계산 결과|산출세액/).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/일반건물 3-자산 요약/)).toBeVisible();
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
