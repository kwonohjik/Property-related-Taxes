/**
 * 「보유 상황」(Step4)을 열지 않고 계산해도 조정대상지역 판정이 실린다 — 주 자산 소재지가 주소 문자열뿐(법정동코드 없음)인 경우.
 * 계획서 `docs/00-pm/regulated-area-skip-step4-sync-judgment.plan.md`. 세액 parity는 anchor
 * (`__tests__/calc/regulated-area-skip-step4.anchor.test.ts` C-1 — 건너뜀 = 거침 237,435,000).
 * 종전: 판정은 Step4 훅만 했다 → 건너뛰면 request body `isRegulatedArea: false`·`wasRegulatedAtAcquisition: false` → 거주 0인데 비과세.
 */
import { test, expect } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

const HOUSE = {
  assetKind: "housing",
  acquisitionCause: "purchase",
  acquisitionDate: "2018-03-02",
  fixedAcquisitionPrice: "400000000",
  actualSalePrice: "800000000",
  addressJibun: "서울특별시 강남구 테헤란로 123",
  regionCode: "",
  residenceInputMode: "direct",
  residencePeriodMonthsAsset: "0",
  buildingFootprintArea: "100",
  appurtenantLandZone: "metropolitan_residential",
  isUrbanArea: true,
  standardPriceAtTransfer: "600000000",
};

test("[RSK-1] ★ 보유 상황을 열지 않고 계산 — 주소 문자열 강남 → 조정대상지역 두 값 true · 비과세 아님", async ({ page }) => {
  test.setTimeout(150_000);
  const seed = {
    state: {
      formData: {
        assets: [{ ...makeDefaultAsset(1), ...HOUSE }],
        transferDate: "2026-02-16",
        contractTotalPrice: "1100000000",
        isOneHousehold: true,
        householdHousingCount: "1",
        householdNoOtherHousesConfirmed: true,
        householdNoPresaleRightsConfirmed: true,
        residencePeriodMonths: "120",
        houses: [],
        presaleRights: [],
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
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

  // 「보유 상황」은 누르지 않는다 — 자동 판별 훅이 한 번도 마운트되지 않는다.
  const autoCalls: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/address/regulated-area")) autoCalls.push(r.url());
  });
  for (const step of ["감면·공제", "가산세"]) {
    await page.getByRole("button", { name: step }).first().click();
  }
  const response = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", {
    timeout: 30_000,
  });
  await page.getByRole("button", { name: /계산하기/ }).click();
  const res = await response;
  expect(res.status(), `계산 API 응답 ${res.status()}`).toBe(200);
  const body = res.request().postDataJSON() as { isRegulatedArea?: boolean; wasRegulatedAtAcquisition?: boolean };
  expect(autoCalls, "Step4 자동 판별 API는 불리지 않았다").toEqual([]);
  expect(body.isRegulatedArea).toBe(true);
  expect(body.wasRegulatedAtAcquisition).toBe(true);
  const { data } = (await res.json()) as { data: { result?: { totalTax: number; isExempt: boolean } } };
  expect(data.result?.isExempt).toBe(false);
  expect(data.result?.totalTax ?? 0).toBeGreaterThan(0);
});
