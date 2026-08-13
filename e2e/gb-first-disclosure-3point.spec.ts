/**
 * E2E: §99-164-10 최초공시 3시점 통합 — 화면 실측
 *
 * 계획서: `docs/02-design/features/gb-first-disclosure-3point-integration.plan.md`
 *
 * ① 기본정보에 흩어져 있던 「주택으로 최초공시 후 상가로 용도변경」 3필드를 ③ 취득정보의
 * ① 토지 공시지가 · ② 건물 기준시가로 통합해 **3시점**(취득·최초공시·양도)으로 만들었다.
 *
 * 수치·게이트 anchor는 vitest가 담당한다:
 *   `__tests__/calc/gb-first-disclosure*.test.ts` · `__tests__/components/gb-first-disclosure-placement.anchor.test.tsx`
 * 이 스펙은 **실제 브라우저에서 그 화면이 그렇게 뜨고 계산이 도는지**만 본다.
 *
 * ⚠️ 종전 최초공시 관련 E2E는 **0건이었다**(2026-08-13 grep 실측). 이 파일이 첫 커버리지다.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

const TOGGLE_TITLE = "주택으로 최초공시 후 상가로 용도변경 (환산취득가)";

/** 일반건물 · 환산취득가 · 주택→상가 용도변경 시나리오 */
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
            acquisitionDate: "2003-05-10",
            useEstimatedAcquisition: true,
            landAcqMode: "estimated",
            buildingAcqMode: "estimated",
            gbLandArea: "160",
            gbBuildingArea: "200",
            gbBuildingFootprintArea: "100",
            gbAcqLandPricePerSqm: "3560000",
            gbAcqBuildingValue: "36696000",
            gbTransferLandPricePerSqm: "4200000",
            gbTransferBuildingValue: "42680000",
            gbZoneType: "commercial",
            actualSalePrice: "2000000000",
            // 주택 → 상가 용도변경 (LTHD 기산일 축)
            gbHouseToCommercialConversion: true,
            gbConversionDate: "2010-08-07",
            gbWasMultiHouseAtConversion: false,
            ...over,
          },
        ],
        transferDate: "2024-03-01",
        filingDate: "2024-05-31",
        contractTotalPrice: "2000000000",
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

async function openAcquisitionSection(page: Page, over: Record<string, unknown> = {}) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedForm(over),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await expandAssetSection(page, 3);
}

