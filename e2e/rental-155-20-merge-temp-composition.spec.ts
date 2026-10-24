/**
 * §155⑳ 세대 구성 × 혼인 합가 — 임대주택이 일시적 2주택 신규 주택이어도 배우자 쪽 주택은 §155⑤로 빠진다 (브라우저 경로)
 *
 * 계획서 `docs/00-pm/rental-155-20-merge-temp-composition.plan.md` PR-2 · 상속증여세과-20. 종전에는 비과세는 같았지만(①+⑤ 중첩)
 * 「세대 구성 요건 … 일시적 2주택·상속주택 특례로 제외되지 않습니다」 불성립 안내가 함께 떴다. 세액·경로는 anchor MT-1~9가 고정한다.
 */
import { test, expect } from "@playwright/test";
import { gotoTransferHoldingsStep } from "./_helpers/transfer-seed";
import { makeDefaultRentalUnit } from "../lib/stores/calc-wizard-asset-factory";

const row = (id: string, acquisitionDate: string, over: Record<string, unknown>) => ({
  id,
  region: "non_capital",
  regionCode: "4682025021",
  acquisitionDate,
  officialPrice: "100000000",
  isInherited: false,
  isLongTermRental: false,
  isApartment: false,
  isOfficetel: false,
  isUnsoldHousing: false,
  acquisitionOrigin: "general",
  ...over,
});

test("[MTE-1] 혼인 2022 → 임대주택 2023 취득(일시적 2주택 신규 주택) — ⑳ 세대 구성 성립 · 비과세 · 불성립 안내 없음", async ({ page }) => {
  await gotoTransferHoldingsStep(page, {
    houses: [row("r1", "2023-01-01", { isLongTermRental: true }), row("h3", "2015-01-01", { mergeOrigin: "counterpart_side" })],
    assetOver: {
      acquisitionDate: "2008-01-01",
      actualSalePrice: "1000000000",
      fixedAcquisitionPrice: "500000000",
      residenceInputMode: "interval",
      residencePeriods: [{ moveInDate: "2019-06-01", moveOutDate: "2024-06-01" }],
      rentalHousingException: {
        applyException: true,
        scenario: "A",
        priorRentalExemptionHistory: "none",
        rentalUnits: [
          {
            ...makeDefaultRentalUnit(),
            businessRegistrationDate: "2023-02-01",
            rentalRegistrationDate: "2023-02-01",
            standardPriceAtRentalStart: "250,000,000",
            rentalInputMode: "direct",
            rentalMonths: "16",
            requirementsConfirmed: true,
          },
        ],
      },
    },
    formOver: {
      transferDate: "2024-06-01",
      filingDate: "2024-08-31",
      contractTotalPrice: "1000000000",
      marriageDate: "2022-01-01",
      isFirstTransferredInMerge: true,
    },
  });
  for (const step of ["감면·공제", "가산세"]) {
    await page.getByRole("button", { name: step }).first().click();
  }
  const rp = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", {
    timeout: 30_000,
  });
  await page.getByRole("button", { name: /계산하기/ }).click();
  const resp = await rp;
  expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()}`).toBe(true);
  const result = ((await resp.json()) as { data: { result: { isExempt: boolean; totalTax: number; warnings?: string[] } } }).data.result;
  expect(result.isExempt).toBe(true);
  expect(result.totalTax).toBe(0);
  expect((result.warnings ?? []).filter((w) => w.includes("세대 구성 요건"))).toEqual([]);
  await expect(page.getByText(/1세대1주택 비과세/).first()).toBeVisible();
  await expect(page.getByText(/세대 구성 요건/)).toHaveCount(0);
});
