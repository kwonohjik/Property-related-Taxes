/**
 * E2E — 함께 양도 컴패니언 × 증여 일반건물 (계획서 `docs/00-pm/gb-companion-gift-fixed-acq-price.plan.md` Q-1 a · Q-2 숨김)
 *
 * 종전: 토지 취득원인이 증여인 컴패니언 일반건물이 ⑧ 통과 → ⑫ 400 「증여 자산은 신고가액(취득가액) 필수」였다.
 * 지금: 분리 ON·부담부증여는 자산 전체 신고가액을 요구하지 않고 그 칸도 숨긴다(파트 가액/§159 가 취득가액을 정한다). 분리 OFF 일괄 증여는 그 칸이 취득가액이라 그대로 있다.
 *
 * 실행(워크트리): E2E_PORT=3312 npx playwright test e2e/gb-companion-gift-fixed-acq.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { seedWizard } from "./_helpers/split-acq-display";

const SHOT = process.env.GG_SHOT_DIR;

const gb = (id: number, over: Record<string, unknown> = {}) => ({
  ...makeDefaultAsset(id),
  ...(id === 2 ? { assetId: "a2" } : {}),
  addressJibun: `서울 강남구 테스트동 ${id}-${id}`,
  assetKind: "general_building",
  gbLandArea: "205", gbBuildingArea: "300", gbBuildingFootprintArea: "135", gbZoneType: "general_residential",
  gbTransferLandPricePerSqm: "5514000", gbTransferBuildingValue: "259072400",
  gbAcqLandPricePerSqm: "1000000", gbAcqBuildingValue: "150000000",
  actualSalePrice: "1600000000",
  ...over,
});
/** 첫 자산 — 매매 · 분리 OFF 일괄 실가(자산 전체 취득가액 칸이 있는 정상 자산). */
const buy = (over: Record<string, unknown> = {}) =>
  gb(1, { acquisitionCause: "purchase", gbBuildingAcquisitionCause: "purchase", acquisitionDate: "2010-05-01", fixedAcquisitionPrice: "600000000", ...over });
/** 둘째 자산 — 분리 ON · 토지 증여(신고가액 파트 칸) + 건물 매매 실가, 취득일 다름. */
const giftOn = (over: Record<string, unknown> = {}) =>
  gb(2, {
    acquisitionCause: "gift", gbBuildingAcquisitionCause: "purchase", hasSeperateLandAcquisitionDate: true,
    landAcquisitionDate: "2005-05-01", acquisitionDate: "2010-05-01", landAcqMode: "actual", buildingAcqMode: "actual",
    landAcquisitionPrice: "400000000", buildingAcquisitionPrice: "200000000", ...over,
  });
const BG = {
  transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000",
  bgMortgageDebtAmount: "500000000", bgMortgageSetAmount: "500000000", bgDonorRelation: "lineal_descendant", bgAcquisitionMethod: "converted",
};
const seed = (assets: unknown[]) => ({
  state: {
    formData: {
      assets, transferDate: "2026-02-16", filingDate: "2026-04-30", contractTotalPrice: "3200000000", assetSplitMode: "companion", bundledSaleMode: "actual",
      householdHousingCount: "2", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isOneHousehold: false,
      isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false,
    },
    pendingMigration: false,
  },
  version: 0,
});

async function calc(page: Page) {
  const reqP = page.waitForRequest((r) => r.url().includes("/api/calc/transfer") && r.method() === "POST");
  const resP = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST");
  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  const body = (await reqP).postDataJSON() as Record<string, unknown>;
  const status = (await resP).status();
  return { body, status };
}
const shot = async (page: Page, name: string, index?: number) => {
  if (!SHOT) return;
  if (index === undefined) await page.screenshot({ path: `${SHOT}/${name}.png`, fullPage: true });
  else await card(page, index).screenshot({ path: `${SHOT}/${name}.png` });
};
const card = (page: Page, index: number) => page.locator(`[data-asset-card-index="${index}"]`);
/** 자산 카드의 「취득정보」 접기 섹션을 펼친다 — 접힌 채로는 칸의 유무를 알 수 없다. */
async function openAcquisition(page: Page, index: number) {
  const header = card(page, index).getByRole("button", { name: /취득정보/ }).first();
  await expect(header).toBeVisible();
  if ((await header.getAttribute("aria-expanded")) !== "true") await header.click();
  await expect(header).toHaveAttribute("aria-expanded", "true");
  return card(page, index);
}
const priceField = (c: ReturnType<typeof card>) => c.locator("[data-field='fixedAcquisitionPrice']");

