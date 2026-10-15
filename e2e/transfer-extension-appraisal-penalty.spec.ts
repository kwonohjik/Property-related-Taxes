/**
 * 양도소득세 — 통상(비-부담부) 경로 감정가액 × 증축 5년 이내 「증축한 부분의 감정가액」 (소득세법 §114조의2①)
 *
 * 종전에는 증축에도 건물 전체 감정가액을 가산세 base로 썼다. 조문은 「증축한 부분에 한정한 감정가액」이라 별도 칸을 받는다.
 *   EA-1. 증축 × 감정가액(건물 전체 300M · 증축부분 60M) → payload `extensionAppraisalValue` · base 60M · 가산세 3,000,000(종전 15,000,000)
 *   EA-2. 칸이 비면 계산을 막고 그 칸으로 안내한다(건물 전체로 대신하지 않는다)
 *   EA-3. 구별력 — 신축이면 칸이 없고 건물 전체 감정가액이 base(15,000,000)다
 * 사람이 브라우저로 직접 한 수동 확인은 아니다(headless Playwright). 포트는 `baseURL` — 워크트리는 `E2E_PORT=<포트> npx playwright test <spec>`.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

function seed(over: Record<string, unknown> = {}) {
  return {
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2021-01-01",
    actualSalePrice: "800000000",
    isAppraisalAcquisition: true,
    fixedAcquisitionPrice: "300000000",
    standardPriceAtAcq: "200000000",
    standardPriceAtTransfer: "250000000",
    isSelfBuilt: true,
    buildingType: "extension",
    constructionDate: "2021-01-01",
    extensionFloorArea: "120",
    extensionStdPriceAtAcquisition: "40000000",
    extensionAppraisalValue: "60000000",
    ...over,
  };
}

async function seedAndOpen(page: Page, assets: Record<string, unknown>[]) {
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
          contractTotalPrice: "800000000",
          householdHousingCount: "2",
          householdNoOtherHousesConfirmed: true,
          householdNoPresaleRightsConfirmed: true,
          isOneHousehold: false,
          isRegulatedArea: false,
          wasRegulatedAtAcquisition: false,
          isUnregistered: false,
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
  const calcResponse = page.waitForResponse(
    (r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST",
    { timeout: 30_000 },
  );
  for (const step of ["보유 상황", "감면·공제", "가산세"]) {
    await page.getByRole("button", { name: step }).first().click();
  }
  await page.getByRole("button", { name: /계산하기/ }).last().click();
  const res = await calcResponse;
  expect(res.status()).toBe(200);
  return res;
}

test.describe("통상 경로 — 감정가액 × 증축 5년 이내 §114조의2", () => {
  test("EA-1: 증축부분 감정가액 60M → base 60M · 가산세 3,000,000", async ({ page }) => {
    test.setTimeout(120_000);
    await seedAndOpen(page, [seed()]);
    const card = page.locator('[data-asset-card-index="0"]');
    await expandAssetSection(page, 1);
    await expandAssetSection(page, 2);
    await expect(card.getByTestId("extension-appraisal-value")).toHaveValue("60,000,000");
    const res = await calculate(page);
    const sent = res.request().postDataJSON() as Record<string, unknown>;
    expect(sent.extensionAppraisalValue).toBe(60_000_000);
    const body = await res.json();
    const r = body.data?.result ?? body.result ?? body.data;
    expect(r.penaltyBase).toBe(60_000_000);
    expect(r.penaltyTax).toBe(3_000_000);
  });

  test("EA-2: 칸이 비면 계산을 막고 그 칸으로 안내한다", async ({ page }) => {
    test.setTimeout(120_000);
    await seedAndOpen(page, [seed({ extensionAppraisalValue: "" })]);
    const card = page.locator('[data-asset-card-index="0"]');
    await expandAssetSection(page, 1);
    await expandAssetSection(page, 2);
    await expect(card.getByTestId("extension-appraisal-value")).toHaveValue("");
    let called = false;
    page.on("request", (rq) => {
      if (rq.url().includes("/api/calc/transfer") && rq.method() === "POST") called = true;
    });
    for (const step of ["보유 상황", "감면·공제", "가산세"]) {
      await page.getByRole("button", { name: step }).first().click();
    }
    await page.getByRole("button", { name: /계산하기/ }).last().click();
    await expect(page.getByText(/증축한 부분의 감정가액을 입력하세요/).first()).toBeVisible({ timeout: 15_000 });
    expect(called).toBe(false);
  });

  test("EA-3: 구별력 — 신축이면 칸이 없고 건물 전체 감정가액이 base(15,000,000)", async ({ page }) => {
    test.setTimeout(120_000);
    await seedAndOpen(page, [
      seed({ buildingType: "new", extensionFloorArea: "", extensionStdPriceAtAcquisition: "", extensionAppraisalValue: "" }),
    ]);
    const card = page.locator('[data-asset-card-index="0"]');
    await expandAssetSection(page, 1);
    await expandAssetSection(page, 2);
    await expect(card.getByTestId("extension-appraisal-value")).toHaveCount(0);
    const res = await calculate(page);
    const body = await res.json();
    const r = body.data?.result ?? body.result ?? body.data;
    expect(r.penaltyBase).toBe(300_000_000);
    expect(r.penaltyTax).toBe(15_000_000);
  });
});
