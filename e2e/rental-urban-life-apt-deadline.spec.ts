/**
 * 「주택법」 도시형 생활주택인 아파트 — 아파트 양도기한(소령 §167의3⑪ 2027.12.31.)만 비적용 (브라우저 경로).
 *
 * 소령 §167의3①2호 가목2) 괄호 「「주택법」에 따른 도시형 생활주택인 아파트는 제외한다. 이하 이 목, 나목2)ㆍ라목8) 및
 * 마목4)에서 같다」. 칸 두 곳의 화면 → 요청 → 결과를 본다(세액·술어 짝은 anchor가 고정한다).
 *
 * | # | 칸 | anchor |
 * |---|---|---|
 * | V10 | 판정 메뉴 ② §155⑳ 임대주택 카드 (#2897) | `__tests__/calc/rental-155-20-urban-life-apt-deadline.anchor.test.ts` |
 * | V11 | 계산기 보유 상황 명부 2호 장기임대 행 (#2899) | `__tests__/calc/roster-2ho-urban-life-apt-deadline.anchor.test.ts` |
 * | V12 | 계산기 보유 상황 「양도 주택이 장기임대주택인 경우」 2호 선언 | `__tests__/calc/selling-2ho-urban-life-apt-deadline.anchor.test.ts` |
 *
 * 둘 다 2028-06-01 양도(기한 경과)에서 도시형 아님 ↔ 도시형의 결론이 갈리는 짝으로 단언한다.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { DIRECT_RESIDENCE } from "./_helpers/residence-direct";
import { expandAssetSection } from "./_helpers/expandAssetSection";

const URBAN = /^「주택법」에 따른 도시형 생활주택인 아파트입니다\./;
const GANGNAM = "1168010100";

// ─────────────────────────────── V11 계산기 명부 2호 행 ───────────────────────────────

/** anchor R-1·R-2와 같은 시료 — 강남 · 양도 주택 2016 취득 10억 · 명부 1행 = 가목 장기임대 아파트(2018.1.1. 등록 · 3억 · 8년). */
function calcSeed() {
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1),
            ...DIRECT_RESIDENCE,
            addressJibun: "서울 강남구 테스트동 1-1",
            regionCode: GANGNAM,
            assetKind: "housing",
            acquisitionCause: "purchase",
            acquisitionDate: "2016-08-12",
            actualSalePrice: "1,000,000,000",
            fixedAcquisitionPrice: "500,000,000",
            useEstimatedAcquisition: false,
            residencePeriodMonthsAsset: "0",
          },
        ],
        transferDate: "2028-06-01",
        contractTotalPrice: "1,000,000,000",
        householdHousingCount: "2",
        householdNoPresaleRightsConfirmed: true,
        isOneHousehold: true,
        isRegulatedArea: true,
        wasRegulatedAtAcquisition: true,
        houses: [
          {
            id: "h2",
            region: "capital",
            regionCode: GANGNAM,
            acquisitionOrigin: "general",
            acquisitionDate: "2015-06-01",
            officialPrice: "300000000",
            isInherited: false,
            isLongTermRental: true,
            isApartment: true,
            isOfficetel: false,
            isUnsoldHousing: false,
            isRegisteredRental: true,
            rentalType: "A",
            rentalRegistrationDate: "2018-01-01", rentalRegisteredDate: "2018-01-01",
            businessRegistrationDate: "2018-01-01",
            rentalStartOfficialPrice: "300000000",
            rentIncreaseUnder5Pct: true,
            rentalStartDate: "2018-01-01", // PR-2 Q-3 — 연수 칸 대신 임대개시일
            rentalAptDeadlineExtension: { status: "none" },
          },
        ],
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function openRosterRow(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), calcSeed());
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByRole("button", { name: "보유 상황" }).first().click();
  await page.getByRole("button", { name: "주택 1 편집" }).click();
  return page.getByRole("dialog");
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
    data: { result: { totalTax: number; multiHouseSurchargeEvaluation: { surchargeType: string } } };
  };
  return { row: sent.houses?.find((h) => h.id === "h2"), selling: sent.houses?.find((h) => h.id === "selling"), result: body.data.result };
}

