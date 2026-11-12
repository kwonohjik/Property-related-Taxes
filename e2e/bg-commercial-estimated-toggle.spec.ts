/**
 * E2E: 상업용건물 × 부담부증여 — 「환산취득가 사용」 토글을 두지 않는다(계획서 `bg-stale-acq-mode-flags.plan.md` V-2 · `bgIgnoresCommercialEstimated`).
 *
 * CE-E1: 매매에서 켜 둔 토글(칸 비움)이 남은 채 부담부증여로 저장돼 있어도 ③에 토글이 없고, 계산까지 막히지 않는다
 *        (수정 전: ⑧ 「전용면적을 입력하세요」).
 * CE-E2: 같은 자산을 일반 양도로 되돌리면 토글이 켜진 채 다시 보인다(저장값 보존).
 */
import { test, expect, type Page } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { fillDateAndVerify } from "./_helpers/tax-flow";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

const seed = (transferType: "burdened_gift" | "regular") => ({
  ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1",
  assetKind: "commercial_building" as const, transferType,
  bgValuationMode: "sangjeungbeop_market" as const, bgMarketValueAtTransfer: "500000000",
  bgMortgageDebtAmount: "200000000", bgMortgageSetAmount: "240000000", bgDonorRelation: "lineal_descendant" as const,
  bgGiftBuildingStdPriceAtTransfer: "300000000", standardPriceAtTransfer: "200000000", standardPriceAtAcq: "100000000",
  acquisitionCause: "purchase" as const, acquisitionDate: "2012-01-01",
  bgAcquisitionMethod: "actual" as const, bgActualAcquisitionTotal: "120000000",
  useEstimatedAcquisition: true,
});

async function open(page: Page, transferType: "burdened_gift" | "regular") {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((asset) => {
    sessionStorage.setItem(
      "transfer-tax-wizard",
      JSON.stringify({ state: { formData: { assets: [asset], transferDate: "2024-06-01" }, pendingMigration: false }, version: 0 }),
    );
  }, seed(transferType));
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  const card = page.locator('[data-asset-card-index="0"]');
  await fillDateAndVerify(page, { year: "2024", month: "06", day: "01" }, { scope: card });
  await expandAssetSection(page, 3);
  return card;
}

test("CE-E1: 부담부증여 상가 — 토글 없음 · 남은 켬 값으로 막히지 않고 결과까지", async ({ page }) => {
  const card = await open(page, "burdened_gift");
  await expect(card.getByText("환산취득가 사용")).toHaveCount(0);
  for (let i = 0; i < 4; i++) {
    const next = page.getByRole("button", { name: /다음|계산하기/ }).last();
    if (!(await next.isVisible().catch(() => false))) break;
    await next.click();
    await page.waitForTimeout(500);
  }
  await expect(page.getByText("전용면적을 입력하세요")).toHaveCount(0);
  await expect(page.locator('[data-print-id="building-std-report"]')).toHaveCount(1, { timeout: 20000 });
});

test("CE-E2: 일반 양도 상가 — 토글이 켜진 채 보인다(저장값 보존)", async ({ page }) => {
  const card = await open(page, "regular");
  await expect(card.getByText("환산취득가 사용")).toBeVisible();
  await expect(card.getByRole("switch", { name: /환산취득가 사용/ })).toBeChecked();
});
