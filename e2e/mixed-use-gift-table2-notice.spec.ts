/**
 * 겸용주택 증여 — 증여 전 동일세대 거주의 표2 대상 판정 통산 확인 필요 고지가 계산기 결과 화면에 나온다
 * (`docs/00-pm/mixed-use-table2-gift-notice.plan.md`). 고지 조건·문장 고정은 anchor
 * (`__tests__/tax-engine/transfer/mixed-use-gift-table2-notice.anchor.test.ts`). 종전: 일반 주택에는 나오는 고지가 겸용에는 0건.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { withMixedHousingStd } from "./_helpers/mixed-housing-std-seed";

const NC = "4682025021"; // 경남 고성군 — 조정대상지역 아님(§154① 거주요건 없음)
const mixedGift = (prior: string) =>
  withMixedHousingStd({
    addressJibun: "경상남도 고성군 테스트리 1", regionCode: NC, assetKind: "housing", isMixedUseHouse: true,
    residentialFloorArea: "100", nonResidentialFloorArea: "60", buildingFootprintArea: "100", mixedUseTotalLandArea: "200",
    mixedTransferHousingPrice: "600000000", mixedTransferLandPricePerSqm: "5000000", mixedTransferCommercialBuildingPrice: "100000000",
    mixedAcqHousingPrice: "300000000", mixedAcqLandPricePerSqm: "2500000", mixedAcqCommercialBuildingPrice: "50000000", mixedIsMetropolitanArea: false,
    residenceInputMode: "direct", residencePeriodMonthsAsset: "0", residencePeriods: [],
    actualSalePrice: "4000000000",
    acquisitionCause: "gift", acquisitionDate: "2019-03-01", donorAcquisitionDate: "2008-01-01", giftDonorRelation: "lineal",
    giftSameHousehold: "yes", giftHouseholdHoldingStartDate: "2008-01-01", giftPriorHouseholdResidenceMonths: prior,
    fixedAcquisitionPrice: "",
  });

async function calc(page: Page, prior: string) {
  const seed = {
    state: {
      formData: {
        assets: [{ ...makeDefaultAsset(1), ...mixedGift(prior) }], transferDate: "2025-06-15", filingDate: "2025-08-31",
        contractTotalPrice: "4000000000", householdHousingCount: "1", isOneHousehold: true, residencePeriodMonths: "0", houses: [], presaleRights: [],
        householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isRegulatedArea: false, wasRegulatedAtAcquisition: false,
      },
      pendingMigration: false,
    },
    version: 0,
  };
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), seed);
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  for (const step of ["보유 상황", "감면·공제", "가산세"]) {
    await page.getByRole("button", { name: step }).first().click();
  }
  const response = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 30_000 });
  await page.getByRole("button", { name: /계산하기/ }).click();
  const res = await response;
  expect(res.status(), `계산 API 응답 ${res.status()}`).toBe(200);
  return { body: res.request().postDataJSON() as Record<string, unknown>, json: JSON.stringify(await res.json()) };
}

test("[MGT-1] ★ 증여 전 24개월 통산으로 표2 → 조심 2025서3843 확인 필요가 결과 화면에 보인다", async ({ page }) => {
  test.setTimeout(150_000);
  const { body, json } = await calc(page, "24");
  expect(body.giftPriorHouseholdResidenceMonths).toBe(24);
  expect(json).toContain("증여 전 동일세대로 거주한 24개월");
  await expect(page.getByText(/조심 2025서3843\(2025\.12\.16\.\)은 양도일 현재 증여인과 동일세대가 아니어서/).first()).toBeVisible({ timeout: 30_000 });
});

test("[MGT-2] 증여 전 거주를 비우면 「그 개월 수를 입력하세요」 안내가 보인다", async ({ page }) => {
  test.setTimeout(150_000);
  const { body } = await calc(page, "");
  expect(body).not.toHaveProperty("giftPriorHouseholdResidenceMonths");
  await expect(page.getByText(/그 개월 수를 입력하세요/).first()).toBeVisible({ timeout: 30_000 });
});