test.describe("V11 계산기 명부 2호 장기임대 행 — 도시형 생활주택 아파트 칸", () => {
  test("[V11-1] 도시형 아님(⑪ 연장 사유 없음) → 2주택 중과 299,816,000", async ({ page }) => {
    test.setTimeout(90_000);
    const dialog = await openRosterRow(page);
    await expect(dialog.getByRole("switch", { name: URBAN })).toHaveAttribute("aria-checked", "false");
    await expect(dialog.getByTestId("apt-deadline-ext-rental-h2")).toBeVisible();
    await page.keyboard.press("Escape");

    const { row, result } = await calculate(page);
    expect(row).not.toHaveProperty("isUrbanLifeHousingApartment");
    expect(row?.rentalAptDeadlineExtension).toEqual({ confirmedNone: true });
    expect(result.multiHouseSurchargeEvaluation.surchargeType).toBe("multi_house_2");
    expect(result.totalTax).toBe(299_816_000);
  });

  test("[V11-2] 칸을 켜면 ⑪ 연장 질문이 사라지고 요청에 실려 중과 배제 141,966,000", async ({ page }) => {
    test.setTimeout(90_000);
    const dialog = await openRosterRow(page);
    const sw = dialog.getByRole("switch", { name: URBAN });
    await sw.click();
    await expect(sw).toHaveAttribute("aria-checked", "true");
    await expect(dialog.getByTestId("apt-deadline-ext-rental-h2")).toHaveCount(0);
    await page.keyboard.press("Escape");

    const { row, result } = await calculate(page);
    expect(row?.isUrbanLifeHousingApartment).toBe(true);
    expect(row).not.toHaveProperty("rentalAptDeadlineExtension");
    expect(result.multiHouseSurchargeEvaluation.surchargeType).toBe("none");
    expect(result.totalTax).toBe(141_966_000);
  });
});

// ─────────────────────────────── V12 계산기 양도 주택 2호 선언 ───────────────────────────────

/** anchor S-1·S-2와 같은 시료 — V11 시료에서 장기임대를 명부 행이 아니라 **양도 주택 자신**에 둔다(명부 행 = 일반 아파트). */
function sellingSeed() {
  const s = calcSeed();
  const h2 = s.state.formData.houses[0];
  const { rentalType, rentalRegistrationDate, rentalRegisteredDate, businessRegistrationDate, rentalStartOfficialPrice, rentIncreaseUnder5Pct, rentalStartDate, rentalAptDeadlineExtension } = h2;
  Object.assign(s.state.formData, {
    houses: [{ ...h2, isLongTermRental: false, isRegisteredRental: false, rentalType: undefined, rentalAptDeadlineExtension: undefined }],
    sellingHouseExclusion: {
      longTermRental: {
        isLongTermRental: true,
        isApartment: true,
        isRegisteredRental: true,
        rentalType,
        rentalRegistrationDate,
        rentalRegisteredDate,
        businessRegistrationDate,
        rentalStartOfficialPrice,
        rentIncreaseUnder5Pct,
        rentalStartDate,
        rentalAptDeadlineExtension,
      },
    },
  });
  return s;
}

async function openSellingRental(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), sellingSeed());
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByRole("button", { name: "보유 상황" }).first().click();
}

test.describe("V12 계산기 양도 주택 2호 선언 — 도시형 생활주택 아파트 칸", () => {
  test("[V12-1] 도시형 아님 → 2주택 중과 299,816,000", async ({ page }) => {
    test.setTimeout(90_000);
    await openSellingRental(page);
    await expect(page.getByRole("switch", { name: URBAN })).toHaveAttribute("aria-checked", "false");
    await expect(page.getByTestId("apt-deadline-ext-rental-selling")).toBeVisible();

    const { selling, result } = await calculate(page);
    expect(selling).not.toHaveProperty("isUrbanLifeHousingApartment");
    expect(result.multiHouseSurchargeEvaluation.surchargeType).toBe("multi_house_2");
    expect(result.totalTax).toBe(299_816_000);
  });

  test("[V12-2] 칸을 켜면 ⑪ 연장 질문이 사라지고 요청에 실려 중과 배제 141,966,000", async ({ page }) => {
    test.setTimeout(90_000);
    await openSellingRental(page);
    const sw = page.getByRole("switch", { name: URBAN });
    await sw.click();
    await expect(sw).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("apt-deadline-ext-rental-selling")).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(
          () => JSON.parse(sessionStorage.getItem("transfer-tax-wizard") ?? "{}").state?.formData?.sellingHouseExclusion?.longTermRental?.isUrbanLifeHousingApartment,
        ),
      )
      .toBe(true);

    const { selling, result } = await calculate(page);
    expect(selling?.isUrbanLifeHousingApartment).toBe(true);
    expect(selling).not.toHaveProperty("rentalAptDeadlineExtension");
    expect(result.multiHouseSurchargeEvaluation.surchargeType).toBe("none");
    expect(result.totalTax).toBe(141_966_000);
  });
});

