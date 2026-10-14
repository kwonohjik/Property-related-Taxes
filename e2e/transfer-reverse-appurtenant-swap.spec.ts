/**
 * E2E: 사례 28 역방향 «주택을 첫 자산으로 바꾸기» 버튼 (G1)
 *
 *   T1. 토지(부수토지)를 첫 자산으로 입력 → 안내 카드 + 버튼 → 「보유 상황」에는 세대·주택 수 입력이 없다
 *   T2. 버튼 → 주택이 첫 자산 · 입력값(토지 면적·취득일) 보존 · 「보유 상황」에 세대·주택 수 입력이 열린다 · 계산 요청 본문과 총세액이 «주택을 먼저 입력한 경우»와 같다
 *   T3. 첫 자산 토지에 «첫 자산 전용» 입력(다필지)이 있으면 버튼 없이 사유만 보인다
 *
 * ⚠️ 세액 수치의 정본은 vitest anchor(`g1-reverse-appurtenant-swap.anchor.test.ts`)다 — 여기는 화면 입력 경로(카드→버튼→보유 상황→계산)가 엔진까지 도달한다는 배선 확인이다.
 * 셀렉터는 data-testid·role만 쓴다(표시 문구 정규식 의존 금지).
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { DIRECT_RESIDENCE } from "./_helpers/residence-direct";

const HOUSE = {
  assetId: "h1",
  assetKind: "housing",
  acquisitionCause: "purchase",
  acquisitionDate: "2014-01-02",
  fixedAcquisitionPrice: "400000000",
  actualSalePrice: "800000000",
  addressJibun: "서울 테스트동 1",
  residencePeriodMonthsAsset: "120",
  buildingFootprintArea: "100",
  appurtenantLandZone: "metropolitan_residential",
  isUrbanArea: true,
  areaScenario: "same",
  acquisitionArea: "0",
  transferArea: "0",
  standardPriceAtTransfer: "600000000",
};
const LAND = {
  assetId: "l1",
  assetKind: "land",
  landNature: "appurtenant",
  acquisitionCause: "purchase",
  acquisitionDate: "2014-01-02",
  fixedAcquisitionPrice: "150000000",
  actualSalePrice: "300000000",
  addressJibun: "서울 테스트동 l1",
  areaScenario: "same",
  acquisitionArea: "300",
  transferArea: "300",
  standardPriceAtTransfer: "200000000",
};

/** 과세 시료 — 조정대상지역 2018 취득 · 거주 0이라 주택도 과세된다(총세액이 0이 아니어야 «같은 결과» 단언이 세액을 가린다). */
const TAXED_ASSET = { acquisitionDate: "2018-01-02" };
const TAXED_HOUSE = { ...TAXED_ASSET, residencePeriodMonthsAsset: "0" };

