/**
 * E2E: F-7 · 컴패니언 일반건물의 미등기(§104③)는 **토지·건물 2축** 토글로 받는다.
 *
 * 종전에는 단일 「미등기 양도」 토글을 띄웠는데 route GB 분기가 그 값을 읽지 않아 켜도 세액이
 * 같았다(184,140,000). 유닛 anchor(`__tests__/api/transfer.route.companion-gb-unregistered-f7.anchor.test.ts`)는
 * ④ 이후를 보고, 여기서는 **화면 토글 → 요청 body → 응답**을 본다.
 *
 * 실행: E2E_PORT=<worktree 포트> npx playwright test e2e/transfer-companion-gb-unregistered-f7.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

const GB = {
  assetKind: "general_building",
  acquisitionCause: "purchase",
  gbBuildingAcquisitionCause: "purchase",
  acquisitionDate: "2015-03-01",
  useEstimatedAcquisition: true,
  landAcqMode: "estimated",
  buildingAcqMode: "estimated",
  gbLandArea: "200",
  gbBuildingFootprintArea: "100",
  gbZoneType: "commercial",
  gbBuildingArea: "300",
  gbTransferLandPricePerSqm: "1500000",
  gbTransferBuildingValue: "200000000",
  gbAcqLandPricePerSqm: "750000",
  gbAcqBuildingValue: "100000000",
};

function assets(companionOver: Record<string, unknown> = {}) {
  return [
    {
      ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1",
      assetKind: "housing",
      acquisitionCause: "purchase",
      acquisitionDate: "2015-03-01",
      useEstimatedAcquisition: false,
      fixedAcquisitionPrice: "300000000",
      actualSalePrice: "600000000",
      standardPriceAtTransfer: "500000000",
      standardPriceAtAcq: "250000000",
    },
    {
      ...makeDefaultAsset(2), addressJibun: "서울 강남구 테스트동 2-1",
      ...GB,
      standardPriceAtTransfer: "500000000",
      actualSalePrice: "600000000",
      ...companionOver,
    },
  ];
}

async function seedAndOpen(page: Page, list: Record<string, unknown>[]) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    {
      state: {
        formData: {
          assets: list,
          transferDate: "2024-06-01",
          filingDate: "2024-08-31",
          contractTotalPrice: "1200000000",
          householdHousingCount: "2",
          isOneHousehold: false,
          isRegulatedArea: false,
          wasRegulatedAtAcquisition: false,
          isUnregistered: false,
          houses: [],
          presaleRights: [],
        },
        pendingMigration: false,
      },
      version: 0,
    },
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

async function calculate(page: Page) {
  for (const step of ["보유 상황", "감면·공제", "가산세"]) {
    await page.getByRole("button", { name: step }).first().click();
  }
  const resp = page.waitForResponse(
    (r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: /계산하기/ }).click();
  return resp;
}

type Sent = {
  companionAssets?: {
    isUnregistered?: boolean;
    generalBuildingValuation?: { unregisteredLand?: boolean; unregisteredBuilding?: boolean };
  }[];
};
type Prop = { propertyId: string; appliedRate: number };

test.describe("F-7 컴패니언 일반건물 미등기 2축", () => {
  test("토지 토글 → 토지 카드만 70%", async ({ page }) => {
    test.setTimeout(90_000);
    await seedAndOpen(page, assets());
    await expandAssetSection(page, 1, 1);

    const card = page.locator('[data-asset-card-index="1"]');
    // 단일 토글은 없다 — exact로 「토지 미등기 양도」와 구별한다.
    await expect(card.getByRole("switch", { name: "미등기 양도", exact: true })).toHaveCount(0);
    await card.getByRole("switch", { name: "토지 미등기 양도" }).click();

    const resp = await calculate(page);
    expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()}`).toBe(true);
    const gbv = (resp.request().postDataJSON() as Sent).companionAssets?.[0].generalBuildingValuation;
    expect(gbv?.unregisteredLand).toBe(true);
    expect(gbv?.unregisteredBuilding).toBe(false);

    const props = (await resp.json()).data.aggregated.properties as Prop[];
    const byBase = (b: string) => props.find((p) => p.propertyId.split("#")[0] === b);
    expect(byBase("land")?.appliedRate).toBe(0.7);
    expect(byBase("building")?.appliedRate).toBe(0.35);
  });

  test("옛 단일 값 — 안내 카드에서 옮기면 두 파트 모두 70%로 계산된다", async ({ page }) => {
    test.setTimeout(90_000);
    await seedAndOpen(page, assets({ isUnregistered: true }));
    await expandAssetSection(page, 1, 1);

    const card = page.locator('[data-asset-card-index="1"]');
    await expect(card.getByText("이전에 저장된 「미등기 양도」 값이 계산에 반영되지 않았습니다")).toBeVisible();
    await card.getByRole("button", { name: "토지·건물 모두 미등기로 옮기기" }).click();
    await expect(card.getByText("이전에 저장된 「미등기 양도」 값이 계산에 반영되지 않았습니다")).toHaveCount(0);

    const resp = await calculate(page);
    expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()}`).toBe(true);
    const sent = (resp.request().postDataJSON() as Sent).companionAssets?.[0];
    expect(sent?.isUnregistered).toBe(false);
    expect(sent?.generalBuildingValuation?.unregisteredLand).toBe(true);
    expect(sent?.generalBuildingValuation?.unregisteredBuilding).toBe(true);
    expect((await resp.json()).data.aggregated.totalTax).toBe(310_271_500);
  });
});
