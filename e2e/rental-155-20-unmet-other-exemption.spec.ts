/**
 * §155⑳ 불성립 × 일시적 2주택 — 브라우저 경로 (계획서 `docs/00-pm/rental-155-20-unmet-blocks-155-1.plan.md` D-1·D-2 · Q-1 (a))
 *
 * 임대주택이 일시적 2주택의 신규 주택(2023 취득)이면, §155⑳이 서지 않아도(임대개시 기준시가 7억) 일시적 2주택 비과세가 결과에 실린다.
 * 종전에는 조기 반환 게이트가 막아 과세 60,621,000이었다. 세액·경로별 단언은 anchor(UO-1~9)가 고정한다.
 */
import { test, expect } from "@playwright/test";
import { gotoTransferHoldingsStep } from "./_helpers/transfer-seed";
import { makeDefaultRentalUnit } from "../lib/stores/calc-wizard-asset-factory";

test("[UOE-1] §155⑳ 불성립 + 임대주택이 일시적 2주택 신규 주택 — 비과세 · 불성립 안내", async ({ page }) => {
  await gotoTransferHoldingsStep(page, {
    houses: [
      {
        id: "r1",
        region: "non_capital",
        regionCode: "4682025021",
        acquisitionDate: "2023-01-01",
        officialPrice: "100000000",
        isInherited: false,
        isLongTermRental: true,
        isApartment: false,
        isOfficetel: false,
        isUnsoldHousing: false,
        acquisitionOrigin: "general",
      },
    ],
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
            standardPriceAtRentalStart: "700,000,000",
            rentalInputMode: "direct",
            rentalMonths: "16",
            requirementsConfirmed: true,
          },
        ],
      },
    },
    formOver: { transferDate: "2024-06-01", filingDate: "2024-08-31", contractTotalPrice: "1000000000" },
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
  const result = ((await resp.json()) as { data: { result: { isExempt: boolean; totalTax: number; exemptReason: string } } }).data.result;
  expect(result.isExempt).toBe(true);
  expect(result.totalTax).toBe(0);
  expect(result.exemptReason).toBe("일시적 2주택 비과세");
  await expect(page.getByText(/장기임대주택 거주주택 특례\(소득세법 시행령 §155⑳\)는 요건을 충족하지 못해 적용하지 않았습니다/).first()).toBeVisible();
});

/**
 * B(직전거주주택보유주택) — ⑳이 서지 않아도 일시적 2주택으로 1세대1주택이면 영 §154⑩이 걸어 직전거주주택 양도일 후 기간분만 비과세한다
 * (계획서 `docs/00-pm/rental-155-20-b-154-10-and-q4.plan.md` Q-1 (a) · 종전 F-1 결과는 안분 없는 비과세 0). 세액은 anchor UO-3이 고정한다.
 */
test("[UOE-3] §155⑳ 불성립 B + 임대주택이 일시적 2주택 신규 주택 — §154⑩ 안분 · 안내", async ({ page }) => {
  await gotoTransferHoldingsStep(page, {
    houses: [
      {
        id: "r1",
        region: "non_capital",
        regionCode: "4682025021",
        acquisitionDate: "2023-01-01",
        officialPrice: "100000000",
        isInherited: false,
        isLongTermRental: true,
        isApartment: false,
        isOfficetel: false,
        isUnsoldHousing: false,
        acquisitionOrigin: "general",
      },
    ],
    assetOver: {
      acquisitionDate: "2008-01-01",
      actualSalePrice: "1000000000",
      fixedAcquisitionPrice: "500000000",
      residenceInputMode: "interval",
      residencePeriods: [{ moveInDate: "2019-06-01", moveOutDate: "2024-06-01" }],
      rentalHousingException: {
        applyException: true,
        scenario: "B",
        priorRentalExemptionHistory: "none",
        priorResidenceTransferDate: "2020-01-01",
        postRegistrationResidenceMonths: "30",
        standardPriceAtAcquisitionForPhrp: "100,000,000",
        standardPriceAtPriorTransfer: "200,000,000",
        standardPriceAtTransferForPhrp: "300,000,000",
        rentalUnits: [
          {
            ...makeDefaultRentalUnit(),
            businessRegistrationDate: "2023-02-01",
            rentalRegistrationDate: "2023-02-01",
            standardPriceAtRentalStart: "700,000,000",
            rentalInputMode: "direct",
            rentalMonths: "16",
            requirementsConfirmed: true,
          },
        ],
      },
    },
    formOver: { transferDate: "2024-06-01", filingDate: "2024-08-31", contractTotalPrice: "1000000000" },
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
  const result = ((await resp.json()) as { data: { result: { isExempt: boolean; totalTax: number } } }).data.result;
  expect(result.isExempt).toBe(false);
  expect(result.totalTax).toBe(50_171_000);
  // 같은 문장이 접힌 「계산 과정」에도 있다 — 결과 상단 경고(보이는 요소)를 본다.
  await expect(
    page.locator("li", { hasText: /다른 특례\(「일시적 2주택 비과세」\)에 따라 1세대1주택이 되지만 이 주택은 직전거주주택보유주택이라/ }).first(),
  ).toBeVisible();
});
