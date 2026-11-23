/**
 * E2E — §89② 독법 확인 필요 고지(`89-2-reading:*` · D-42 공동상속 소수지분)는 비과세가 섰을 때만 낸다(2026-11-23 I-26 표 확장이 찾은 결함).
 *
 * 시료(평가셋 D-42): 2018 취득 주택(거주 30개월) + 공동상속 소수지분 주택(별도세대 2015 상속) + 승계 입주권(2023) · 2024-06-14 양도 8억.
 *   RG-1 등기 → 비과세 + 독법 확인 필요 고지
 *   RG-2 미등기 → 과세(어느 독법이어도 같은 결론) · 고지 없음(종전: 고지)
 */
import { test, expect, type Page } from "@playwright/test";
import { gotoJudgmentHoldingsStep } from "./_helpers/judgment-seed";

async function seedAndJudge(page: Page, isUnregistered: boolean) {
  await gotoJudgmentHoldingsStep(page, {
    transferDate: "2024-06-14",
    contractTotalPrice: "800000000",
    wasRegulatedAtAcquisition: false,
    isRegulatedArea: false,
    isUnregistered,
    assets: [{ assetKind: "housing", acquisitionDate: "2018-01-15", residenceInputMode: "direct", residencePeriodMonthsAsset: "30" }],
    houses: [
      {
        id: "co",
        region: "non_capital",
        acquisitionDate: "2015-03-01",
        officialPrice: "150000000",
        isInherited: true,
        inheritedDate: "2015-03-01",
        isCoInherited: true,
        isLargestCoInheritedShareholder: false,
        decedentSameHouseholdAtInheritance: false,
        decedentHouseholdSeparate: true,
        acquisitionOrigin: "general",
        isLongTermRental: false,
        isApartment: false,
        isOfficetel: false,
        isUnsoldHousing: false,
      },
    ],
    presaleRights: [{ id: "r", type: "redevelopment_right", acquisitionDate: "2023-03-15", region: "non_capital", memberOrigin: "successor" }],
  });
  const response = page.waitForResponse((r) => r.url().includes("/api/calc/one-house-exemption") && r.request().method() === "POST");
  await page.getByTestId("one-house-judge-cta").click();
  const res = await response;
  expect(res.ok(), `판정 API가 ${res.status()}로 응답했다`).toBe(true);
  await expect(page.getByTestId("one-house-judgment-result")).toBeVisible();
}

const READING = '[data-testid^="one-house-undetermined-89-2-reading:"]';

test("[RG-1] 등기 → 비과세 + §89② 독법 확인 필요 고지", async ({ page }) => {
  await seedAndJudge(page, false);
  await expect(page.getByTestId("one-house-verdict")).toHaveText("비과세");
  await expect(page.locator(READING)).toHaveCount(1);
});

test("[RG-2] 미등기 → 과세 · 독법 고지 없음", async ({ page }) => {
  await seedAndJudge(page, true);
  await expect(page.getByTestId("one-house-verdict")).toHaveText("과세");
  await expect(page.locator(READING)).toHaveCount(0);
});
