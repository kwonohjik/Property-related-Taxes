/**
 * E2E: §155⑳ 교재 대조(268~312) 후속 화면 확인 (계획서 `docs/00-pm/rental-155-20-textbook-gaps.plan.md`).
 *
 * | # | 화면 | 내용 | anchor |
 * |---|---|---|---|
 * | Q3 | 계산기 보유 상황 명부 가목 행 | 2018-03-01 자동말소 → 부칙 제7조 안내 · 요청 · 10호 배제 633,682,500 · 간주 고지(#3378) | `__tests__/api/transfer.route.surcharge-addenda7-deemed-cancel.anchor.test.ts` |
 * | A | 판정 메뉴 ② ⑳ 임대주택 카드 · 구법 건설 | 다목 라벨 · 규모요건 칸 · 비수도권 4억 → 요건 충족 / 매입 짝 → 미충족(#3370) | `__tests__/tax-engine/transfer/rental-155-20-pre2018-construction.anchor.test.ts` |
 * | T | 같은 카드 · 구법 매입 말소 | 말소 토글 · 등록 유형 0972 안내 · 말소 4필드 전송(#3366) | `__tests__/components/rental-155-23-pre2018.test.tsx` |
 * | B | 같은 카드 · 구법 매입 아파트 | 도시형 생활주택 질문 · 자진말소 → 1/2 30개월 안내(#3373) | `__tests__/components/rental-155-20-pre2018-deadline-half.test.tsx` |
 * | I | 같은 카드 · 상속 아파트(상속인 2021-03 등록) | 피상속인 등록일 칸·1959 안내 · 피상속인 2019-06 → 요청 donorRegistration · 요건 충족 / 비움 → 미충족 | `__tests__/api/rental-155-20-succession.route.anchor.test.ts` I-1~I-3 |
 *
 * 실행: E2E_PORT=<worktree 포트> npx playwright test e2e/rental-155-20-textbook-gaps.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { DIRECT_RESIDENCE } from "./_helpers/residence-direct";

const GANGNAM = "1168010100";

// ─────────────────────────────── Q3 계산기 명부 행 ───────────────────────────────

/** anchor R 시료 — 강남 일반주택(2013-06-01 · 3억 → 20억) 2022-03-01 양도 · h2 가목 단기(2014-03-01 등록 · 2018-03-01 의무기간 종료). */
function calcSeed(transferDate: string) {
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
            acquisitionDate: "2013-06-01",
            fixedAcquisitionPrice: "300,000,000",
            regionCode: GANGNAM,
            residencePeriodMonthsAsset: "0",
          },
        ],
        transferDate,
        contractTotalPrice: "2,000,000,000",
        householdHousingCount: "2",
        isOneHousehold: true,
        isRegulatedArea: true,
        wasRegulatedAtAcquisition: false,
        residencePeriodMonths: "0",
        houses: [
          {
            id: "h2",
            region: "capital",
            regionCode: GANGNAM,
            acquisitionOrigin: "general",
            acquisitionDate: "2013-01-01",
            officialPrice: "300000000",
            isInherited: false,
            isLongTermRental: true,
            isApartment: false,
            isOfficetel: false,
            isUnsoldHousing: false,
            isRegisteredRental: true,
            rentalType: "A",
            businessRegistrationDate: "2014-03-01",
            rentalRegistrationDate: "2014-03-01",
            rentalRegisteredDate: "2014-03-01",
            rentalStartDate: "2014-03-01",
            rentalStartOfficialPrice: "300000000",
            rentIncreaseUnder5Pct: true,
            isExcluded918Rule: false,
            hasContractDepositProof: false,
            rentalCancelledDate: "2018-03-01",
          },
        ],
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function openRosterRow(page: Page, transferDate = "2022-03-01") {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), calcSeed(transferDate));
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
    data: { result: { totalTax: number; multiHouseSurchargeEvaluation: { surchargeType: string; warnings: string[] } } };
  };
  return { row: sent.houses?.find((h) => h.id === "h2"), result: body.data.result };
}

const DEEMED = "부칙 제7조에 따라 2020.8.18.에 등록이 말소된 것으로 봅니다";

