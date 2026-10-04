/**
 * transfer-multi-special-house-exclusion-card.spec.ts
 *
 * 다건 결과 「건별 상세」에 단건과 같은 감면주택 판정 카드(`SpecialHouseExclusionDetailCard`)가 뜬다.
 * 계획서 `docs/00-pm/one-house-exemption-fix.plan.md` §9.8 「다건 감면주택 판정 카드」(사용자 결정 2026-10-04).
 *
 * 시료 = #1954 MS-1(§99의2 명부 행 + 장기임대 행 + §155⑳ 거주주택 특례 · 강남 · 2015 취득 · 2026-09-18 양도 20억).
 * 이 사례는 §155⑳ 특례 조기반환 경로라 종전에는 단건·다건 모두 카드가 뜨지 않았다(엔진 echo 누락).
 * 음성 짝: 같은 폼에서 명부 행의 조특법 선언만 뺀 일반 행 → 카드 없음.
 *
 * 실행: E2E_PORT=3217 npx playwright test e2e/transfer-multi-special-house-exclusion-card.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";

import { putCalculationRecord } from "./_helpers/history-seed";
import { openHistoryModal } from "./_helpers/navigation";
import { createDefaultTransferFormData } from "../lib/stores/calc-wizard-store";
import { makeDefaultRentalUnit } from "../lib/stores/calc-wizard-asset-factory";
import type { HouseEntry } from "../lib/stores/calc-wizard-asset-nbl";

const GANGNAM = "1168010100";

const ROW: HouseEntry = {
  id: "h3",
  region: "capital",
  regionCode: GANGNAM,
  acquisitionDate: "2013-06-01",
  officialPrice: "300000000",
  isInherited: false,
  isLongTermRental: false,
  isApartment: true,
  isOfficetel: false,
  isUnsoldHousing: false,
};
const SPECIAL_ROW: HouseEntry = {
  ...ROW,
  countExclusion: {
    kind: "special",
    special: {
      article: "unsold_99_2",
      houseAcquisitionDate: "2013-06-01",
      houseContractDate: "2013-06-01",
      isNationalHousing: false,
      requirementsConfirmed: true,
    },
  },
};
const RENTAL_ROW: HouseEntry = { ...ROW, id: "h4", acquisitionDate: "2016-01-01", isLongTermRental: true, isApartment: false };

/** 앱 기본 폼에서 출발(`feedback_fixture_default_masks_gate_defect`) — #1954 anchor `form()`·`withRental()`과 같은 값 */
function propertyForm(houses: HouseEntry[]) {
  const f = createDefaultTransferFormData();
  f.isOneHousehold = true;
  f.assets[0] = {
    ...f.assets[0],
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing",
    acquisitionDate: "2015-01-01",
    fixedAcquisitionPrice: "300,000,000",
    regionCode: GANGNAM,
    residenceInputMode: "direct",
    residencePeriodMonthsAsset: "48",
    rentalHousingException: {
      ...f.assets[0].rentalHousingException,
      applyException: true,
      scenario: "A",
      rentalUnits: [
        {
          ...makeDefaultRentalUnit(),
          businessRegistrationDate: "2019-03-01",
          rentalRegistrationDate: "2019-03-01",
          standardPriceAtRentalStart: "250,000,000",
          rentalInputMode: "direct",
          rentalMonths: "90",
          requirementsConfirmed: true,
        },
      ],
    },
  };
  return Object.assign(f, {
    transferDate: "2026-09-18",
    contractTotalPrice: "2,000,000,000",
    residencePeriodMonths: "0",
    householdHousingCount: String(houses.length + 1),
    isRegulatedArea: true,
    wasRegulatedAtAcquisition: false,
    houses,
  });
}

function record(id: string, title: string, houses: HouseEntry[]) {
  return {
    id,
    userId: "local-user",
    taxType: "transfer",
    title,
    inputData: {
      __multiTransfer: true,
      taxYear: 2026,
      properties: [{ propertyId: "sp1", propertyLabel: "거주주택", completionPercent: 100, form: propertyForm(houses) }],
      activePropertyIndex: 0,
      activeStep: "settings",
      annualBasicDeductionUsed: "0",
      basicDeductionAllocation: "EARLIEST_TRANSFER",
    },
    resultData: { determinedTax: 0, totalTax: 0, properties: [{ propertyId: "sp1" }] },
    taxLawVersion: "2026",
    linkedCalculationId: null,
    clientId: null,
    createdAt: "2026-10-04T00:00:00.000Z",
    updatedAt: "2026-10-04T00:00:00.000Z",
  };
}

/** 이력 시드 → 다건 화면 → 불러오기 → 세액 계산 → 건별 상세 펼침 */
async function calculate(page: Page, rec: ReturnType<typeof record>) {
  await page.goto("/history");
  await putCalculationRecord(page, rec);
  await page.goto("/calc/transfer-tax/multi");
  await openHistoryModal(page, page.getByTestId("multi-load-history-btn").first(), page.getByText(rec.title));
  await page.getByTestId(`load-record-${rec.id}`).click();

  const respPromise = page.waitForResponse(
    (r) => r.url().includes("/api/calc/transfer/multi") && r.request().method() === "POST",
    { timeout: 20000 },
  );
  await page.getByRole("button", { name: "세액 계산" }).click();
  const resp = await respPromise;
  expect(resp.status()).toBe(200);
  await expect(page.getByText("건별 상세").first()).toBeVisible({ timeout: 20000 });
  await page.locator('[data-print-id="per-property"]').getByText("거주주택", { exact: true }).click();
  return (await resp.json()) as { data: { totalTax: number; properties: { specialHouseExclusionDetail?: unknown }[] } };
}

test.describe("다건 건별 상세 — 감면주택 판정 카드", () => {
  test("§99의2 명부 행 + §155⑳ → 카드가 단건과 같은 내용(그 건 명부의 보유 주택 1)으로 뜬다", async ({ page }) => {
    test.setTimeout(120_000);
    const json = await calculate(page, record("e2e-multi-special-card", "다건 감면주택 카드 (E2E)", [SPECIAL_ROW, RENTAL_ROW]));
    expect(json.data.totalTax).toBe(102_086_600);

    const card = page.locator('[data-print-id="per-property"]').getByTestId("special-house-exclusion-card");
    await expect(card).toBeVisible();
    await expect(card.getByText("조특법 감면주택 보유 — 주택수 제외")).toBeVisible();
    await expect(card.getByText("제외 1채")).toBeVisible();
    await expect(card.getByTestId("count-exclusion-house-ref")).toHaveText("보유 주택 1 (2013-06-01 취득) —");
    await expect(card.getByText("§99의2 신축주택등")).toBeVisible();
    await expect(card.getByText("근거 조문: 조특법 §99의2②")).toBeVisible();
  });

  test("(음성) 조특법 선언 없는 일반 행 → 카드 없음", async ({ page }) => {
    test.setTimeout(120_000);
    const json = await calculate(page, record("e2e-multi-special-card-neg", "다건 감면주택 카드 음성 (E2E)", [ROW, RENTAL_ROW]));
    expect(json.data.properties[0].specialHouseExclusionDetail).toBeUndefined();
    await expect(page.locator('[data-print-id="per-property"]').getByText("양도차익", { exact: false }).first()).toBeVisible();
    await expect(page.getByTestId("special-house-exclusion-card")).toHaveCount(0);
  });
});