function seedForm(order: "land-first" | "house-first", landOver: Record<string, unknown> = {}, taxed = false) {
  const house = taxed ? { ...HOUSE, ...TAXED_HOUSE } : HOUSE;
  const land = { ...LAND, ...(taxed ? TAXED_ASSET : {}), ...landOver };
  const raw = order === "land-first" ? [land, house] : [house, land];
  return {
    state: {
      formData: {
        assets: raw.map((a, i) => ({ ...makeDefaultAsset(i + 1), ...DIRECT_RESIDENCE, ...a })),
        transferDate: "2026-02-16",
        contractTotalPrice: "1100000000",
        isOneHousehold: true,
        householdHousingCount: "1",
        householdNoOtherHousesConfirmed: true,
        householdNoPresaleRightsConfirmed: true,
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: taxed,
        ...(taxed ? { wasRegulatedAtAcquisitionTouched: true } : {}),
        residencePeriodMonths: taxed ? "0" : "120",
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function seed(page: Page, order: "land-first" | "house-first", landOver: Record<string, unknown> = {}, taxed = false) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), seedForm(order, landOver, taxed));
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

const NOTICE = "reverse-appurtenant-swap-notice";
const BTN = "reverse-appurtenant-swap-button";
const REASON = "reverse-appurtenant-swap-reason";
const HOUSE_COUNT = "household-house-count-derived";

/** 계산 요청을 가로채 본문·응답(총세액)을 돌려준다 */
async function calculate(page: Page) {
  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  const reqP = page.waitForRequest((r) => r.url().includes("/api/calc/transfer") && r.method() === "POST");
  const resP = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST");
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  const body = (await reqP).postDataJSON() as Record<string, unknown>;
  const json = (await (await resP).json()) as { data: { aggregated: { totalTax: number } } };
  return { body, totalTax: json.data.aggregated.totalTax };
}

test.describe("역방향 «주택을 첫 자산으로 바꾸기» (G1)", () => {
  test("T1·T2: 토지 먼저 → 카드·버튼 → 주택이 첫 자산 · 보유 상황 입력 열림 · 주택 먼저와 같은 결과", async ({ page }) => {
    test.setTimeout(150_000);
    await seed(page, "land-first", {}, true);
    await expect(page.getByTestId(NOTICE)).toBeVisible();
    await expect(page.getByTestId(BTN)).toBeVisible();
    await expect(page.locator('[data-asset-card-index="0"]').getByText("주 자산", { exact: true })).toBeVisible();

    // 토지가 첫 자산이면 보유 상황 단계에 세대·주택 수 입력이 없다
    await page.getByRole("button", { name: "보유 상황" }).first().click();
    await expect(page.getByTestId(HOUSE_COUNT)).toHaveCount(0);
    await page.getByRole("button", { name: "자산 목록" }).first().click();

    await page.screenshot({ path: "e2e/_artifacts/g1-swap-before.png", fullPage: true });
    await page.getByTestId(BTN).click();

    // 카드가 사라지고(같은 구성이 아니다) 주택이 첫 자산(주 자산 배지) · 입력값 보존
    await expect(page.getByTestId(NOTICE)).toHaveCount(0);
    // 승격 주택에 입력한 자산별 거주기간이 이제 계산에 반영된다 — 교환 직후 한 줄 안내(리뷰 S4)
    await expect(page.getByTestId("reverse-appurtenant-swap-after-note")).toBeVisible();
    await expect(page.locator('[data-asset-card-index="0"]').getByText("주 자산", { exact: true })).toBeVisible();
    await expect(page.locator('[data-asset-card-index="1"]').getByText("주 자산", { exact: true })).toHaveCount(0);
    await page.screenshot({ path: "e2e/_artifacts/g1-swap-after.png", fullPage: true });
    const stored = await page.evaluate(() => JSON.parse(sessionStorage.getItem("transfer-tax-wizard") ?? "{}").state.formData.assets);
    expect(stored.map((a: { assetId: string }) => a.assetId)).toEqual(["h1", "l1"]);
    const land = stored.find((a: { assetId: string }) => a.assetId === "l1");
    expect(land.acquisitionArea).toBe("300");
    expect(land.acquisitionDate).toBe(TAXED_ASSET.acquisitionDate);

    // 보유 상황 단계에 세대·주택 수 입력이 열린다
    await page.getByRole("button", { name: "보유 상황" }).first().click();
    await expect(page.getByTestId(HOUSE_COUNT)).toBeVisible();
    // 토지가 첫 자산인 동안 이 입력은 숨어 있어 기본값(미해당)으로 돌아가 있다 — 열린 입력에 사용자가 사실(조정대상지역 취득)을 입력한다.
    const regulated = page.getByTestId("transfer-was-regulated").getByRole("switch");
    if ((await regulated.getAttribute("aria-checked")) !== "true") await regulated.click();
    await expect(regulated).toHaveAttribute("aria-checked", "true");
    await page.screenshot({ path: "e2e/_artifacts/g1-swap-step4.png", fullPage: true });

    const swapped = await calculate(page);
    expect(swapped.body.buildingFootprintArea).toBe(100);
    expect(swapped.body.appurtenantLandZone).toBe("metropolitan_residential");
    expect(swapped.body.isUrbanArea).toBe(true);

    // 정본 — 처음부터 주택을 먼저 입력한 폼
    await seed(page, "house-first", {}, true);
    const reference = await calculate(page);
    expect(swapped.body).toEqual(reference.body);
    expect(swapped.totalTax).toBe(reference.totalTax);
    expect(swapped.totalTax).toBeGreaterThan(0);
  });

  test("T3: 첫 자산 토지에 «첫 자산 전용» 입력(다필지)이 있으면 버튼 없이 사유만 보인다", async ({ page }) => {
    test.setTimeout(90_000);
    await seed(page, "land-first", { parcelMode: true });
    await expect(page.getByTestId(NOTICE)).toBeVisible();
    await expect(page.getByTestId(BTN)).toHaveCount(0);
    await expect(page.getByTestId(REASON)).toBeVisible();
  });
});
