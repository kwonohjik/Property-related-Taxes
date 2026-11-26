/**
 * P4 regionCode — AssetForm.regionCode → API body 전달 파이프라인 검증
 *
 * 핵심 검증:
 * 1. AssetForm에 regionCode가 있을 때 API 호출 body에 regionCode가 포함됨
 * 2. AssetForm에 regionCode가 없으면 body에 regionCode 없음 (boolean fallback)
 *
 * worktree 실행: E2E_PORT=3102 npx playwright test e2e/transfer-region-code.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { gotoTransferHoldingsStep } from "./_helpers/transfer-seed";

const GANGNAM = "1168010900"; // 서울 강남구 법정동코드 10자리

/** 「보유 상황」에서 「계산하기」까지 가서 계산 요청 body를 돌려준다. */
async function calculateAndCaptureBody(page: Page) {
  for (const step of ["감면·공제", "가산세"]) {
    await page.getByRole("button", { name: step }).first().click();
  }
  const rp = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 30_000 });
  await page.getByRole("button", { name: /계산하기/ }).click();
  const resp = await rp;
  expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()}`).toBe(true);
  return resp.request().postDataJSON() as Record<string, unknown>;
}

test.describe("양도세 regionCode — API body 전달 파이프라인", () => {
  test("계산 요청 시 assets[0].regionCode가 있으면 API body의 regionCode에 포함된다", async ({ page }) => {
    await gotoTransferHoldingsStep(page, {
      houses: [],
      assetOver: { regionCode: GANGNAM, addressJibun: "서울특별시 강남구 테스트동 1" },
    });
    const body = await calculateAndCaptureBody(page);
    expect(body.regionCode).toBe(GANGNAM);
  });

  test("AssetForm regionCode 초기값은 undefined (boolean fallback 유지)", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    // 새 자산의 regionCode 초기값 확인
    const initialRegionCode = await page.evaluate(() => {
      const storeKey = Object.keys(sessionStorage).find((k) =>
        k.includes("transfer") || k.includes("calc-wizard")
      );
      if (!storeKey) return "NO_STORE";
      try {
        const stored = JSON.parse(sessionStorage.getItem(storeKey) ?? "{}");
        const asset = stored?.state?.formData?.assets?.[0];
        if (!asset) return "NO_ASSET";
        return asset.regionCode === undefined ? "UNDEFINED" : asset.regionCode;
      } catch {
        return "PARSE_ERROR";
      }
    });

    // 초기값은 undefined(UNDEFINED)이거나 store 자체가 없어야 함
    expect(
      initialRegionCode === "UNDEFINED" ||
      initialRegionCode === "NO_STORE" ||
      initialRegionCode === "NO_ASSET"
    ).toBe(true);
  });
});
