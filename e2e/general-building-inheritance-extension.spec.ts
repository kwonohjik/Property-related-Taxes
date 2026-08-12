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
 *   X-1. 상속 취득 → 「증축한 부분이 있음」 토글이 **보인다**
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
  test("X-1: 상속 취득이면 「증축한 부분이 있음」 토글이 보인다", async ({ page }) => {
    test.setTimeout(90_000);
    await seed(page);
    await expandAssetSection(page, 3);

    await expect(page.getByText("증축한 부분이 있음").first()).toBeVisible();
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

    await expect(page.getByText("증축한 부분이 있음").first()).toBeVisible();
  });

  /**
   * 🔄 **주장이 뒤집혔다** (2026-08-12 — 값이 아니라 명제를 고쳤다).
   *
   * 종전: 「매매 + 실가 모드는 종전대로 **안 보인다** (회귀 0)」.
   * 그때는 매매 × 실거래가에서 증축을 켜는 진입점이 상단 라디오
   * 「토지·건물 일괄 (증축분 별도)」였기 때문에 토글을 낼 이유가 없었다.
   *
   * 그 라디오를 **제거했으므로**(원건물 축과 증축 축 분리 — 사용자 결정) 이 토글이
   * **유일한 진입점**이 됐다. 종전 게이트를 그대로 뒀다면 매매 × 실가 × 분리 OFF에서
   * 증축이 dead-end가 된다(`feedback_ui_gate_removes_sole_input_path`).
   *
   * ⇒ 증축 유무는 **물건의 사실**이지 취득가액 산정 방식의 함수가 아니므로 항상 묻는다.
   * 계획서: `docs/02-design/features/transfer-gb-extension-4mode-matrix.plan.md` §6 Q-1
   */
  test("X-2: 매매 + 실가 모드에서도 보인다 (3번째 라디오 제거로 유일 진입점이 됐다)", async ({
    page,
  }) => {
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

    await expect(page.getByText("증축한 부분이 있음").first()).toBeVisible();
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

/**
 * ── Phase 2 (2026-08-08) — **분리 ON × 증축** ────────────────────────────────
 *
 * V-3(증축 × 분리 ON 차단)을 풀었다. 실제 갭은 3-way가 `landAcquisitionDate`를 읽지 않아
 * 토지 보유기간이 건물 취득일로 계산된 것 하나였다(장특공제 실측 245,587,665 → 81,999,999).
 *
 * 이 해제가 **부분 상속·증여 × 증축**의 유일한 경로다 — 부분 상속은 V-5가 분리 ON을
 * 요구하므로, V-3이 살아 있는 동안에는 두 규칙이 정면 충돌하는 dead-end였다.
 */
function seedSeparate(over: Record<string, unknown> = {}) {
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1),
            assetKind: "general_building",
            acquisitionCause: "purchase",
            gbBuildingAcquisitionCause: "purchase",
            hasSeperateLandAcquisitionDate: true,
            landAcquisitionDate: "1995-05-01",
            acquisitionDate: "2020-05-01",
            landAcqMode: "actual",
            buildingAcqMode: "actual",
            landAcquisitionPrice: "500000000",
            buildingAcquisitionPrice: "300000000",
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

/** 분리 ON 시드는 건물 취득일이 2020이므로 증축일도 그 뒤여야 한다(「증축일 ≥ 늦은 취득일」 검증). */
const EXTENSION_FIELDS_2022 = { ...EXTENSION_FIELDS, gbExtensionDate: "2022-06-01" };

async function seedSep(page: Page, over: Record<string, unknown> = {}) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedSeparate(over),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

test.describe("일반건물 분리 ON × 증축 — Phase 2", () => {
  test("X-4: 분리 ON이면 「증축한 부분이 있음」 토글이 보인다 (종전 V-3 차단으로 낼 이유가 없었다)", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await seedSep(page);
    await expandAssetSection(page, 3);

    await expect(page.getByText("증축한 부분이 있음").first()).toBeVisible();
  });

  test("X-5: 분리 ON + 증축이 계산까지 도달한다", async ({ page }) => {
    test.setTimeout(120_000);
    await seedSep(page, EXTENSION_FIELDS_2022);
    await page.getByRole("button", { name: "가산세", exact: true }).first().click();
    await page.getByRole("button", { name: "세금 계산하기" }).click();

    await expect(
      page.getByText(/증축\(건물2\)과 「토지·건물 취득일 다름」은 함께 지원하지 않습니다/),
    ).toHaveCount(0);
    await expect(page.getByText(/양도소득세 계산 결과|산출세액/).first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test("X-6: 부분 상속(토지만) + 증축 — Phase 2의 목표 조합이 계산까지 간다", async ({ page }) => {
    test.setTimeout(120_000);
    await seedSep(page, {
      ...EXTENSION_FIELDS_2022,
      acquisitionCause: "inheritance",
      decedentAcquisitionDate: "1990-01-01",
      publishedValueAtInheritance: "500000000",
    });
    await page.getByRole("button", { name: "가산세", exact: true }).first().click();
    await page.getByRole("button", { name: "세금 계산하기" }).click();

    // 두 차단(V-3·V-5)이 모두 뜨지 않는다 — dead-end 해소.
    await expect(page.getByText(/함께 지원하지 않습니다/)).toHaveCount(0);
    await expect(page.getByText(/한쪽만 상속으로 취득했다면/)).toHaveCount(0);
    await expect(page.getByText(/양도소득세 계산 결과|산출세액/).first()).toBeVisible({
      timeout: 30_000,
    });
  });
});