test.describe("Q3 명부 가목 행 — 2020.8.18. 전 의무기간 종료 자동말소(부칙 제7조)", () => {
  test("[Q3-1] 자동말소 · 말소일 2018-03-01 → 안내 문구 · 요청에 실리고 10호 배제 633,682,500 + 간주 고지", async ({ page }) => {
    test.setTimeout(90_000);
    const dialog = await openRosterRow(page);
    await expect(dialog.getByText(/2020\.8\.18\. 전에\s*끝났다면 그 종료일을 넣어도 2020\.8\.18\.에 말소된 것으로 계산합니다/)).toBeVisible();
    await dialog.getByTestId("house-rental-cancel-reason-h2-auto").click();
    await page.keyboard.press("Escape");

    const { row, result } = await calculate(page);
    expect(row).toMatchObject({ rentalCancelledDate: "2018-03-01", rentalCancellationReason: "auto" });
    expect(result.multiHouseSurchargeEvaluation.surchargeType).toBe("none");
    expect(result.totalTax).toBe(633_682_500);
    expect(result.multiHouseSurchargeEvaluation.warnings.some((w) => w.includes(DEEMED))).toBe(true);
    await expect(page.getByText(DEEMED).first()).toBeVisible();
  });

  test("[Q3-2] 짝 — 자진말소 → 간주 없음 · 2주택 중과 1,141,772,500", async ({ page }) => {
    test.setTimeout(90_000);
    const dialog = await openRosterRow(page);
    await dialog.getByTestId("house-rental-cancel-reason-h2-voluntary").click();
    await page.keyboard.press("Escape");

    const { row, result } = await calculate(page);
    expect(row?.rentalCancellationReason).toBe("voluntary");
    expect(result.multiHouseSurchargeEvaluation.surchargeType).toBe("multi_house_2");
    expect(result.totalTax).toBe(1_141_772_500);
    expect(result.multiHouseSurchargeEvaluation.warnings.some((w) => w.includes(DEEMED))).toBe(false);
  });

  test("[Q3-3] 2020-05-01 양도 → 양도일엔 등록 중 651,057,000 + 「아직 등록 중」 고지", async ({ page }) => {
    test.setTimeout(90_000);
    const dialog = await openRosterRow(page, "2020-05-01");
    await dialog.getByTestId("house-rental-cancel-reason-h2-auto").click();
    await page.keyboard.press("Escape");

    const { result } = await calculate(page);
    expect(result.totalTax).toBe(651_057_000);
    await expect(page.getByText(/아직 등록 중인 주택으로 판정했습니다/).first()).toBeVisible();
  });
});

// ─────────────────────────────── A·T·B 판정 메뉴 ⑳ 임대주택 카드 ───────────────────────────────

