/**
 * 재개발 완공 APT — «양도시 기준시가» 칸이 공동주택가격 총액 칸이다 (계획서 `docs/02-design/features/redev-companion-apportion-key-std-widget.plan.md` Q-1 a).
 *
 *   SW-1 부담부증여 · 기준시가 평가 — 양도시·취득시 기준시가 칸에 «㎡당 단가»·«면적» 칸이 없고, 「공시가격 조회」 요청이 propertyType=housing 이다.
 *   SW-2 대조 — 상업용 건물은 단가 × 면적 칸이 그대로 있다(propertyType=land).
 * 사람이 브라우저로 직접 한 수동 확인은 아니다(headless Playwright). 워크트리는 `E2E_PORT=<포트> npx playwright test <spec>`.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

const BASE = {
  ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", acquisitionCause: "purchase", acquisitionDate: "2015-03-01",
  transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgValuationMode: "sangjeungbeop_standard", bgMortgageDebtAmount: "300000000",
};
const REDEV = { ...BASE, assetKind: "redevelopment_apt", redevSubject: "apt", redevIsSuccessorMember: "yes", redevCompletionDate: "2022-12-02" };
const form = (asset: unknown) => ({
  state: {
    formData: {
      assets: [asset], transferDate: "2025-06-01", filingDate: "2025-07-30", contractTotalPrice: "920000000", householdHousingCount: "0",
      householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isOneHousehold: false, isRegulatedArea: false,
      wasRegulatedAtAcquisition: false, isUnregistered: false,
    },
    pendingMigration: false,
  },
  version: 0,
});

async function open(page: Page, asset: unknown) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate((x) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(x)), form(asset));
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  for (const n of [1, 2, 3] as const) await expandAssetSection(page, n);
  return page.locator('[data-asset-card-index="0"]');
}

/**
 * 양도시 기준시가 위젯(`data-testid="sale-std-price-transfer"`)의 라벨 중 단가·면적 칸 수.
 * ⚠️ 입력칸 이동 앵커(`data-field="standardPriceAtTransfer"`)는 금액 칸에만 있다 — 위젯 전체를 찾는 데 쓰지 않는다.
 */
const saleStdWidget = (card: ReturnType<Page["locator"]>) => card.getByTestId("sale-std-price-transfer").first();
async function areaModeCells(card: ReturnType<Page["locator"]>) {
  const wrap = saleStdWidget(card);
  await expect(wrap).toHaveCount(1);
  const labels = await wrap.locator("label").allTextContents();
  return { unit: labels.filter((t) => t.includes("㎡당 단가")).length, area: labels.filter((t) => /^면적 \(㎡\)/.test(t.trim())).length };
}

async function lookupPropertyType(page: Page, card: ReturnType<Page["locator"]>): Promise<string | null> {
  let type: string | null = null;
  await page.route("**/api/address/standard-price**", async (route) => {
    type = new URL(route.request().url()).searchParams.get("propertyType");
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, price: 1, data: { price: 1 } }) });
  });
  await saleStdWidget(card).getByRole("button", { name: /공시가격 조회/ }).click();
  await expect.poll(() => type, { timeout: 15_000 }).not.toBeNull();
  return type;
}

test.describe("재개발 완공 APT — 기준시가 칸 형식", () => {
  test("SW-1: 재개발 APT → 단가·면적 칸 없음 · 조회 propertyType=housing", async ({ page }) => {
    test.setTimeout(180_000);
    const card = await open(page, REDEV);
    expect(await areaModeCells(card)).toEqual({ unit: 0, area: 0 });
    expect(await lookupPropertyType(page, card)).toBe("housing");
  });

  test("SW-2: 대조 — 상업용 건물은 단가·면적 칸이 있고 조회 propertyType=land", async ({ page }) => {
    test.setTimeout(180_000);
    const card = await open(page, { ...BASE, assetKind: "commercial_building" });
    expect(await areaModeCells(card)).toEqual({ unit: 1, area: 1 });
    expect(await lookupPropertyType(page, card)).toBe("land");
  });
});
