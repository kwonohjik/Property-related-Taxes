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
          /**
           * ⚠️ 단일 자산 모드의 **양도가액 진실은 자산 필드**다. 폼 전역 `contractTotalPrice`는
           *    `splitMode !== "none"`에서만 입력란이 있고(`Step1.tsx:162`), 단일 모드에서는
           *    `updateAssets`가 `assets[0].actualSalePrice`로부터 **파생**한다(`Step1.tsx:118-120`).
           *    자산 값을 비운 채 폼 값만 시드하면 첫 asset 패치에서 총 양도가액이 지워져
           *    「총 양도가액을 입력하세요」로 막힌다(T4 작성 중 probe로 실측).
           */
          actualSalePrice: "2000000000",
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

  /**
   * T4 — O-1 해소로 새로 열린 흐름. 혼합 모드에서 **파트별 자본적지출** 칸이 보이고,
   * 그 값을 넣어도 계산이 끝까지 간다.
   *
   * 종전에는 이 조합에서 파트 칸이 숨고(`bothPartsActual` 게이트) 자산 단위 칸은 V-8이 막아
   * **자본적지출을 넣을 경로가 아예 없었다**. 금액 단언은 vitest anchor A-16이 담당한다.
   */
  test("T4: 혼합 모드에서 파트별 자본적지출을 입력해 계산까지 간다", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page);
    await expandAssetSection(page, 3);

    // 파트 칸이 열려 있다 — FieldCard 라벨과 CurrencyInput 내부 라벨이 함께 렌더되므로 .first()
    await expect(page.getByText("토지 자본적지출", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("건물 자본적지출", { exact: true }).first()).toBeVisible();

    /**
     * ⚠️ `CurrencyInput`의 내부 `<label>`은 input과 연결돼 있지 않다(`htmlFor`/`id` 없음 — probe 실측).
     *    그래서 `getByRole("textbox", { name })`은 닿지 않는다. FieldCard로 스코프해 잡는다.
     */
    const landCapexCard = page
      .getByText("토지 자본적지출", { exact: true })
      .first()
      .locator("xpath=ancestor::*[@data-slot='field-card'][1]");
    await landCapexCard.locator('input[type="text"]').fill("30,000,000");

    await page.getByRole("button", { name: "가산세", exact: true }).first().click();
    await page.getByRole("button", { name: "세금 계산하기" }).click();
    await page.getByText("신고서 양식", { exact: false }).first().waitFor({ timeout: 30_000 });

    // V-8이 파트별 입력을 막지 않는다(자산 단위 칸 안내 문구가 뜨지 않아야 한다).
    await expect(page.getByText(/토지분·건물분 칸에 각각/)).toHaveCount(0);
    await expect(page.getByText("신고서 양식", { exact: false }).first()).toBeVisible();
  });
});
