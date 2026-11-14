/**
 * E2E: 중과배제 교재 대조 화면 확인 (계획서 `docs/01-plan/features/surcharge-exclusion-textbook-gaps.plan.md`).
 *
 * | # | 화면 | 내용 | anchor |
 * |---|---|---|---|
 * | S1 | 계산기 보유 상황 명부 2호 마목 행 | 공고 전 취득·계약금 증빙 칸 → 요청 → 10호 배제(#3352) | `__tests__/api/transfer.route.ma1-deposit-carveout.anchor.test.ts` |
 * | S2 | 같은 명부 행 · 가목 자동말소 | 「말소일까지」 5% 라벨 · 해석례 안내 + 확인 필요 · 계약일 힌트(#3353) | `__tests__/components/house-entry-rent-cap-after-cancel.anchor.test.tsx` |
 * | S3 | 판정 메뉴 ② §155⑳ 임대주택 카드 | 마목 918 · 2021.2.16. 전 양도 → 증빙 칸 → ⑳ 요건 충족(#3352) | `__tests__/components/rental-unit-card-ma1-deposit-proof.anchor.test.tsx` |
 *
 * 실행: E2E_PORT=<worktree 포트> npx playwright test e2e/surcharge-exclusion-textbook-gaps.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { DIRECT_RESIDENCE } from "./_helpers/residence-direct";

const GANGNAM = "1168010100";
const PROOF_ROW = /^조정지역 공고일 전 취득 또는 계약금 지급 증빙 보유/;
const PROOF_CARD = /^조정대상지역 공고일 이전에 취득했거나, 계약하고 계약금을 지급한 증빙이 있습니다\./;

// ─────────────────────────────── S1·S2 계산기 명부 행 ───────────────────────────────

/** anchor MA 시료 — 강남 일반주택(2013-06-01 · 3억 → 20억) 2022-03-01 양도 · 명부 1행. */
function calcSeed(h2: Record<string, unknown>) {
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
        transferDate: "2022-03-01",
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
            acquisitionDate: "2019-01-01",
            officialPrice: "300000000",
            isInherited: false,
            isLongTermRental: true,
            isApartment: false,
            isOfficetel: false,
            isUnsoldHousing: false,
            isRegisteredRental: true,
            rentalType: "E",
            businessRegistrationDate: "2019-02-01",
            rentalRegistrationDate: "2019-02-01",
            rentalRegisteredDate: "2019-02-01",
            rentalStartDate: "2019-02-01",
            rentalStartOfficialPrice: "300000000",
            rentIncreaseUnder5Pct: true,
            isExcluded918Rule: true,
            hasContractDepositProof: false,
            ...h2,
          },
        ],
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function openRosterRow(page: Page, h2: Record<string, unknown> = {}) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), calcSeed(h2));
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
  return { row: sent.houses?.find((h) => h.id === "h2"), result: body.data.result };
}

