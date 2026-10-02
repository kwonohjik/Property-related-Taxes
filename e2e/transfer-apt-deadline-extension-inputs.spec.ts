/**
 * E2E: 소령 §167의3⑪ 기한 연장 사실 — 2호 명부 행(장기임대 가목 아파트) 입력 → 요청 본문 → 결과 화면.
 *
 * 2주택 세대(양도 주택 강남 일반 + 다른 주택 장기임대 가목 아파트), 양도 2028-03-01:
 *   ① 「모름」(기본) — 행에 `rentalAptDeadlineExtension`이 실리지 않고 결과에 「판정하지 못해」 고지
 *   ② 「연장 사유 없음」 — `{ confirmedNone: true }`가 실리고 고지가 사라지며 중과가 적용된다
 *   ③ 「연장 사유 있음」 + 등록말소일 2027-06-01 — 날짜가 실리고(기한 2028-06-01) 중과 배제 · 고지 없음
 *
 * 세액은 dev 서버의 세율 원천(DB/fallback)에 따라 달라질 수 있어 단언하지 않는다 — 금액 anchor는
 * `__tests__/api/transfer.route.apt-deadline-extension-inputs.anchor.test.ts`.
 *
 * 실행: E2E_PORT=<worktree 포트> npx playwright test e2e/transfer-apt-deadline-extension-inputs.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

const GANGNAM = "1168010100";
const PENDING = "판정하지 못해";

function seedForm() {
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1),
            addressJibun: "서울 강남구 테스트동 1-1",
            assetKind: "housing",
            acquisitionCause: "purchase",
            acquisitionDate: "2013-06-01",
            fixedAcquisitionPrice: "100,000,000",
            regionCode: GANGNAM,
          },
        ],
        transferDate: "2028-03-01",
        contractTotalPrice: "1,500,000,000",
        householdHousingCount: "2",
        isOneHousehold: true,
        isRegulatedArea: true,
        wasRegulatedAtAcquisition: false,
        residencePeriodMonths: "0",
        houses: [
          {
            id: "house_rental_1",
            region: "capital",
            regionCode: GANGNAM,
            acquisitionDate: "2017-06-01",
            officialPrice: "300000000",
            isInherited: false,
            isLongTermRental: true,
            isApartment: true,
            isOfficetel: false,
            isUnsoldHousing: false,
            isRegisteredRental: true,
            rentalRegistrationDate: "2018-01-01",
            businessRegistrationDate: "2018-01-01",
            rentalPeriodYears: "9",
            rentalType: "A",
            rentalStartOfficialPrice: "300000000",
            rentIncreaseUnder5Pct: true,
          },
        ],
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function openHolding(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), seedForm());
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByRole("button", { name: "보유 상황" }).first().click();
}

async function calculate(page: Page) {
  for (const step of ["감면·공제", "가산세"]) {
    await page.getByRole("button", { name: step }).first().click();
  }
  const calcResponse = page.waitForResponse(
    (r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: /계산하기/ }).click();
  const resp = await calcResponse;
  const errText = resp.ok() ? "" : (await resp.text()).slice(0, 600);
  expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()} ${errText}`).toBe(true);
  const sent = resp.request().postDataJSON() as { houses?: Record<string, unknown>[] };
  const body = await resp.json();
  const mh = body.data.result.multiHouseSurchargeEvaluation as { surchargeApplicable: boolean; warnings: string[] };
  return { row: sent.houses?.find((h) => h.id === "house_rental_1"), mh };
}

/** 행 편집 모달을 열고 ⑪ 상태를 고른다(모달 안 위젯). */
async function pickStatus(page: Page, status: "unknown" | "none" | "has") {
  await page.getByRole("button", { name: "주택 1 편집" }).click();
  const box = page.getByTestId("apt-deadline-ext-rental-house_rental_1");
  await expect(box).toBeVisible();
  await box.getByTestId(`apt-deadline-ext-${status}-rental-house_rental_1`).check();
  return box;
}

test.describe("§167의3⑪ 기한 연장 사실 — 2호 명부 행 입력 → 요청 → 결과", () => {
  test("① 모름(기본) → 미전송 + 판정 보류 고지", async ({ page }) => {
    test.setTimeout(90_000);
    await openHolding(page);
    const { row, mh } = await calculate(page);
    expect(row).not.toHaveProperty("rentalAptDeadlineExtension");
    expect(mh.surchargeApplicable).toBe(false);
    expect(mh.warnings.some((w) => w.includes(PENDING))).toBe(true);
    await expect(page.getByText(PENDING).first()).toBeVisible();
  });

  test("② 연장 사유 없음 → confirmedNone 전송 · 고지 없음 · 중과", async ({ page }) => {
    test.setTimeout(90_000);
    await openHolding(page);
    await pickStatus(page, "none");
    await page.getByRole("button", { name: "완료" }).click();
    const { row, mh } = await calculate(page);
    expect(row?.rentalAptDeadlineExtension).toEqual({ confirmedNone: true });
    expect(mh.surchargeApplicable).toBe(true);
    expect(mh.warnings.some((w) => w.includes(PENDING))).toBe(false);
    await expect(page.getByText(PENDING)).toHaveCount(0);
  });

  test("③ 연장 사유 있음 + 등록말소일 2027-06-01 → 날짜 전송 · 중과 배제 · 고지 없음", async ({ page }) => {
    test.setTimeout(90_000);
    await openHolding(page);
    const box = await pickStatus(page, "has");
    const d1 = box.getByTestId("apt-deadline-ext-d1-rental-house_rental_1");
    await d1.getByLabel("연도").fill("2027");
    await d1.getByLabel("월").fill("06");
    await d1.getByLabel("일").fill("01");
    await page.getByRole("button", { name: "완료" }).click();
    const { row, mh } = await calculate(page);
    expect(row?.rentalAptDeadlineExtension).toEqual({ dutyPeriodEndCancellationDate: "2027-06-01" });
    expect(mh.surchargeApplicable).toBe(false);
    expect(mh.warnings.some((w) => w.includes(PENDING))).toBe(false);
  });
});
