/**
 * E2E: 결과 PDF — 함께 양도에서 「선택 항목 PDF」가 실제로 내려받아진다(원문자 대체 글꼴을 함께 불러온다).
 * 머리 행 값은 anchor `filing-head-pdf-rows`가 본다. 폰트 CDN은 E2E 헤더가 CORS에 걸려 route에서 뗀다.
 */
import { test, expect } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

const LAND = (i: number, o: Record<string, unknown> = {}) => ({
  ...makeDefaultAsset(i), addressJibun: `서울 강남구 테스트동 ${i}-1`, assetKind: "land", acquisitionCause: "purchase", transferType: "regular", acquisitionDate: "1985-01-01", preDeemedOriginalAcquisitionDate: "1984-06-01",
  actualSalePrice: "500,000,000", fixedSalePrice: "500,000,000", fixedAcquisitionPrice: "100,000,000", acquisitionArea: "100", transferArea: "100", standardPriceAtTransfer: "500000000", ...o,
});

test("PDF-1: 함께 양도 — PDF 다운로드 성공", async ({ page }) => {
  test.setTimeout(240_000);
  const dialogs: string[] = [];
  page.on("dialog", async (d) => { dialogs.push(d.message()); await d.dismiss(); });
  await page.route("https://cdn.jsdelivr.net/**", async (r) => {
    const h = { ...r.request().headers() };
    for (const k of Object.keys(h)) if (k.startsWith("x-e2e")) delete h[k];
    await r.continue({ headers: h });
  });
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), {
    state: { formData: { assets: [LAND(1, { acquisitionDate: "2015-06-01", preDeemedOriginalAcquisitionDate: "", fixedAcquisitionPrice: "300,000,000" }), LAND(2)], contractTotalPrice: "1000000000", transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "0", isOneHousehold: false, householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true }, pendingMigration: false },
    version: 0,
  });
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  const res = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  await page.getByRole("button", { name: /계산하기/ }).last().click();
  expect((await res).status()).toBe(200);
  const panel = page.getByTestId("print-selection-panel");
  await panel.getByRole("button", { name: "전체 선택" }).click();
  const dl = page.waitForEvent("download", { timeout: 120_000 });
  await panel.getByRole("button", { name: /선택 항목 PDF/ }).click();
  expect((await dl).suggestedFilename()).toMatch(/\.pdf$/);
  expect(dialogs).toEqual([]);
});
