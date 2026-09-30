/**
 * E2E: 일반건물 **건물만 상속** — 건물 피상속인 취득일 입력 (2026-09-30 D3 ·
 * 계획서 `docs/00-pm/zod-engine-required-mismatch.plan.md` §4.1).
 *
 * 종전에는 분리 ON · 토지 매매 · 건물 상속에서 건물의 피상속인 취득일을 받을 **칸이 없었다**
 * (토지 카드의 상속 블록은 토지가 상속일 때만 뜬다) — 상속개시일부터 기산해 단기세율이 됐다.
 *
 *   BD-1. 건물 카드에 「건물 피상속인 취득일」 칸이 뜬다
 *   BD-2. 비우면 ⑧이 막는다(「건물 피상속인 취득일을 입력하세요」)
 *   BD-3. 입력하면 요청 본문 `generalBuildingValuation.buildingDecedentAcquisitionDate`로 실리고 계산이 된다
 *
 * ⚠️ 금액 anchor는 vitest가 담당한다(`__tests__/calc/transfer-gb-building-decedent-date-d3.anchor.test.ts`).
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

function seedForm(over: Record<string, unknown> = {}) {
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1),
            addressJibun: "서울 강남구 테스트동 1-1",
            assetKind: "general_building",
            // 토지 매매(실가) · 건물 상속 — 분리 ON (M-1a: acquisitionDate = 건물 = 상속개시일)
            hasSeperateLandAcquisitionDate: true,
            landAcquisitionDate: "2008-01-01",
            acquisitionDate: "2023-06-01",
            acquisitionCause: "purchase",
            gbBuildingAcquisitionCause: "inheritance",
            landAcqMode: "actual",
            buildingAcqMode: "actual",
            landAcquisitionPrice: "200000000",
            gbBuildingInheritedValue: "90000000",
            gbLandArea: "100",
            gbBuildingArea: "200",
            gbBuildingFootprintArea: "50",
            gbTransferLandPricePerSqm: "2000000",
            gbTransferBuildingValue: "200000000",
            gbAcqLandPricePerSqm: "1000000",
            gbAcqBuildingValue: "100000000",
            gbZoneType: "general_residential",
            // 단건은 자산을 고치는 순간 Step1이 총 양도가액을 자산 양도가액으로 다시 맞춘다(Step1.tsx) — 같은 값을 둔다
            actualSalePrice: "600000000",
            ...over,
          },
        ],
        transferDate: "2024-03-01",
        filingDate: "2024-05-31",
        contractTotalPrice: "600000000",
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

test.describe("일반건물 — 건물만 상속 · 건물 피상속인 취득일 (D3)", () => {
  test("BD-1·BD-2: 칸이 뜨고, 비우면 ⑧이 막는다", async ({ page }) => {
    test.setTimeout(90_000);
    await seed(page);
    await expandAssetSection(page, 3);
    await expect(page.getByText("건물 피상속인 취득일", { exact: true })).toBeVisible();
    await expect(page.getByTestId("gb-building-decedent-acquisition-date")).toBeVisible();

    // 계산을 시도하면 ⑧ 오류가 뜬다(사이드바 단계 이동은 검증하지 않는다 — 「세금 계산하기」가 전 단계를 검증)
    await page.getByRole("button", { name: "가산세", exact: true }).first().click();
    await page.getByRole("button", { name: "세금 계산하기" }).click();
    await expect(page.getByText(/건물 피상속인 취득일을 입력하세요/).first()).toBeVisible({ timeout: 15_000 });
  });

  test("BD-3: 입력한 날짜가 요청 본문으로 실리고 계산된다", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page);
    await expandAssetSection(page, 3);

    const d = page.getByTestId("gb-building-decedent-acquisition-date");
    await d.getByLabel("연도").fill("2000");
    await d.getByLabel("월").fill("01");
    await d.getByLabel("일").fill("01");

    await page.getByRole("button", { name: "가산세", exact: true }).first().click();
    const calcResponse = page.waitForResponse(
      (r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: "세금 계산하기" }).click();
    const resp = await calcResponse;
    expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()}`).toBe(true);

    const sent = resp.request().postDataJSON() as {
      generalBuildingValuation?: { buildingDecedentAcquisitionDate?: string; buildingAcquisitionCause?: string };
    };
    expect(sent.generalBuildingValuation?.buildingAcquisitionCause).toBe("inheritance");
    expect(sent.generalBuildingValuation?.buildingDecedentAcquisitionDate).toBe("2000-01-01");
  });
});
