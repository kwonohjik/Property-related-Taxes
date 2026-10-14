/**
 * E2E: 부담부증여 × 지분 분할 취득(축 B) × 취득가액 「감정가액·매매사례가액」
 *
 * 매매사례가액·감정가액은 「취득일 전후 각 3개월」 값(소령 §176의2③)이라 지분마다 취득일이 다르면 값이 다르다.
 * 그래서 **지분 카드마다** 자기 취득일 기준의 물건 전체 값을 입력하고 엔진이 지분율을 곱해 합산한다(사용자 결정 2026-10-14).
 *
 * 픽스처: 시가 10억 · 채무 6억(채무비율 0.6) · 지분 60%(2009-03-01, 그때 물건 전체 감정가액 4억·취득시 기준시가 2억) +
 *   40%(2012-03-01, 5억·3억)
 *   지분1 양도차익 = 360M − 4억×0.6×0.6(144M) − 개산공제 2,160,000 = 213,840,000
 *   지분2 양도차익 = 240M − 5억×0.4×0.6(120M) − 개산공제 2,160,000 = 117,840,000
 *
 *   AB-1. 두 옵션이 활성이고, 지분 카드(자산 2)에 「이 지분의 감정가액」·「취득시 기준시가」 칸이 뜬다
 *   AB-2. 자산 2 값을 화면에서 입력 → 계산 → 지분별 양도차익이 위 값이다(입력 경로 + 합산)
 *   AB-3. 자산 2 감정가액을 비우면 그 칸으로 막힌다
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

const tranche = (id: number, num: string, acq: string, over: Record<string, unknown> = {}) => ({
  ...makeDefaultAsset(id),
  addressJibun: "서울 강남구 테스트동 1-1",
  assetKind: "housing",
  acquisitionCause: "purchase",
  acquisitionDate: acq,
  ownershipNumerator: num,
  ownershipDenominator: "100",
  transferType: "burdened_gift",
  bgValuationMode: "sangjeungbeop_market",
  bgMarketValueAtTransfer: "1000000000",
  bgMortgageDebtAmount: "600000000",
  bgDonorRelation: "lineal_descendant",
  bgAcquisitionMethod: "appraisal",
  standardPriceAtTransfer: "1000000001",
  ...over,
});

async function seedAndOpen(page: Page, assets: unknown[]) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    {
      state: {
        formData: {
          assets,
          transferDate: "2024-03-01",
          filingDate: "2024-05-31",
          contractTotalPrice: "1000000000",
          householdHousingCount: "2",
          isOneHousehold: false,
          isRegulatedArea: false,
          wasRegulatedAtAcquisition: false,
          isUnregistered: false,
          householdNoOtherHousesConfirmed: true,
          householdNoPresaleRightsConfirmed: true,
        },
        pendingMigration: false,
      },
      version: 0,
    },
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

const primary = () => tranche(1, "60", "2009-03-01", { bgPresumedAcquisitionTotal: "400000000", standardPriceAtAcq: "200000000" });
const companion = (over: Record<string, unknown> = {}) => tranche(2, "40", "2012-03-01", over);

async function gotoLastStep(page: Page) {
  for (const step of ["보유 상황", "감면·공제", "가산세"]) {
    await page.getByRole("button", { name: step }).first().click();
  }
}

test.describe("부담부증여 × 지분 분할 취득(축 B) × 감정가액·매매사례가액", () => {
  test("AB-1: 두 옵션이 활성이고 지분 카드에 이 지분의 감정가액·취득시 기준시가 칸이 뜬다", async ({ page }) => {
    test.setTimeout(90_000);
    await seedAndOpen(page, [primary(), companion()]);
    const first = page.locator('[data-asset-card-index="0"]');
    await expandAssetSection(page, 2);
    await expect(first.getByRole("radio", { name: /감정가액/ })).toBeEnabled();
    await expect(first.getByRole("radio", { name: /매매사례가액/ })).toBeEnabled();
    await expect(first.getByTestId("bg-presumed-fractional-note")).toContainText("이 지분의 취득일 전후 각 3개월");

    const second = page.locator('[data-asset-card-index="1"]');
    await expect(second.getByTestId("bg-tranche-basis")).toBeVisible();
    await expect(second.locator('[data-field="bgPresumedAcquisitionTotal"]')).toBeVisible();
    await expect(second.locator('[data-field="standardPriceAtAcq"]')).toBeVisible();
    await expect(second.getByTestId("bg-presumed-fractional-note")).toBeVisible();
  });

  test("AB-2: 자산 2 값을 화면에서 입력 → 계산 → 지분별 양도차익 213,840,000 / 117,840,000", async ({ page }) => {
    test.setTimeout(120_000);
    await seedAndOpen(page, [primary(), companion()]);
    const second = page.locator('[data-asset-card-index="1"]');
    const input = (field: string) => second.locator(`[data-field="${field}"] input, input[data-field="${field}"]`).first();
    await input("bgPresumedAcquisitionTotal").fill("500000000");
    await input("standardPriceAtAcq").fill("300000000");

    await gotoLastStep(page);
    const rp = page.waitForResponse(
      (r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: /계산하기/ }).click();
    const resp = await rp;
    expect(resp.status(), await resp.text()).toBe(200);
    const body = await resp.json();
    expect(body.data.mode).toBe("bundled");
    const gains = (body.data.aggregated.properties as { transferGain: number }[]).map((p) => p.transferGain);
    expect(gains).toEqual([213_840_000, 117_840_000]);
  });

  test("AB-3: 자산 2 감정가액을 비우면 그 지분 카드에서 막힌다", async ({ page }) => {
    test.setTimeout(120_000);
    await seedAndOpen(page, [primary(), companion({ standardPriceAtAcq: "300000000" })]);
    await gotoLastStep(page);
    await page.getByRole("button", { name: /계산하기/ }).click();
    await expect(page.getByText(/자산 2: 부담부증여 감정가액 — 취득 당시 감정가액을 입력하세요/).first()).toBeVisible({ timeout: 20_000 });
  });

  test("AB-4: 같은 블록이 기준시가 모드 지분 카드의 막다른 오류(취득시 기준시가 입력 경로 없음)도 푼다", async ({ page }) => {
    test.setTimeout(90_000);
    const std = { bgValuationMode: "sangjeungbeop_standard", bgAcquisitionMethod: "", bgMarketValueAtTransfer: "" };
    await seedAndOpen(page, [tranche(1, "60", "2009-03-01", { ...std, standardPriceAtAcq: "500000001" }), tranche(2, "40", "2012-03-01", std)]);
    const second = page.locator('[data-asset-card-index="1"]');
    await expect(second.getByTestId("bg-tranche-basis")).toBeVisible();
    await expect(second.locator('[data-field="standardPriceAtAcq"]')).toBeVisible();
    // 감정가액 칸은 없다(기준시가 모드)
    await expect(second.locator('[data-field="bgPresumedAcquisitionTotal"]')).toHaveCount(0);
  });
});
