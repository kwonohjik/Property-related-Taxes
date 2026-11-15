/**
 * E2E: Q-8 다주택 중과배제 2호 승계 화면 확인 (계획서 `docs/00-pm/rental-155-20-textbook-gaps.plan.md` §9 · #3381).
 *
 * | # | 화면 | 내용 | anchor |
 * |---|---|---|---|
 * | S-1 ★ | 계산기 「보유 상황」 양도 주택 2호 선언 | 상속 ON → 피상속인 등록 사실 3칸 입력 → 요청에 실림 → 2호 중과배제 356,631,000 | `__tests__/api/transfer.route.surcharge-inherited-rental-decedent-reg.anchor.test.ts` I-1 |
 * | S-2 | 같은 화면 · 짝 | 피상속인 칸 비움 → 요청에 없음 → 2주택 중과 640,761,000 | 같은 파일 I-2 |
 * | S-3 | 같은 화면 · ⑧ | 사업자등록일만 입력 → 「함께 입력하세요」로 막힘 | `__tests__/calc/rental-period-decedent-registration.anchor.test.ts` V-3 |
 * | R-1 ★ | 명부 행 편집 모달 | 피상속인 등록 사실·1959 안내·증여 승계 고지 → 10호 배제 301,191,000 | 같은 route 파일 I-5 |
 * | R-2 | 같은 모달 · 사목 | 「임대의무기간 1/2 이상 충족」 칩 아래 0225·5310 안내 | `__tests__/components/rental-period-decedent-registration.anchor.test.tsx` DR-5 |
 *
 * 실행: E2E_PORT=<worktree 포트> npx playwright test e2e/surcharge-inherited-rental-decedent-reg.spec.ts
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { DIRECT_RESIDENCE } from "./_helpers/residence-direct";

const GANGNAM = "1168010100";

/** 1959 사실관계 — 가목 다세대 · 상속인 등록 2019-06-20 · 피상속인 임대 39개월 */
const INHERITED = {
  isLongTermRental: true,
  isApartment: false,
  isRegisteredRental: true,
  rentalType: "A",
  businessRegistrationDate: "2019-06-20",
  rentalRegistrationDate: "2019-06-20",
  rentalRegisteredDate: "2019-06-20",
  rentalStartDate: "2019-06-20",
  rentalStartOfficialPrice: "300000000",
  rentIncreaseUnder5Pct: true,
  isInheritedRental: true,
  decedentRentalMonths: "39",
};
const DECEDENT = {
  decedentBusinessRegistrationDate: "2016-03-10",
  decedentRentalRegistrationDate: "2016-03-10",
  decedentRentalRegisteredDate: "2016-03-15",
};

const general = {
  id: "h2",
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
};

function seed(o: { sellingAcq: string; houses: object[]; sellingRental?: object }) {
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
            acquisitionDate: o.sellingAcq,
            fixedAcquisitionPrice: "500,000,000",
            regionCode: GANGNAM,
            residencePeriodMonthsAsset: "0",
          },
        ],
        transferDate: "2026-08-01",
        contractTotalPrice: "1,500,000,000",
        householdHousingCount: "2",
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

async function fillNthDate(scope: Locator, i: number, y: string, m: string, d: string) {
  const year = scope.getByLabel("연도").nth(i);
  await year.fill(y);
  await scope.getByLabel("월").nth(i).fill(m);
  await scope.getByLabel("일").nth(i).fill(d);
  await expect(year).toHaveValue(y);
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
  return {
    row: sent.houses?.find((h) => h.id === "h2"),
    selling: sent.houses?.find((h) => h.id === "selling"),
    result: body.data.result,
  };
}

const sellingSeed = (extra: object = {}) =>
  seed({ sellingAcq: "2019-06-15", houses: [general], sellingRental: { ...INHERITED, ...extra } });