test.describe("컴패니언 일반건물 × 증여", () => {
  test("GG-E1 분리 ON 토지 증여: 「증여 신고가액」 칸이 없다 · 계산된다 · 요청에 자산 전체 신고가액 없음", async ({ page }) => {
    test.setTimeout(240_000);
    await seedWizard(page, seed([buy(), giftOn()]));
    const c = await openAcquisition(page, 1);
    // 증여일·증여자 취득일은 남고(보유기간 기산) 자산 전체 신고가액 칸만 숨는다.
    await expect(c.locator("[data-field='landAcquisitionDate']")).toHaveCount(1);
    await expect(c.locator("[data-field='donorAcquisitionDate']")).toHaveCount(1);
    await expect(priceField(c)).toHaveCount(0);
    await expect(c.getByText("증여 신고가액 (원)")).toHaveCount(0);
    await c.scrollIntoViewIfNeeded();
    await shot(page, "E1-분리ON-자산2-취득정보", 1);
    const { body, status } = await calc(page);
    expect(status).toBe(200);
    const comp = (body.companionAssets as Record<string, unknown>[])[0];
    expect(comp.acquisitionCause).toBe("gift");
    expect(comp.fixedAcquisitionPrice).toBeUndefined();
    await expect(page.getByText("입력값이 올바르지 않습니다")).toHaveCount(0);
    await expect(page.getByText("증여 자산은 신고가액(취득가액) 필수")).toHaveCount(0);
    await expect(page.getByText("합산 과세 내역").first()).toBeVisible({ timeout: 60_000 });
    await shot(page, "E1-분리ON-결과");
  });

  test("GG-E2 분리 OFF 일괄 증여: 「증여 신고가액」 칸이 그대로 있고 값이 요청에 실린다", async ({ page }) => {
    test.setTimeout(240_000);
    const off = gb(2, {
      acquisitionCause: "gift", gbBuildingAcquisitionCause: "gift", hasSeperateLandAcquisitionDate: false, acquisitionDate: "2010-05-01",
      landAcquisitionDate: "2010-05-01", fixedAcquisitionPrice: "600000000",
    });
    await seedWizard(page, seed([buy(), off]));
    const c = await openAcquisition(page, 1);
    await expect(priceField(c)).toHaveCount(1);
    await expect(priceField(c)).toBeVisible();
    await c.scrollIntoViewIfNeeded();
    await shot(page, "E2-분리OFF-자산2-취득정보", 1);
    const { body, status } = await calc(page);
    expect(status).toBe(200);
    expect((body.companionAssets as Record<string, unknown>[])[0].fixedAcquisitionPrice).toBe(600_000_000);
    await expect(page.getByText("합산 과세 내역").first()).toBeVisible({ timeout: 60_000 });
  });

  test("GG-E3 부담부증여 토지 증여: 입력 칸 없이 §159 안내 카드 · 계산된다(종전엔 칸 없이 400)", async ({ page }) => {
    test.setTimeout(240_000);
    const bg = (id: number) =>
      id === 1
        ? buy({ ...BG, hasSeperateLandAcquisitionDate: true, acquisitionCause: "gift", gbBuildingAcquisitionCause: "purchase", landAcquisitionDate: "2005-05-01", acquisitionDate: "2010-05-01", landAcqMode: "actual", buildingAcqMode: "actual", fixedAcquisitionPrice: "" })
        : giftOn({ ...BG, landAcquisitionPrice: "", buildingAcquisitionPrice: "" });
    await seedWizard(page, seed([bg(1), bg(2)]));
    const c = await openAcquisition(page, 1);
    await expect(priceField(c)).toHaveCount(0);
    await expect(c.getByText("취득가액 — 부담부증여 §159 자동 산정")).toBeVisible();
    await c.scrollIntoViewIfNeeded();
    await shot(page, "E3-부담부증여-자산2-취득정보", 1);
    const { body, status } = await calc(page);
    expect(status).toBe(200);
    expect((body.companionAssets as Record<string, unknown>[])[0].fixedAcquisitionPrice).toBeUndefined();
    await expect(page.getByText("입력값이 올바르지 않습니다")).toHaveCount(0);
  });
});
