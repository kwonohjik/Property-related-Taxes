/**
 * §154⑩ 단독 경로(직전거주주택보유주택 · 공동보유 장기임대주택 0호) × §154① 단서 — 브라우저 경로
 * (사용자 결정 2026-10-26 V-R3 (a) · `docs/00-pm/rental-residence-holding-proviso.plan.md` §10). 엔진·④·⑧ 주장은 anchor가 고정한다
 * (`__tests__/tax-engine/rental-housing-exception/phrp-154-10-proviso.anchor.test.ts` · `__tests__/calc/phrp-154-10-proviso.anchor.test.tsx`).
 * 여기서만 보이는 것: 1주택 세대의 단서 카드에서 3호를 고르면 본문에 실려 ⑧을 지나 §161 안분 결과에 단서 근거·확인 필요 고지가 보이는가 ·
 * 고르지 않으면 종전대로 보유 2년에서 막히는가.
 *
 * 시료: 8억(취득가 6억) · 비조정 · 1주택 · 2018-06-01 취득·임대 등록 · 직전거주주택 2019-03-01 양도 · 2020-03-01 양도(보유 1년 9개월) · 거주 13개월.
 */
import { test, expect, type Page } from "@playwright/test";
import { gotoTransferHoldingsStep } from "./_helpers/transfer-seed";

const NON_REGULATED = "4682025021";
const HOLDING_BLOCK = /장기임대주택 특례 — 거주주택 보유기간 2년 이상이 필요합니다/;

async function seed(page: Page) {
  await gotoTransferHoldingsStep(page, {
    houses: [],
    assetOver: {
      acquisitionCause: "purchase",
      acquisitionDate: "2018-06-01",
      regionCode: NON_REGULATED,
      addressJibun: "경상남도 테스트군 테스트면 1",
      actualSalePrice: "800000000",
      fixedAcquisitionPrice: "600000000",
      residenceInputMode: "direct",
      residencePeriodMonthsAsset: "13",
      rentalHousingException: {
        applyException: true,
        scenario: "B",
        priorRentalExemptionHistory: "none",
        rentalUnits: [],
        priorResidenceTransferDate: "2019-03-01",
        wasRegisteredRentalOrChildcare: true,
        standardPriceAtAcquisitionForPhrp: "300,000,000",
        standardPriceAtPriorTransfer: "350,000,000",
        standardPriceAtTransferForPhrp: "400,000,000",
        postRegistrationResidenceMonths: "",
        residenceTransitionUnderAddendum: false,
        residenceTransitionBasis: "",
      },
    },
    formOver: { transferDate: "2020-03-01", filingDate: "2020-03-31", contractTotalPrice: "800000000" },
  });
}

async function goToCalculate(page: Page) {
  for (const step of ["감면·공제", "가산세"]) {
    await page.getByRole("button", { name: step }).first().click();
  }
}

test("[PHE-1] ★ 1주택 · §154⑩ 단독 — 3호 → ⑧ 통과 · §161 안분 · 단서 근거·확인 필요 고지", async ({ page }) => {
  test.setTimeout(120_000);
  await seed(page);
  await page.getByTestId("proviso-reason-unavoidable").click();
  await goToCalculate(page);
  const rp = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 30_000 });
  await page.getByRole("button", { name: /계산하기/ }).click();
  const resp = await rp;
  expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()}`).toBe(true);
  expect(resp.request().postDataJSON().oneHouseExemptionProviso).toEqual({ reason: "unavoidable" });
  const json = (await resp.json()) as { data: { result: { determinedTax: number; steps: { formula: string }[] } } };
  expect(json.data.result.determinedTax).toBeGreaterThan(0);
  expect(json.data.result.steps.some((s) => s.formula === "§154⑩ + §161 — RH-B1 시나리오 적용 · §154① 단서 3호 부득이")).toBe(true);
  await expect(page.getByText(/§154⑩ 경로에 §154① 단서를 적용한 정면 해석례가 없어 확인이 필요합니다/).first()).toBeVisible();
});

test("[PHE-2] 단서를 고르지 않으면 종전대로 보유 2년에서 막힌다", async ({ page }) => {
  await seed(page);
  await goToCalculate(page);
  await page.getByRole("button", { name: /계산하기/ }).click();
  await expect(page.getByText(HOLDING_BLOCK).first()).toBeVisible();
});
