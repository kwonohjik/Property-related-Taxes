/**
 * temp-two-house-remnant-e5.spec.ts — §155① 후단(종전 주택 일부 수용 뒤 잔존 주택 양도) 브라우저 확인 (판정 메뉴 ③ · 2026-11-12 리뷰 E-5)
 *
 * §154① 단서 「수용」 칸(수용일·사업인정 고시일)을 재사용한다. 수용일이 처분기한 안이면 잔존 주택 양도가 기한을 넘어도
 * 요건 카드가 「충족 … §155① 후단」을 말하고 판정은 비과세다.
 *
 * 실행: E2E_PORT=3124 npx playwright test e2e/temp-two-house-remnant-e5.spec.ts
 */
import { test, expect } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { gotoJudgmentStep2 } from "./_helpers/judgment-seed";
import { DIRECT_RESIDENCE } from "./_helpers/residence-direct";

test("E-5: 일부 수용 2021-06-01(기한 안) · 잔존 양도 2024-06-01 → 카드 「§155① 후단」 · 비과세", async ({ page }) => {
  await gotoJudgmentStep2(page, {
    assets: [
      {
        ...makeDefaultAsset(1),
        ...DIRECT_RESIDENCE,
        addressJibun: "경기도 이천시 테스트동 1-1",
        assetKind: "housing",
        acquisitionCause: "purchase",
        acquisitionDate: "2010-01-01",
        fixedAcquisitionPrice: "200000000",
        transferPrice: "500000000",
      },
    ],
    transferDate: "2024-06-01",
    filingDate: "2024-08-31",
    contractTotalPrice: "500000000",
    isRegulatedArea: false,
    isUnregistered: false,
    provisoReason: "expropriation",
    provisoExpropriationDate: "2021-06-01",
    provisoBusinessApprovalDate: "2015-01-01",
    houses: [
      { id: "h1", region: "non_capital", acquisitionOrigin: "general", acquisitionDate: "2019-01-01", officialPrice: "100000000", isInherited: false, isLongTermRental: false },
    ],
  });
  await expect(page.getByTestId("temp-two-house-verdict")).toContainText("§155① 후단");
  await page.getByTestId("one-house-judge-cta").click();
  await expect(page.getByTestId("one-house-judgment-result")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("one-house-verdict")).toHaveText("비과세");
});