test.describe("Q-8 계산기 양도 주택 2호 선언 — 상속 임대주택(1959)", () => {
  test("[S-1] 피상속인 등록 사실 3칸 입력 → 요청에 실림 → 2호 중과배제 356,631,000", async ({ page }) => {
    test.setTimeout(90_000);
    await open(page, sellingSeed());
    const block = page.getByTestId("selling-rental-decedent-registration");
    await expect(block).toBeVisible();
    await expect(page.getByTestId("selling-rental-decedent-registration-hint")).toContainText("서면-2020-법규재산-1959");
    await expect(page.getByTestId("selling-rental-household-gift-note")).toContainText("확인 필요");
    await fillNthDate(block, 0, "2016", "3", "10");
    await fillNthDate(block, 1, "2016", "3", "10");
    await fillNthDate(block, 2, "2016", "3", "15");
    await expect
      .poll(() =>
        page.evaluate(() => {
          const l = JSON.parse(sessionStorage.getItem("transfer-tax-wizard") ?? "{}").state?.formData?.sellingHouseExclusion?.longTermRental;
          return [l?.decedentBusinessRegistrationDate, l?.decedentRentalRegistrationDate, l?.decedentRentalRegisteredDate].join(",");
        }),
      )
      .toBe("2016-03-10,2016-03-10,2016-03-15");

    const { selling, result } = await calculate(page);
    expect(selling).toMatchObject(DECEDENT);
    expect(result.multiHouseSurchargeEvaluation.surchargeType).toBe("none");
    expect(result.totalTax).toBe(356_631_000);
  });

  test("[S-2] 짝 — 피상속인 칸 비움 → 요청에 없음 → 2주택 중과 640,761,000", async ({ page }) => {
    test.setTimeout(90_000);
    await open(page, sellingSeed());
    const { selling, result } = await calculate(page);
    expect(selling).not.toHaveProperty("decedentBusinessRegistrationDate");
    expect(result.multiHouseSurchargeEvaluation.surchargeType).toBe("multi_house_2");
    expect(result.totalTax).toBe(640_761_000);
  });

  test("[S-3] ⑧ 사업자등록일만 입력 → 「함께 입력하세요」로 막힘", async ({ page }) => {
    test.setTimeout(90_000);
    await open(page, sellingSeed({ decedentBusinessRegistrationDate: "2016-03-10" }));
    await page.getByRole("button", { name: /계산하기|다음/ }).last().click();
    await expect(page.getByText(/피상속인 등록 사실을 넣으려면 세무서 사업자등록일과 지자체 임대사업자 등록 신청일을 함께 입력하세요/).first()).toBeVisible();
  });
});

const rosterSeed = (extra: object = {}) =>
  seed({
    sellingAcq: "2013-06-01",
    houses: [{ ...general, acquisitionDate: "2019-06-15", ...INHERITED, ...extra }],
  });

async function openRow(page: Page, s: object) {
  await open(page, s);
  await page.getByRole("button", { name: "주택 1 편집" }).click();
  return page.getByRole("dialog");
}

test.describe("Q-8 계산기 명부 행 — 상속 임대주택", () => {
  test("[R-1] 피상속인 등록 사실·안내 표시 → 10호 배제 301,191,000", async ({ page }) => {
    test.setTimeout(90_000);
    const dialog = await openRow(page, rosterSeed(DECEDENT));
    await expect(dialog.getByTestId("house-h2-rental-decedent-registration")).toBeVisible();
    await expect(dialog.getByTestId("house-h2-rental-decedent-registration-hint")).toContainText("2018년 3월 31일까지 사업자등록등");
    await expect(dialog.getByTestId("house-h2-rental-household-gift-note")).toContainText("기획재정부 재산세제과-1591");
    await page.keyboard.press("Escape");

    const { row, result } = await calculate(page);
    expect(row).toMatchObject(DECEDENT);
    expect(result.multiHouseSurchargeEvaluation.surchargeType).toBe("none");
    expect(result.totalTax).toBe(301_191_000);
  });

  test("[R-2] 사목 → 1/2 칩 아래 포괄양수 안내(0225·5310)", async ({ page }) => {
    test.setTimeout(90_000);
    const dialog = await openRow(page, rosterSeed({ rentalType: "G", saMokBaseArticle: "가" }));
    const note = dialog.getByTestId("half-duty-assumption-note-h2");
    await expect(note).toBeVisible();
    await expect(note).toContainText("기준-2021-법무재산-0225");
    await expect(note).toContainText("서면-2020-법규재산-5310");
  });
});
