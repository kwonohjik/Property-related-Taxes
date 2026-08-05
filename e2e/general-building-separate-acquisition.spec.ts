/**
 * E2E: 일반건물 「토지·건물 취득일 다름」 실플로우 (P7)
 *
 * 계획서: `docs/02-design/features/general-building-part-major-acquisition.plan.md`
 *
 * 종전에는 일반건물이 파트 분리 인프라에서 배제돼(`isSplitable = housing | building`)
 * 토지를 먼저 사고 건물을 나중에 지은 자산을 표현할 수 없었고, 실거래가 모드에서는
 * **건물 취득일이 엔진에 도달조차 하지 않았다**(§1.3 실측 결함).
 *
 * 이 스펙은 UI 조작 → 계산 → 결과까지 한 줄로 검증한다:
 *   T1. 분리 토글 ON → 파트별 취득일·산정방식·취득가액 칸이 열린다
 *   T2. 혼합 모드(토지 실가 + 건물 환산) → 취득시 기준시가 섹션이 **열린다**(dead-end 방지)
 *   T3. 시드 상태에서 계산까지 도달하고 결과가 나온다 (파트 입력이 엔진에 도달)
 *
 * ⚠️ 수치 anchor는 vitest가 담당한다(`general-building-part-acq-modes.anchor.test.ts`).
 *    본 스펙은 **UI 배선**만 본다.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

/** 분리 ON · 토지 실가 + 건물 환산 시드 */
function seedForm() {
  return {
    state: {
      formData: {
        assets: [{
          ...makeDefaultAsset(1),
          assetKind: "general_building",
          acquisitionCause: "purchase",
          gbBuildingAcquisitionCause: "purchase",
          // M-1a 규약 — acquisitionDate = 건물, landAcquisitionDate = 토지
          hasSeperateLandAcquisitionDate: true,
          landAcquisitionDate: "1999-05-24",
          acquisitionDate: "2015-03-01",
          landAcqMode: "actual",
          buildingAcqMode: "estimated",
          landAcquisitionPrice: "300000000",
          gbLandArea: "85",
          gbBuildingArea: "180.96",
          gbBuildingFootprintArea: "90.48",
          gbTransferLandPricePerSqm: "10830000",
          gbTransferBuildingValue: "20629440",
          gbAcqBuildingValue: "2814470",
          gbZoneType: "commercial",
        }],
        transferDate: "2026-02-16",
        filingDate: "2026-04-30",
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

async function seed(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedForm(),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

test.describe("일반건물 — 토지·건물 취득일 다름", () => {
  test("T1: 토글 ON → 파트별 취득일·산정방식 칸이 열린다", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await expandAssetSection(page, 1);
    await page.getByRole("button", { name: /일반건물/ }).first().click();
    await expandAssetSection(page, 3);

    // OFF — 건물 취득일·파트 라디오 없음 (「토지·건물 취득일 다름」 토글 제목에 substring 매칭되므로 exact)
    await expect(page.getByText("건물 취득일", { exact: true })).toHaveCount(0);
    await expect(page.getByText("토지 취득가액 산정 방식")).toHaveCount(0);

    await page.getByText("토지·건물 취득일 다름").first().click();

    // ON — 파트별 칸이 열리고, 자산 단위 「취득가액 산정 방식」은 사라진다
    await expect(page.getByText("건물 취득일", { exact: true })).toBeVisible();
    await expect(page.getByText("토지 취득가액 산정 방식")).toBeVisible();
    await expect(page.getByText("건물 취득가액 산정 방식")).toBeVisible();
    await expect(page.getByText("취득가액 산정 방식", { exact: true })).toHaveCount(0);
  });

  test("T2: 혼합 모드 — 취득시 기준시가 섹션이 열린다 (dead-end 방지)", async ({ page }) => {
    test.setTimeout(90_000);
    await seed(page);
    await expandAssetSection(page, 3);

    // 토지 실가 + 건물 환산 → 자산 단위 플래그는 실가지만 섹션은 열려야 한다.
    // 닫히면 validate가 건물 기준시가를 요구하는데 입력 칸이 없다(계획서 P6 dead-end).
    const acqBox = page.locator('[data-gb-stdprice="acq"]').first();
    await expect(acqBox).toBeVisible();
    await expect(page.getByText("취득시 건물기준시가").first()).toBeVisible();
  });

  test("T3: 분리 입력이 엔진까지 도달해 결과가 산출된다", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page);
    await page.getByRole("button", { name: "가산세", exact: true }).first().click();
    await page.getByRole("button", { name: "세금 계산하기" }).click();
    await page.getByText("신고서 양식", { exact: false }).first().waitFor({ timeout: 30_000 });

    /**
     * 파트 입력이 엔진에 도달했다는 증거:
     *   · validate가 「토지 취득가액을 입력하세요」로 막지 않았다(V-7)
     *   · 엔진이 던지지 않고 신고서 양식까지 렌더됐다
     * ⚠️ 「총 납부세액」은 인쇄용 요약 카드(hidden)와 중복돼 `.first()`가 보이지 않는다
     *    (e2e/CLAUDE.md §3) — 금액 단언은 vitest anchor가 담당한다.
     */
    await expect(page.getByText(/취득가액을 입력하세요/)).toHaveCount(0);
    await expect(page.getByText("신고서 양식", { exact: false }).first()).toBeVisible();
  });
});