// ─────────────────────────────── V10 판정 메뉴 §155⑳ 임대주택 카드 ───────────────────────────────

/**
 * anchor U-1·U-2와 같은 거주주택(2012 취득 · 거주 60개월 · 10억 · 2028-06-01 양도) + 임대 1호(가목 장기일반 매입 아파트 ·
 * 2018.3.1. 등록 · 3억 · 96개월). 명부에도 같은 임대 아파트를 넣는다 — 그래야 ⑳ 성립 여부가 판정 결론을 가른다.
 */
function judgmentSeed() {
  return {
    state: {
      formData: {
        transferDate: "2028-06-01",
        isOneHousehold: true,
        contractTotalPrice: "1000000000",
        assets: [
          {
            assetKind: "housing",
            acquisitionDate: "2012-08-12",
            addressJibun: "서울특별시 종로구 청운동 1",
            residenceInputMode: "direct",
            residencePeriodMonthsAsset: "60",
            rentalHousingException: {
              applyException: true,
              scenario: "A",
              priorRentalExemptionHistory: "none",
              rentalUnits: [
                {
                  unitId: "u1",
                  businessRegistrationDate: "2018-03-01",
                  rentalRegistrationDate: "2018-03-01", rentalRegisteredDate: "2018-03-01",
                  rentalCategory: "long_general",
                  rentalAcquisitionType: "purchase",
                  isApartment: true,
                  region: "seoul-metro",
                  standardPriceAtRentalStart: "300000000",
                  acquisitionOfficialPrice: "300000000",
                  isNationalSizeHousing: true,
                  hasMinimum2Units: true,
                  rentalInputMode: "direct",
                  rentalMonths: "96",
                  requirementsConfirmed: true,
                },
              ],
            },
          },
        ],
        houses: [
          {
            id: "r1",
            region: "capital",
            acquisitionDate: "2018-01-01",
            officialPrice: "300000000",
            isInherited: false,
            isLongTermRental: true,
            isApartment: true,
            isOfficetel: false,
            isUnsoldHousing: false,
            acquisitionOrigin: "general",
          },
        ],
      },
    },
    version: 0,
  };
}

/** 판정 메뉴 ② 양도 대상 주택(§155⑳ 섹션)을 연다. `?new=1`은 store를 리셋하므로 붙이지 않는다. */
async function openJudgmentRentalCard(page: Page) {
  await page.goto("/calc/one-house-exemption");
  await expect(page.getByTestId("one-house-household")).toBeVisible();
  await page.evaluate((s) => sessionStorage.setItem("one-house-judgment-wizard", JSON.stringify(s)), judgmentSeed());
  await page.reload();
  await expect(page.getByTestId("one-house-household")).toBeVisible();
  await page.getByRole("button", { name: "다음" }).click();
  await expect(page.getByText("② 양도 대상 주택")).toBeVisible();
}

async function judge(page: Page) {
  await page.getByRole("button", { name: "다음" }).click();
  const rp = page.waitForResponse((r) => r.url().includes("/api/calc/one-house-exemption") && r.request().method() === "POST");
  await page.getByTestId("one-house-judge-cta").click();
  const resp = await rp;
  expect(resp.ok(), `판정 API ${resp.status()} ${(await resp.text()).slice(0, 400)}`).toBe(true);
  await expect(page.getByTestId("one-house-judgment-result")).toBeVisible();
  const sent = resp.request().postDataJSON() as { rentalHousingException?: { rentalUnits?: Record<string, unknown>[] } };
  return sent.rentalHousingException?.rentalUnits?.[0];
}

