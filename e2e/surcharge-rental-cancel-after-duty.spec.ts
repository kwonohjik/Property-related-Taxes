/**
 * E2E: 다주택 중과 — 임대의무기간 후 말소 신청(민간임대주택에 관한 특별법 §6①3호) 화면 확인
 * (계획서 `docs/00-pm/surcharge-rental-cancel-after-duty.plan.md` · #3391).
 *
 * | # | 화면 | 내용 | anchor |
 * |---|---|---|---|
 * | S-1 ★ | 계산기 「보유 상황」 양도 주택 2호 선언 · 가목 | 「의무기간 후 말소 신청」 → 요청 `after_duty` → 3주택 중과배제 310,431,000 | `__tests__/tax-engine/multi-house-surcharge/rental-cancel-after-duty.anchor.test.ts` AD-1 |
 * | S-2 | 같은 화면 · 짝 | 「자진말소」 → 3주택 중과 750,486,000 + 「의무기간 후 말소 신청」을 고르라는 안내 | 같은 파일 AD-8 |
 * | R-1 | 명부 행 편집 모달 · 다른 주택 양도 | 「의무기간 후 말소 신청」 → 2주택 중과(Q-1 그 주택만) + 확인 필요 고지 | 같은 파일 AD-7 |
 *
 * 실행: E2E_PORT=<worktree 포트> npx playwright test e2e/surcharge-rental-cancel-after-duty.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { DIRECT_RESIDENCE } from "./_helpers/residence-direct";

const GANGNAM = "1168010100";

/** 3076 사실관계 축약 — 가목 다세대 · 2015-01-01 등록·임대 개시 · 2021-03-01 의무기간 후 말소 신청 */
const RENTAL = {
  isLongTermRental: true,
  isApartment: false,
  isRegisteredRental: true,
  rentalType: "A",
  businessRegistrationDate: "2015-01-01",
  rentalRegistrationDate: "2015-01-01",
  rentalRegisteredDate: "2015-01-01",
  rentalStartDate: "2015-01-01",
  rentalStartOfficialPrice: "300000000",
  rentIncreaseUnder5Pct: true,
  isExcluded918Rule: false,
  hasContractDepositProof: false,
  rentalCancelledDate: "2021-03-01",
};

const general = (id: string) => ({
  id,
  region: "capital",
  regionCode: GANGNAM,
  acquisitionOrigin: "general",
  acquisitionDate: "2014-01-01",
  officialPrice: "300000000",
  isInherited: false,
  isLongTermRental: false,
  isApartment: true,
  isOfficetel: false,
  isUnsoldHousing: false,
});

function seed(o: { houses: object[]; sellingRental?: object; count: string }) {
  return {
    state: {
      formData: {
        householdNoPresaleRightsConfirmed: true,
        assets: [
          {
            ...makeDefaultAsset(1),
            ...DIRECT_RESIDENCE,
            addressJibun: "서울 강남구 테스트동 1-1",
            assetKind: "housing",
            acquisitionCause: "purchase",
            acquisitionDate: "2014-06-01",
            fixedAcquisitionPrice: "500,000,000",
            regionCode: GANGNAM,
            residencePeriodMonthsAsset: "0",
          },
        ],
        transferDate: "2026-08-01",
        contractTotalPrice: "1,500,000,000",
        householdHousingCount: o.count,
        isOneHousehold: true,
        isRegulatedArea: true,
        wasRegulatedAtAcquisition: false,
        residencePeriodMonths: "0",
        houses: o.houses,
        ...(o.sellingRental ? { sellingHouseExclusion: { longTermRental: o.sellingRental } } : {}),
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function open(page: Page, s: object) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((v) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(v)), s);
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByRole("button", { name: "보유 상황" }).first().click();
}

async function calculate(page: Page) {
  for (const step of ["감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  const rp = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", {
    timeout: 30_000,
  });
  await page.getByRole("button", { name: /계산하기/ }).click();
  const resp = await rp;
  const errText = resp.ok() ? "" : (await resp.text()).slice(0, 600);
  expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()} ${errText}`).toBe(true);
  const sent = resp.request().postDataJSON() as { houses?: Record<string, unknown>[] };
  const body = (await resp.json()) as {
    data: { result: { totalTax: number; multiHouseSurchargeEvaluation: { surchargeType: string; warnings: string[] } } };
  };
  return {
    row: sent.houses?.find((h) => h.id === "h2"),
    selling: sent.houses?.find((h) => h.id === "selling"),
    result: body.data.result,
  };
}

const PICK_HINT = "「의무기간 후 말소 신청」을 고르세요";
const OTHER_HOUSE = "다른 주택을 양도하는 이번 판정에서는";

test.describe("양도 주택 = 의무기간 후 말소 신청한 가목 임대주택(3076)", () => {
  const sellingSeed = () => seed({ houses: [general("h2"), general("h3")], sellingRental: RENTAL, count: "3" });

  test("[S-1] 「의무기간 후 말소 신청」 → 요청 after_duty → 3주택 중과배제 310,431,000", async ({ page }) => {
    test.setTimeout(90_000);
    await open(page, sellingSeed());
    await page.getByTestId("selling-rental-cancel-reason-after-duty").click();
    const { selling, result } = await calculate(page);
    expect(selling).toMatchObject({ rentalCancelledDate: "2021-03-01", rentalCancellationReason: "after_duty" });
    expect(result.multiHouseSurchargeEvaluation.surchargeType).toBe("none");
    expect(result.multiHouseSurchargeEvaluation.warnings.some((w) => w.includes(PICK_HINT))).toBe(false);
    expect(result.totalTax).toBe(310_431_000);
  });

  test("[S-2] 짝 — 「자진말소」 → 3주택 중과 750,486,000 + 사유 재선택 안내", async ({ page }) => {
    test.setTimeout(90_000);
    await open(page, sellingSeed());
    await page.getByTestId("selling-rental-cancel-reason-voluntary").click();
    const { selling, result } = await calculate(page);
    expect(selling?.rentalCancellationReason).toBe("voluntary");
    expect(result.multiHouseSurchargeEvaluation.surchargeType).toBe("multi_house_3plus");
    expect(result.multiHouseSurchargeEvaluation.warnings.some((w) => w.includes(PICK_HINT))).toBe(true);
    await expect(page.getByText(PICK_HINT).first()).toBeVisible();
    expect(result.totalTax).toBe(750_486_000);
  });
});

test.describe("명부 행 = 의무기간 후 말소 임대주택 · 다른 주택 양도(Q-1)", () => {
  test("[R-1] 「의무기간 후 말소 신청」 → 2주택 중과 + 확인 필요 고지", async ({ page }) => {
    test.setTimeout(90_000);
    await open(page, seed({ houses: [{ ...general("h2"), ...RENTAL }], count: "2" }));
    await page.getByRole("button", { name: "주택 1 편집" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByTestId("house-rental-cancel-reason-h2-after-duty").click();
    await page.keyboard.press("Escape");
    const { row, result } = await calculate(page);
    expect(row).toMatchObject({ rentalCancellationReason: "after_duty" });
    expect(result.multiHouseSurchargeEvaluation.surchargeType).toBe("multi_house_2");
    expect(result.multiHouseSurchargeEvaluation.warnings.some((w) => w.includes(OTHER_HOUSE))).toBe(true);
    await expect(page.getByText(OTHER_HOUSE).first()).toBeVisible();
  });
});
