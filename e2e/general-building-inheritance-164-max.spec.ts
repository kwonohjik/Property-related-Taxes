/**
 * E2E: 일반건물 상속 — 미공시 시기 §164 max (「소득세법 시행령」 제163조 제9항 제1호·제2호)
 *
 * 계획서: `docs/02-design/features/transfer-gb-inheritance-164-max-phase3.plan.md`
 *
 * 종전에는 상속 파트의 취득가액이 상증법 평가액 그대로였고, **취득시 기준시가를 비워도
 * validate가 통과**했다(② 비교값 미수집). 평가액이 §164 가액보다 작으면 조용히 과대과세
 * 됐다(실측 86,265,000원).
 *
 *   S-1. 1990.8.30. 이전 상속 토지 → §164④ 등급환산 섹션이 **열린다**(입력 경로 존재)
 *   S-2. ② 비교값 미입력 → 차단 문구가 뜬다
 *   S-3. 등급을 채우면 계산까지 도달한다 (파생값이 ②로 쓰인다)
 *
 * ⚠️ 금액 anchor는 vitest가 담당한다
 *    (`__tests__/tax-engine/transfer-tax/gb-inheritance-164-max.anchor.test.ts`).
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

/** 상속개시일 1988 — 토지 <1990-08-30 · 건물 취득연도 ≤2000 둘 다 게이트 안 */
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
            landAcquisitionDate: "1988-05-01",
            acquisitionDate: "1988-05-01",
            decedentAcquisitionDate: "1970-01-01",
            landAcqMode: "actual",
            buildingAcqMode: "actual",
            publishedValueAtInheritance: "50000000",
            gbBuildingInheritedValue: "20000000",
            gbAcqLandPricePerSqm: "1000000",
            gbAcqBuildingValue: "150000000",
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

test.describe("일반건물 상속 — 미공시 시기 §164 max", () => {
  test("S-1: 1990.8.30. 이전 상속 토지 → §164④ 등급환산 섹션이 열린다", async ({ page }) => {
    test.setTimeout(90_000);
    await seed(page);
    await expandAssetSection(page, 3);

    await expect(
      page.getByText(/1990\.8\.30\. 이전 상속 토지 — §164④ 등급환산/).first(),
    ).toBeVisible();
    await expect(page.getByText(/많은 금액.*이 토지 취득가액/).first()).toBeVisible();
  });

  test("S-1b: 게이트 밖(1995년 상속)이면 섹션이 뜨지 않는다", async ({ page }) => {
    test.setTimeout(90_000);
    await seed(page, {
      landAcquisitionDate: "1995-05-01",
      acquisitionDate: "1995-05-01",
    });
    await expandAssetSection(page, 3);

    await expect(page.getByText(/§164④ 등급환산/)).toHaveCount(0);
  });

  test("S-2: ② 비교값 미입력 → 차단 문구", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page, { gbAcqLandPricePerSqm: "", gbAcqBuildingValue: "" });
    await page.getByRole("button", { name: "가산세", exact: true }).first().click();
    await page.getByRole("button", { name: "세금 계산하기" }).click();

    await expect(
      page.getByText(/개별공시지가 고시 전 상속 토지는/).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("S-3: ② 비교값이 있으면 계산까지 도달한다", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page);
    await page.getByRole("button", { name: "가산세", exact: true }).first().click();
    await page.getByRole("button", { name: "세금 계산하기" }).click();
    await page.getByText("신고서 양식", { exact: false }).first().waitFor({ timeout: 30_000 });

    await expect(page.getByText(/입력하세요/)).toHaveCount(0);
    // §163⑨ 표시 블록이 뜬다(Phase 2에서 추가한 파트별 블록)
    await expect(
      page.getByText("상속 취득가액 직접 산정 — 소득세법 시행령 §163⑨").first(),
    ).toBeVisible();
  });
});