test.describe("V10 판정 메뉴 §155⑳ 임대주택 카드 — 도시형 생활주택 아파트 칸", () => {
  test("[V10-1] 도시형 아님(⑪ 연장 사유 없음) → 양도기한 경과로 ⑳ 요건 미충족", async ({ page }) => {
    test.setTimeout(90_000);
    await openJudgmentRentalCard(page);
    await expect(page.getByRole("switch", { name: URBAN })).toHaveAttribute("aria-checked", "false");
    await page.getByTestId("apt-deadline-ext-none-unit-0").click();

    const unit = await judge(page);
    expect(unit).not.toHaveProperty("isUrbanLifeHousingApartment");
    expect(unit?.aptDeadlineExtension).toEqual({ confirmedNone: true });
    await expect(page.getByTestId("one-house-rental-verdict")).toContainText("요건 미충족");
  });

  test("[V10-2] 칸을 켜면 ⑪ 연장 질문이 사라지고 요청에 실려 ⑳ 요건 충족 · 비과세", async ({ page }) => {
    test.setTimeout(90_000);
    await openJudgmentRentalCard(page);
    const sw = page.getByRole("switch", { name: URBAN });
    await sw.click();
    await expect(sw).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("apt-deadline-ext-unit-0")).toHaveCount(0);

    const unit = await judge(page);
    expect(unit?.isUrbanLifeHousingApartment).toBe(true);
    expect(unit).not.toHaveProperty("aptDeadlineExtension");
    await expect(page.getByTestId("one-house-rental-verdict")).toHaveText("요건 충족");
    await expect(page.getByTestId("one-house-verdict")).toHaveText("비과세");
  });

  /**
   * 판정 사실이 계산기로 넘어가 세액 요청에도 실린다.
   *
   * 🔑 계산기 「보유 상황」은 소재지로 조정대상지역을 자동 판별해 store에 적는다(`useRegulatedAreaAutoTip` →
   *    `/api/address/regulated-area`, 로컬 판정).
   *    store에 적히기 전에 계산하면 요청의 `isRegulatedArea`가 false라 중과가 빠진다(실측 124,366,000 ↔ 적힌 뒤 190,366,000)
   *    — store 값이 true가 된 뒤 계산한다.
   */
  for (const c of [
    { name: "[V10-3] 도시형 → ⑳ 성립 RH-A1 · 세액 0", urban: true, applied: true, surchargeType: "none", tax: 0 },
    {
      name: "[V10-4] 짝 — 도시형 아님(연장 사유 없음) → ⑳ 불성립 · 2주택 중과 190,366,000",
      urban: false,
      applied: false, // V-7: 불성립도 판정(applied=false)을 결과에 싣는다 — 종전엔 상세가 없었다
      surchargeType: "multi_house_2",
      tax: 190_366_000,
    },
  ]) {
    test(`${c.name} (「이 결과로 세액 계산」 경유)`, async ({ page }) => {
      test.setTimeout(120_000);
      await openJudgmentRentalCard(page);
      if (c.urban) await page.getByRole("switch", { name: URBAN }).click();
      else await page.getByTestId("apt-deadline-ext-none-unit-0").click();
      await judge(page);

      await page.getByTestId("one-house-to-calculator").click();
      await expect(page).toHaveURL(/\/calc\/transfer-tax$/);
      await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
      await expandAssetSection(page, 3, 0);
      await page.getByTestId("fixed-acquisition-price").fill("500000000");
      await page.getByRole("button", { name: "보유 상황" }).first().click();
      await expect
        .poll(() =>
          page.evaluate(() => JSON.parse(sessionStorage.getItem("transfer-tax-wizard") ?? "{}").state?.formData?.isRegulatedArea),
        )
        .toBe(true);
      for (const step of ["감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
      const rp = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", {
        timeout: 30_000,
      });
      await page.getByRole("button", { name: /계산하기/ }).click();
      const resp = await rp;
      expect(resp.ok(), `계산 API ${resp.status()} ${resp.ok() ? "" : (await resp.text()).slice(0, 600)}`).toBe(true);
      const sent = resp.request().postDataJSON() as {
        isRegulatedArea?: boolean;
        rentalHousingException?: { rentalUnits?: Record<string, unknown>[] };
      };
      expect(sent.isRegulatedArea).toBe(true);
      const unit = sent.rentalHousingException?.rentalUnits?.[0];
      expect(unit).toBeDefined();
      expect(unit?.isUrbanLifeHousingApartment).toBe(c.urban ? true : undefined);
      const { result } = (
        (await resp.json()) as {
          data: {
            result: {
              totalTax: number;
              rentalHousingExceptionDetail?: { applied?: boolean; scenarioId?: string };
              multiHouseSurchargeEvaluation: { surchargeType: string };
            };
          };
        }
      ).data;
      expect(result.rentalHousingExceptionDetail?.applied).toBe(c.applied);
      expect(result.rentalHousingExceptionDetail?.scenarioId).toBe("RH-A1");
      expect(result.multiHouseSurchargeEvaluation.surchargeType).toBe(c.surchargeType);
      expect(result.totalTax).toBe(c.tax);
    });
  }
});
