/**
 * §155⑳ 거주주택 보유 2년 × §154① 단서 — 브라우저 경로 (계획서 `docs/00-pm/rental-residence-holding-proviso.plan.md`
 * Q-R1 (a)·Q-R2 (a), 2026-10-26). 엔진·④·⑧ 주장은 anchor가 고정한다
 * (`__tests__/tax-engine/transfer/rental-residence-holding-proviso.anchor.test.ts` · `__tests__/calc/rental-residence-holding-proviso.anchor.test.tsx`).
 * 여기서만 보이는 것: 명부에 장기임대 행이 있는 2주택 세대에서 단서 카드가 실제로 보이고(계산기 「보유 상황」) 옵션이 1·2가·3호로
 * 좁혀지며, 고른 값이 본문에 실려 ⑧을 지나 결론이 바뀌는가 · 고르지 않으면 종전대로 보유 2년에서 막히는가.
 *
 * 시료: 배우자(같은 세대) 2018-01-01 취득 → 2023-06-01 증여 → 본인 거주 18개월 · 증여 전 같은 세대 거주 36개월 →
 *   2024-12-01 양도(보유 1년 6개월) · 8억 · 비조정 · 장기임대주택 1호(A).
 */
import { test, expect, type Page } from "@playwright/test";
import { gotoTransferHoldingsStep, otherHouse } from "./_helpers/transfer-seed";

const NON_REGULATED = "4682025021";
const HOLDING_BLOCK = /장기임대주택 특례 — 거주주택 보유기간 2년 이상이 필요합니다/;
const HIDDEN_REASONS = [
  "proviso-reason-pre_contract",
  "proviso-reason-overseas_migration",
  "proviso-reason-overseas_residence",
  "proviso-reason-rental_4ho",
];

async function seed(page: Page) {
  await gotoTransferHoldingsStep(page, {
    houses: [otherHouse("rt", "2015-01-01", { regionCode: NON_REGULATED, officialPrice: "250000000", isLongTermRental: true })],
    assetOver: {
      acquisitionCause: "gift",
      acquisitionDate: "2023-06-01",
      regionCode: NON_REGULATED,
      addressJibun: "경상남도 테스트군 테스트면 1",
      actualSalePrice: "800000000",
      fixedAcquisitionPrice: "600000000",
      donorAcquisitionDate: "2018-01-01",
      giftDonorRelation: "spouse",
      giftSameHousehold: "yes",
      giftHouseholdHoldingStartDate: "2018-01-01",
      giftPriorHouseholdResidenceMonths: "36",
      residenceInputMode: "direct",
      residencePeriodMonthsAsset: "18",
      rentalHousingException: {
        applyException: true,
        scenario: "A",
        priorRentalExemptionHistory: "none",
        rentalUnits: [
          {
            businessRegistrationDate: "2018-06-01",
            rentalRegistrationDate: "2018-06-01",
            rentalCategory: "long_general",
            rentalAcquisitionType: "purchase",
            isApartment: false,
            region: "non-metro",
            isExcluded918Rule: false,
            standardPriceAtRentalStart: "250,000,000",
            rentalLandArea: "",
            rentalTotalFloorArea: "",
            hasMinimum2Units: false,
            rentalMonths: "96",
            rentalAutoTermination: false,
            requirementsConfirmed: true,
          },
        ],
      },
    },
    formOver: { transferDate: "2024-12-01", filingDate: "2024-12-31", contractTotalPrice: "800000000" },
  });
}

async function goToCalculate(page: Page) {
  for (const step of ["감면·공제", "가산세"]) {
    await page.getByRole("button", { name: step }).first().click();
  }
}

test("[RHE-1] ★ 장기임대 행이 있는 2주택 — 단서 카드는 1·2가·3호만 · 3호 → ⑧ 통과 · ⑳ 비과세 · 근거에 단서", async ({ page }) => {
  test.setTimeout(120_000);
  await seed(page);
  await expect(page.getByTestId("proviso-reason-unavoidable")).toBeVisible();
  for (const id of HIDDEN_REASONS) await expect(page.getByTestId(id)).toHaveCount(0);
  await expect(page.getByText(/1호·2호가목·3호 사유로 보유기간 2년만 면제됩니다/)).toBeVisible();
  await page.getByTestId("proviso-reason-unavoidable").click();
  await goToCalculate(page);
  const rp = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 30_000 });
  await page.getByRole("button", { name: /계산하기/ }).click();
  const resp = await rp;
  expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()}`).toBe(true);
  expect(resp.request().postDataJSON().oneHouseExemptionProviso).toEqual({ reason: "unavoidable" });
  const json = (await resp.json()) as { data: { result: { isExempt: boolean; totalTax: number; exemptReason?: string } } };
  expect(json.data.result.isExempt).toBe(true);
  expect(json.data.result.totalTax).toBe(0);
  expect(json.data.result.exemptReason).toBe("장기임대주택 보유자 거주주택 비과세 (§155⑳ · §154① 단서 3호 부득이)");
  await expect(page.getByText(/정면 해석례가 없어 확인이 필요합니다/).first()).toBeVisible();
});

test("[RHE-2] 단서를 고르지 않으면 종전대로 보유 2년에서 막힌다", async ({ page }) => {
  await seed(page);
  await goToCalculate(page);
  await page.getByRole("button", { name: /계산하기/ }).click();
  await expect(page.getByText(HOLDING_BLOCK).first()).toBeVisible();
});