test.describe("S1 명부 마목 행 — 공고 전 취득·계약금 증빙 칸", () => {
  test("[S1-1] 918 ✓ · 증빙 꺼짐 → 2주택 중과 1,141,772,500", async ({ page }) => {
    test.setTimeout(90_000);
    const dialog = await openRosterRow(page);
    await expect(dialog.getByRole("switch", { name: /^1주택 이상 보유 중 2018\.9\.14 이후 조정지역에서 새로 취득 \(결격\)/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(dialog.getByRole("switch", { name: PROOF_ROW })).toHaveAttribute("aria-checked", "false");
    await page.keyboard.press("Escape");

    const { row, result } = await calculate(page);
    expect(row?.hasContractDepositProof).toBeFalsy();
    expect(result.multiHouseSurchargeEvaluation.surchargeType).toBe("multi_house_2");
    expect(result.totalTax).toBe(1_141_772_500);
  });

  test("[S1-2] 증빙 칸을 켜면 요청에 실려 10호 배제 633,682,500", async ({ page }) => {
    test.setTimeout(90_000);
    const dialog = await openRosterRow(page);
    const sw = dialog.getByRole("switch", { name: PROOF_ROW });
    await sw.click();
    await expect(sw).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Escape");

    const { row, result } = await calculate(page);
    expect(row).toMatchObject({ isExcluded918Rule: true, hasContractDepositProof: true });
    expect(result.multiHouseSurchargeEvaluation.surchargeType).toBe("none");
    expect(result.totalTax).toBe(633_682_500);
  });

  test("[S1-3] 짝 — 가목 행에는 증빙 칸이 없다", async ({ page }) => {
    test.setTimeout(90_000);
    const dialog = await openRosterRow(page, {
      rentalType: "A",
      businessRegistrationDate: "2018-03-01",
      rentalRegistrationDate: "2018-03-01",
      rentalRegisteredDate: "2018-03-01",
      rentalStartDate: "2018-03-01",
      acquisitionDate: "2017-06-01",
      isExcluded918Rule: undefined,
    });
    await expect(dialog.getByRole("switch", { name: /임대료 증액 5% 이하 충족/ })).toBeVisible();
    await expect(dialog.getByRole("switch", { name: PROOF_ROW })).toHaveCount(0);
  });
});

test.describe("S2 명부 가목 자동말소 행 — 「말소일까지」 5%", () => {
  const cancelled = {
    rentalType: "A",
    acquisitionDate: "2017-06-01",
    businessRegistrationDate: "2018-03-01",
    rentalRegistrationDate: "2018-03-01",
    rentalRegisteredDate: "2018-03-01",
    rentalStartDate: "2018-03-01",
    rentalCancelledDate: "2022-01-01",
    rentalCancellationReason: "auto",
    rentIncreaseUnder5Pct: false,
    isExcluded918Rule: undefined,
  };

  test("[S2-1] 자동말소 → 라벨 「말소일까지」 · 0208·5655 안내 + 확인 필요 · 계약일 힌트 「말소일 전 계약 중」", async ({ page }) => {
    test.setTimeout(90_000);
    const dialog = await openRosterRow(page, cancelled);
    await expect(dialog.getByRole("switch", { name: /^말소일까지 임대료 증액 5% 이하 충족/ })).toBeVisible();
    const note = dialog.getByTestId("rent-cap-cancel-note-h2");
    await expect(note).toContainText("서면-2022-법규재산-0208");
    await expect(note).toContainText("서면-2021-법규재산-5655");
    await expect(note).toContainText("확인 필요");
    await expect(dialog.getByTestId("rent-increase-contract-date-h2")).toContainText("말소일 전 계약 중 가장 늦은 날");
  });

  test("[S2-2] 짝 — 말소 없음 → 종전 라벨 · 안내 없음", async ({ page }) => {
    test.setTimeout(90_000);
    const dialog = await openRosterRow(page, { ...cancelled, rentalCancelledDate: undefined, rentalCancellationReason: undefined });
    await expect(dialog.getByRole("switch", { name: /^임대료 증액 5% 이하 충족/ })).toBeVisible();
    await expect(dialog.getByRole("switch", { name: /^말소일까지/ })).toHaveCount(0);
    await expect(dialog.getByTestId("rent-cap-cancel-note-h2")).toHaveCount(0);
  });
});

// ─────────────────────────────── S3 판정 메뉴 §155⑳ 임대주택 카드 ───────────────────────────────

/** anchor OH16·MP 시료 — 거주주택(2012 취득 · 거주 60개월 · 10억) 2021-02-10 양도 · 임대 1호 마목(2020-08-01 등록 · 918). */
function judgmentSeed() {
  return {
    state: {
      formData: {
        transferDate: "2021-02-10",
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
                  businessRegistrationDate: "2020-08-01",
                  rentalRegistrationDate: "2020-08-01",
                  rentalRegisteredDate: "2020-08-01",
                  rentalCategory: "long_general",
                  rentalAcquisitionType: "purchase",
                  isApartment: false,
                  region: "seoul-metro",
                  standardPriceAtRentalStart: "300000000",
                  acquisitionOfficialPrice: "300000000",
                  isNationalSizeHousing: true,
                  rentalInputMode: "direct",
                  rentalMonths: "6",
                  isExcluded918Rule: true,
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
            acquisitionDate: "2020-07-01",
            officialPrice: "300000000",
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

test.describe("S3 판정 메뉴 ⑳ 마목 918 카드 — 증빙 칸", () => {
  test("[S3-1] 증빙 꺼짐 → ⑳ 요건 미충족", async ({ page }) => {
    test.setTimeout(90_000);
    await openJudgmentRentalCard(page);
    await expect(page.getByRole("switch", { name: PROOF_CARD })).toHaveAttribute("aria-checked", "false");
    const unit = await judge(page);
    expect(unit?.hasContractDepositProof).toBeFalsy();
    await expect(page.getByTestId("one-house-rental-verdict")).toContainText("요건 미충족");
  });

  test("[S3-2] 증빙 칸을 켜면 요청에 실려 ⑳ 요건 충족", async ({ page }) => {
    test.setTimeout(90_000);
    await openJudgmentRentalCard(page);
    const sw = page.getByRole("switch", { name: PROOF_CARD });
    await sw.click();
    await expect(sw).toHaveAttribute("aria-checked", "true");
    const unit = await judge(page);
    expect(unit).toMatchObject({ isExcluded918Rule: true, hasContractDepositProof: true });
    await expect(page.getByTestId("one-house-rental-verdict")).toHaveText("요건 충족");
  });
});
