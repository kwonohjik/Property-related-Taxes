/**
 * E2E: 일반건물 의제취득일(1985.1.1.) 전 상속 — 취득가액 ①②③ 중 큰 금액 (PR-4)
 *
 * 계획서: `docs/02-design/features/inheritance-pre-deemed-clause-b-revisit.plan.md` §15
 *
 *   P-1. 입력 화면에 의제취득일 안내(토지 등급 카드 · 건물 취득시 기준시가 hint)가 뜬다
 *   P-2. 계산 요청 body에 ①②가 따로 실리고, 결과에 파트별 ①②③ 블록이 ③ 채택으로 뜬다
 *
 * 시료는 `general-building-inheritance-164-max.spec.ts`와 같고 상속개시일만 1980이다(그 spec이 화면 입력 경로를 보였다).
 * ⚠️ 금액 anchor는 vitest가 담당한다(`__tests__/tax-engine/transfer-tax/gb-pre-deemed-3way-max.anchor.test.ts`).
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

function seedForm() {
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1",
            assetKind: "general_building",
            acquisitionCause: "inheritance",
            gbBuildingAcquisitionCause: "inheritance",
            hasSeperateLandAcquisitionDate: false,
            landAcquisitionDate: "1980-05-01",
            acquisitionDate: "1980-05-01",
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

async function seed(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), seedForm());
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

test.describe("일반건물 의제취득일 전 상속 — ①②③ 중 큰 금액", () => {
  test("P-1: 입력 화면 — 의제취득일 안내", async ({ page }) => {
    test.setTimeout(90_000);
    await seed(page);
    await expandAssetSection(page, 3);
    await expect(page.getByTestId("gb-pre-deemed-land-note")).toBeVisible();
    await expect(page.getByText(/의제취득일\(1985\.1\.1\.\) 기준 건물기준시가 총액/).first()).toBeVisible();
  });

  test("P-2: body에 ①② · 결과에 ③ 채택", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page);
    await page.getByRole("button", { name: "가산세", exact: true }).first().click();
    const reqP = page.waitForRequest((r) => r.url().includes("/api/calc/transfer") && r.method() === "POST");
    await page.getByRole("button", { name: "세금 계산하기" }).click();
    const body = (await reqP).postDataJSON() as { generalBuildingValuation: Record<string, unknown> };
    expect(body.generalBuildingValuation.landPreDeemedClauseA).toEqual({ reported: 50_000_000, sec164: 205_000_000 });
    expect(body.generalBuildingValuation.buildingPreDeemedClauseA).toEqual({ reported: 20_000_000, sec164: 150_000_000 });

    const block = page.getByTestId("gb-pre-deemed-acquisition");
    await expect(block).toBeVisible({ timeout: 30_000 });
    const land = page.getByTestId("gb-pre-deemed-land");
    await expect(land).toContainText("239,016,745");
    await expect(land.getByText("(미적용)")).toHaveCount(2);
    await expect(page.getByTestId("gb-pre-deemed-building")).toContainText("174,890,301");
    // §163⑨ 블록의 파트 라벨이 엔진 채택을 따른다
    await expect(page.getByText("(환산취득가액)").first()).toBeVisible();
  });
});
