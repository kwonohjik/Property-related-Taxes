/**
 * E2E: 일반건물 매매 — 1985.1.1. 전 토지 취득일 덮어쓰기가 날짜 키를 지킨다 (PR-2 회귀 · PR-3a)
 * 계획서 `docs/02-design/features/realestate-pre-deemed-purchase-176-2-4.plan.md` §12.
 *
 *   PD-GB1. 분리 ON · 토지 1984-06-01 · 건물 1995-03-01 → 토지 칸 blur → 토지 1985-01-01 · 건물 1995-03-01 그대로
 *   PD-GB2. 분리 OFF · 1984-06-01 → blur → 저장값 토지·건물 둘 다 1985-01-01(불변식 land = acq)
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

const GB = (over: Record<string, unknown>) => ({
  ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 9-1", assetKind: "general_building",
  acquisitionCause: "purchase", gbBuildingAcquisitionCause: "purchase", transferType: "regular",
  actualSalePrice: "1,000,000,000", fixedSalePrice: "1,000,000,000", ...over,
});

async function seed(page: Page, assets: unknown[]) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), {
    state: { formData: { assets, transferDate: "2026-02-16", filingDate: "2026-04-30" }, pendingMigration: false },
    version: 0,
  });
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

const stored = (page: Page) =>
  page.evaluate(() => {
    const a = JSON.parse(sessionStorage.getItem("transfer-tax-wizard") ?? "{}").state.formData.assets[0];
    return `${a.acquisitionDate}|${a.landAcquisitionDate}`;
  });

async function blurLandDate(page: Page) {
  await expandAssetSection(page, 3);
  await page.getByTestId("acq-date-building").locator("input").first().focus();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).click(); // 날짜 위젯 밖으로 — blur 덮어쓰기
  await expect(page.getByText("1985.1.1. 의제 취득일로 취득일 변경했습니다.")).toBeVisible();
}

test("PD-GB1: 분리 ON — 토지만 1985-01-01 · 건물 1995-03-01 유지", async ({ page }) => {
  test.setTimeout(180_000);
  await seed(page, [GB({ hasSeperateLandAcquisitionDate: true, acquisitionDate: "1995-03-01", landAcquisitionDate: "1984-06-01" })]);
  await blurLandDate(page);
  await expect(page.locator('[data-field="acquisitionDate"]').locator("input").first()).toHaveValue("1995");
  await expect.poll(() => stored(page)).toBe("1995-03-01|1985-01-01");
});

test("PD-GB2: 분리 OFF — 토지·건물 둘 다 1985-01-01", async ({ page }) => {
  test.setTimeout(180_000);
  await seed(page, [GB({ acquisitionDate: "1984-06-01", landAcquisitionDate: "1984-06-01" })]);
  await blurLandDate(page);
  await expect(page.getByTestId("acq-date-building").locator("input").first()).toHaveValue("1985");
  await expect.poll(() => stored(page)).toBe("1985-01-01|1985-01-01");
});