/** 거주주택(2009 취득 · 거주 60개월 · 10억) 양도 · 임대 1호 구 임대주택법(2010-10-01 등록). */
function judgmentSeed(transferDate: string, unit: Record<string, unknown>) {
  return {
    state: {
      formData: {
        transferDate,
        isOneHousehold: true,
        contractTotalPrice: "1000000000",
        assets: [
          {
            assetKind: "housing",
            acquisitionDate: "2009-01-01",
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
                  businessRegistrationDate: "2010-10-01",
                  rentalRegistrationDate: "2010-10-01",
                  rentalRegisteredDate: "2010-10-01",
                  rentalCategory: "pre_2018",
                  rentalAcquisitionType: "purchase",
                  isApartment: false,
                  region: "non-metro",
                  standardPriceAtRentalStart: "250000000",
                  rentalInputMode: "direct",
                  rentalMonths: "72",
                  requirementsConfirmed: true,
                  ...unit,
                },
              ],
            },
          },
        ],
        houses: [
          {
            id: "r1",
            region: "non_capital",
            acquisitionDate: "2010-09-01",
            officialPrice: "250000000",
            isInherited: false,
            isLongTermRental: true,
            isApartment: false,
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

async function openJudgmentRentalCard(page: Page, transferDate: string, unit: Record<string, unknown>) {
  await page.goto("/calc/one-house-exemption");
  await expect(page.getByTestId("one-house-household")).toBeVisible();
  await page.evaluate((s) => sessionStorage.setItem("one-house-judgment-wizard", JSON.stringify(s)), judgmentSeed(transferDate, unit));
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

test.describe("A 구 임대주택법 건설임대 = 다목(#3370)", () => {
  const construction = {
    rentalAcquisitionType: "construction",
    standardPriceAtRentalStart: "400000000",
    rentalLandArea: "200",
    rentalTotalFloorArea: "100",
    hasMinimum2Units: true,
  };

  test("[A-1] 건설 · 비수도권 4억 → 다목 라벨 · 규모요건 칸 · 요건 충족", async ({ page }) => {
    test.setTimeout(90_000);
    await openJudgmentRentalCard(page, "2024-06-01", construction);
    await expect(page.getByText("다목 · 건설 장기(5년)")).toBeVisible();
    await expect(page.getByText("건설임대 규모요건")).toBeVisible();
    const unit = await judge(page);
    expect(unit).toMatchObject({ rentalCategory: "pre_2018", rentalAcquisitionType: "construction" });
    await expect(page.getByTestId("one-house-rental-verdict")).toHaveText("요건 충족");
  });

  test("[A-2] 짝 — 매입 · 비수도권 4억 → 구법 라벨 · 규모요건 칸 없음 · 요건 미충족(3억 상한)", async ({ page }) => {
    test.setTimeout(90_000);
    await openJudgmentRentalCard(page, "2024-06-01", { ...construction, rentalAcquisitionType: "purchase" });
    await expect(page.getByText("구 임대주택법(5년)")).toBeVisible();
    await expect(page.getByText("건설임대 규모요건")).toHaveCount(0);
    const unit = await judge(page);
    expect(unit?.rentalAcquisitionType).toBe("purchase");
    await expect(page.getByTestId("one-house-rental-verdict")).toContainText("요건 미충족");
  });
});

test.describe("T 구 임대주택법 매입 말소 → §155㉓ 입력(#3366)", () => {
  test("[T-1] 말소 토글 · 단기 0972 안내 · 말소 4필드 전송", async ({ page }) => {
    test.setTimeout(90_000);
    await openJudgmentRentalCard(page, "2025-06-01", {
      rentalMonths: "60",
      standardPriceAtRentalStart: "300000000",
      region: "seoul-metro",
      rentalAutoTermination: true,
      terminationReason: "auto",
      terminatedRegistrationType: "short_term",
      registrationCancellationDate: "2015-10-01",
    });
    await expect(page.getByText("자진말소 또는 자동말소로 임대사업자 등록이 말소된 임대주택입니다.")).toBeVisible();
    await expect(page.getByTestId("rental-terminated-type-pre2018-hint-0")).toContainText("0972");
    const unit = await judge(page);
    expect(unit).toMatchObject({
      rentalAutoTermination: true,
      terminationReason: "auto",
      terminatedRegistrationType: "short_term",
    });
    expect(String(unit?.registrationCancellationDate)).toContain("2015-10-01");
  });
});

test.describe("B 구 임대주택법 매입 아파트 — ⑪ 양도기한 · ㉓1호 1/2(#3373)", () => {
  const apt = { isApartment: true, region: "seoul-metro", standardPriceAtRentalStart: "300000000", rentalMonths: "120" };

  test("[B-1] 등록 중 → 도시형 생활주택 질문이 보인다", async ({ page }) => {
    test.setTimeout(90_000);
    await openJudgmentRentalCard(page, "2024-06-01", apt);
    await expect(page.getByText("「주택법」에 따른 도시형 생활주택인 아파트입니다.")).toBeVisible();
  });

  test("[B-2] 자진말소 → 등록 유형 안내에 30개월 · 부칙<제13499호> 제3조③3호 · 질문 숨김", async ({ page }) => {
    test.setTimeout(90_000);
    await openJudgmentRentalCard(page, "2024-06-01", {
      ...apt,
      rentalAutoTermination: true,
      terminationReason: "voluntary",
      terminatedRegistrationType: "short_term",
      registrationCancellationDate: "2022-01-10",
    });
    const hint = page.getByTestId("rental-terminated-type-pre2018-hint-0");
    await expect(hint).toContainText("30개월");
    await expect(hint).toContainText("부칙<제13499호> 제3조③3호");
    await expect(page.getByText("「주택법」에 따른 도시형 생활주택인 아파트입니다.")).toHaveCount(0);
  });
});

test.describe("I 상속 임대주택 — 피상속인 등록일로 목 판정(1959 유추)", () => {
  const inherited = {
    businessRegistrationDate: "2021-03-01",
    rentalRegistrationDate: "2021-03-01",
    rentalRegisteredDate: "2021-03-01",
    rentalCategory: "long_general",
    isApartment: true,
    region: "seoul-metro",
    standardPriceAtRentalStart: "300000000",
    rentalMonths: "36",
    rentalSuccession: "inheritance",
    decedentRentalMonths: "24",
  };
  const decedent = {
    donorBusinessRegistrationDate: "2019-06-01",
    donorRentalRegistrationDate: "2019-06-01",
    donorRentalRegisteredDate: "2019-06-01",
  };

  test("[I-1] 피상속인 2019-06 → 피상속인 칸·안내 · 요청에 donorRegistration · 요건 충족", async ({ page }) => {
    test.setTimeout(90_000);
    await openJudgmentRentalCard(page, "2024-06-01", { ...inherited, ...decedent });
    await expect(page.getByText("피상속인 지자체 임대사업자 등록 신청일")).toBeVisible();
    await expect(page.getByTestId("rental-decedent-registration-note-0")).toContainText("서면-2020-법규재산-1959");
    const unit = await judge(page);
    expect(unit).toMatchObject({ succession: { kind: "inheritance", predecessorMonths: 24 } });
    expect((unit?.donorRegistration as { rentalRegistrationDate?: string })?.rentalRegistrationDate?.slice(0, 10)).toBe("2019-06-01");
    await expect(page.getByTestId("one-house-rental-verdict")).toHaveText("요건 충족");
  });

  test("[I-2] 짝 — 피상속인 날짜 비움 → 요청에 없음 · 상속인 2021-03 마목 아파트 제한으로 요건 미충족", async ({ page }) => {
    test.setTimeout(90_000);
    await openJudgmentRentalCard(page, "2024-06-01", inherited);
    await expect(page.getByTestId("rental-decedent-registration-note-0")).toBeVisible();
    const unit = await judge(page);
    expect(unit?.donorRegistration).toBeUndefined();
    await expect(page.getByTestId("one-house-rental-verdict")).toContainText("요건 미충족");
  });
});
