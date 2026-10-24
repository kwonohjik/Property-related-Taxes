/**
 * §155⑳ 세대 구성 × 조특법 §98 감면주택 — 브라우저 경로 (계획서 `docs/00-pm/rental-155-20-b-154-10-and-q4.plan.md` PR-2 · Q-4 (c))
 *
 * 조특령 §98② 「…해당 미분양주택 외의 다른 주택만을 기준으로 하여 「소득세법」제89조제1항제3호를 적용한다」가 §99의2·§99의4와 효과가 같아
 * ⑳ 세대 구성에서 §98 주택을 뺀다(사용자 결정 2026-10-24). 임대주택(2007 취득)이 일시적 2주택의 신규 주택이 아니어도 ⑳ A가 선다 —
 * 종전에는 세대 구성 불성립(겹침 해석 미확보)으로 과세 124,366,000이었다. 세액·경로별 단언은 anchor(CR-1~10b)가 고정한다.
 */
import { test, expect } from "@playwright/test";
import { gotoTransferHoldingsStep } from "./_helpers/transfer-seed";
import { makeDefaultRentalUnit } from "../lib/stores/calc-wizard-asset-factory";

const ROW = { region: "non_capital", regionCode: "4682025021", officialPrice: "100000000", isInherited: false, isApartment: false, isOfficetel: false, isUnsoldHousing: false, acquisitionOrigin: "general" };

test("[CRE-1] ⑳ 성립 + §98 감면주택 행(Q-4 (c)) · 임대주택 2007 취득 — ⑳ 비과세 · 겹침 「확인 필요」 없음", async ({ page }) => {
  await gotoTransferHoldingsStep(page, {
    houses: [
      { ...ROW, id: "r1", acquisitionDate: "2007-01-01", isLongTermRental: true },
      {
        ...ROW,
        id: "h3",
        acquisitionDate: "1996-06-01",
        isLongTermRental: false,
        countExclusion: {
          kind: "special",
          special: { article: "unsold_98", houseAcquisitionDate: "1996-06-01", houseContractDate: "1996-06-01", isNationalHousing: false, requirementsConfirmed: true },
        },
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
            standardPriceAtRentalStart: "250,000,000",
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
  const rp = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 30_000 });
  await page.getByRole("button", { name: /계산하기/ }).click();
  const resp = await rp;
  expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()}`).toBe(true);
  const result = ((await resp.json()) as { data: { result: { isExempt: boolean; totalTax: number; exemptReason: string } } }).data.result;
  expect(result.isExempt).toBe(true);
  expect(result.totalTax).toBe(0);
  expect(result.exemptReason).toBe("장기임대주택 보유자 거주주택 비과세 (§155⑳)");
  await expect(page.getByText(/겹쳐 적용하는지는 해석이 확인되지 않았습니다/)).toHaveCount(0);
  await expect(page.getByText(/세대 구성 요건\(「장기임대주택과 그 밖의 1주택」\)을 충족하지 못했습니다/)).toHaveCount(0);
});