test.describe("GB-FD 통합 화면", () => {
  test("GB-FD-1: 토글이 ③ 취득정보에 있고 ① 기본정보에는 안내만 남는다", async ({ page }) => {
    await openAcquisitionSection(page);

    // ③ 취득정보에 토글이 있다.
    await expect(page.getByText(TOGGLE_TITLE)).toBeVisible();

    // ① 기본정보에는 입력 칸 대신 위치 안내가 남았다.
    await expandAssetSection(page, 1);
    await expect(
      page.getByText(/환산주택가격\(§99-164-10\) 입력은.*③ 취득정보/),
    ).toBeVisible();
  });

  test("GB-FD-2: 토글을 켜면 ①②에 최초공시시 박스가 나타난다 (3시점)", async ({ page }) => {
    await openAcquisitionSection(page, {
      gbHasFirstDisclosure: true,
      gbFirstDisclosureDate: "2005-04-30",
    });

    // 토지·건물 두 그룹에 최초공시 박스가 하나씩.
    await expect(page.locator('[data-gb-stdprice="first"]')).toHaveCount(2);
    await expect(page.getByText("최초공시시 토지 공시지가")).toBeVisible();
    await expect(page.getByText("최초공시시 건물 기준시가").first()).toBeVisible();
  });

  test("GB-FD-3: 토지 공시지가 단가를 넣으면 토지기준시가가 자동 계산된다", async ({ page }) => {
    await openAcquisitionSection(page, {
      gbHasFirstDisclosure: true,
      gbFirstDisclosureDate: "2005-04-30",
    });

    await page.getByTestId("gb-first-land-price").fill("2000000");
    // 2,000,000원/㎡ × 160㎡ = 320,000,000
    await expect(page.getByTestId("gb-first-land-std")).toContainText("320,000,000");
  });

  test("GB-FD-4: 환산주택가격 미리보기가 집행기준 산식대로 표시된다", async ({ page }) => {
    await openAcquisitionSection(page, {
      gbHasFirstDisclosure: true,
      gbFirstDisclosureDate: "2005-04-30",
      gbFirstDisclosurePrice: "300000000",
      gbFirstDisclosureLandPricePerSqm: "2000000",
      gbFirstDisclosureBuildingStdPrice: "30000000",
    });

    /**
     * 취득당시 = 3,560,000 × 160 + 36,696,000 = 606,296,000
     * 최초공시 = 2,000,000 × 160 + 30,000,000 = 350,000,000
     * 환산주택가격 = floor(300,000,000 × 606,296,000 ÷ 350,000,000) = 519,682,285
     */
    await expect(page.getByText(/환산주택가격 = 519,682,285 원/)).toBeVisible();
    await expect(page.getByText(/근거: 양도소득세 집행기준 99-164-10/)).toBeVisible();
  });

  test("GB-FD-5: 실거래가로 바꾸면 토글과 최초공시 칸이 함께 사라진다", async ({ page }) => {
    // stale 플래그가 남은 상태 — 종전에는 「끄는 UI 없이 계산이 차단」됐다(D-1).
    await openAcquisitionSection(page, {
      gbHasFirstDisclosure: true,
      gbFirstDisclosureDate: "2005-04-30",
      useEstimatedAcquisition: false,
      landAcqMode: "actual",
      buildingAcqMode: "actual",
    });

    await expect(page.getByText(TOGGLE_TITLE)).toHaveCount(0);
    await expect(page.locator('[data-gb-stdprice="first"]')).toHaveCount(0);
  });

  test("GB-FD-6: 일괄 계산 런처가 3시점으로 열린다", async ({ page }) => {
    await openAcquisitionSection(page, {
      gbHasFirstDisclosure: true,
      gbFirstDisclosureDate: "2005-04-30",
    });

    await page.getByTestId("gb-building-std-batch-open").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // 시점 라벨 3종이 모두 보인다.
    await expect(dialog.getByText("취득시").first()).toBeVisible();
    await expect(dialog.getByText("최초공시시").first()).toBeVisible();
    await expect(dialog.getByText("양도시").first()).toBeVisible();
  });

  test("GB-FD-7: 3시점 입력으로 계산이 끝까지 돈다", async ({ page }) => {
    test.setTimeout(60_000);
    // 화면 조작 없이 시드만으로 곧장 계산까지 — 다른 GB spec과 같은 관행.
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await page.evaluate(
      (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
      seedForm({
        gbHasFirstDisclosure: true,
        gbFirstDisclosureDate: "2005-04-30",
        gbFirstDisclosurePrice: "300000000",
        gbFirstDisclosureLandPricePerSqm: "2000000",
        gbFirstDisclosureBuildingStdPrice: "30000000",
      }),
    );
    await page.reload();
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await page.getByRole("button", { name: "가산세", exact: true }).first().click();
    await page.getByRole("button", { name: "세금 계산하기" }).click();

    // 결과 화면 도달 = 3시점 입력이 Zod·엔진을 통과했다는 뜻.
    await page
      .getByText("신고서 양식", { exact: false })
      .first()
      .waitFor({ timeout: 30_000 });
  });

  test("GB-FD-8: 결과 화면에 환산주택가격 산정 근거가 표시된다", async ({ page }) => {
    test.setTimeout(60_000);
    /**
     * 🔴 **이 테스트가 잡는 것**: 일반건물은 aggregate 경로라
     * `GeneralBuildingValuationDetailCard`(TransferTaxResultView 전용)가 **렌더되지 않는다**.
     * 그쪽에만 배선하면 계산에는 반영되고 화면에는 안 보인다 — 이 저장소에서 2회 재발한 함정이라
     * 「엔진에 값이 있다」가 아니라 **「화면에 보인다」**를 단언한다.
     */
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await page.evaluate(
      (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
      seedForm({
        gbHasFirstDisclosure: true,
        gbFirstDisclosureDate: "2005-04-30",
        gbFirstDisclosurePrice: "300000000",
        gbFirstDisclosureLandPricePerSqm: "2000000",
        gbFirstDisclosureBuildingStdPrice: "30000000",
      }),
    );
    await page.reload();
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await page.getByRole("button", { name: "가산세", exact: true }).first().click();
    await page.getByRole("button", { name: "세금 계산하기" }).click();
    await page
      .getByText("신고서 양식", { exact: false })
      .first()
      .waitFor({ timeout: 30_000 });

    // 산정 근거 카드 — GB-FD-4 미리보기와 **같은 값**이어야 한다(입력 화면 ↔ 결과 화면 일치).
    const card = page.getByText("환산주택가격 — 양도소득세 집행기준 99-164-10").locator("..");
    await expect(card).toBeVisible();
    // 환산주택가격 519,682,285 = 300,000,000 × 606,296,000 ÷ 350,000,000
    await expect(card).toContainText("519,682,285");
    await expect(card).toContainText("606,296,000"); // 취득 당시 합계
    await expect(card).toContainText("350,000,000"); // 최초공시 당시 합계
  });
});
