/**
 * E2E: 부담부증여 양도소득세 — E-1 잔여 입력이 요청 본문에 실린다 (계획서 §9.3 E-1 행)
 *
 * 헬퍼·선택자 정책은 `gift-burdened-transfer.spec.ts`와 같다(`_helpers/gift-burdened-transfer.ts`).
 * 양도세 API는 route intercept로 모킹하고 요청 본문을 본다 — 세액 도달은 route anchor가 고정한다
 * (`__tests__/api/gift-burdened-one-house-remaining-e1r.route.anchor.test.ts`).
 */
import { test, expect } from "@playwright/test";
import { fillAndVerify, fillDateAndVerify } from "./_helpers/tax-flow";
import {
  addApartmentWithDebt,
  enableBurdenedTransferToggle,
  fillApartmentTransferInfo,
  setupTransferApiMock,
} from "./_helpers/gift-burdened-transfer";

async function goToGiftAssets(page: Parameters<typeof fillDateAndVerify>[0], giftDate: { year: string; month: string; day: string }) {
  await page.goto("/calc/gift-tax");
  await fillDateAndVerify(page, giftDate);
  await page.locator("select").first().selectOption({ index: 1 });
  await page.getByRole("button", { name: /^다음/ }).click();
}

/** 주소 검색 모킹 — 강남 역삼동 PNU(BT-E2E-8과 같은 방식). PNU가 있으면 역지오코딩 호출이 없다. */
async function mockGangnamAddress(page: Parameters<typeof fillDateAndVerify>[0]) {
  await page.route("**/api/address/search**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        results: [
          {
            pnu: "1168010100107360000",
            title: "역삼동 736",
            road: "서울 강남구 테헤란로 152",
            jibun: "서울 강남구 역삼동 736",
            building: "",
            zipcode: "",
            lng: "",
            lat: "",
          },
        ],
      }),
    }),
  );
  await page.route("**/api/address/standard-price**", (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: "{}" }),
  );
}

async function searchGangnam(dialog: Awaited<ReturnType<typeof addApartmentWithDebt>>) {
  const addr = dialog.getByPlaceholder("도로명 또는 지번 주소 입력");
  await addr.fill("역삼동 736");
  await dialog.getByRole("button", { name: /역삼동 736/ }).click();
  await expect(addr).toHaveValue("서울 강남구 테헤란로 152", { timeout: 15_000 });
}

async function calculateAndCapture(
  page: Parameters<typeof fillDateAndVerify>[0],
  mock: Awaited<ReturnType<typeof setupTransferApiMock>>,
) {
  await page.getByRole("button", { name: "닫기" }).click();
  await expect(page.getByTestId("estate-edit-dialog")).toBeHidden();
  await page.getByRole("button", { name: /^다음/ }).click();
  await page.getByRole("button", { name: /^다음/ }).click();
  const transferResponse = page.waitForResponse(
    (r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: /계산하기/ }).click();
  await transferResponse;
  expect(mock.bodies.length, "양도세 API 호출").toBeGreaterThan(0);
  return mock.bodies[0];
}

/**
 * [BT-E2E-9] E-1 잔여 D — 상속받은 주택(§104②1호 · §154⑧3호). 판정 메뉴와 같은 위젯
 * (`InheritedSameHouseholdField`)이 부담부증여 주택 입력에 뜨고, 계산기와 같은 키로 본문에 실린다.
 */
test("[BT-E2E-9] 상속받은 주택 · 동일세대 통산 → 요청 본문 acquisitionCause·decedent*", async ({ page }) => {
  test.setTimeout(120_000);
  const mock = await setupTransferApiMock(page);
  await goToGiftAssets(page, { year: "2021", month: "6", day: "1" });

  const dialog = await addApartmentWithDebt(page);
  await enableBurdenedTransferToggle(dialog);
  await fillApartmentTransferInfo(dialog); // 취득(= 상속개시) 2010-03-15 · 1세대 1주택 ON · 거주 120개월

  await dialog.getByRole("switch", { name: /상속받은 주택입니다/ }).click();
  await fillDateAndVerify(page, { year: "2000", month: "01", day: "01" }, {
    scope: dialog.getByTestId("one-house-decedent-acq-date"),
  });
  await dialog.getByRole("switch", { name: /피상속인과 동일세대/ }).click();
  await fillDateAndVerify(page, { year: "2005", month: "01", day: "01" }, {
    scope: dialog.getByTestId("one-house-cohabitation-start"),
  });
  await fillAndVerify(dialog.getByRole("textbox", { name: "상속개시 전 동일세대 거주기간" }), "60");

  const body = await calculateAndCapture(page, mock);
  expect(body.acquisitionDate).toBe("2010-03-15");
  expect(body.acquisitionCause).toBe("inheritance");
  expect(body.decedentAcquisitionDate).toBe("2000-01-01");
  expect(body.decedentSameHouseholdBeforeInheritance).toBe(true);
  expect(body.decedentCohabitationHoldingStartDate).toBe("2005-01-01");
  expect(body.decedentCohabitationResidenceMonths).toBe(60);
});

/**
 * [BT-E2E-10] E-1 잔여 A — 「양도시(증여일) 조정대상지역」 토글은 안 만졌으면 증여 주택 주소 판정을 따른다
 * (양도세 계산기 `useRegulatedAreaAutoTip`과 같은 규칙). 증여 2021-06-01 강남 = 조정.
 */
test("[BT-E2E-10] 강남 주소 · 토글 안 만짐 → 켜져 있고 요청 본문 isRegulatedArea=true", async ({ page }) => {
  test.setTimeout(120_000);
  const mock = await setupTransferApiMock(page);
  await mockGangnamAddress(page);
  await goToGiftAssets(page, { year: "2021", month: "6", day: "1" });

  const dialog = await addApartmentWithDebt(page);
  await searchGangnam(dialog);
  await enableBurdenedTransferToggle(dialog);
  await fillApartmentTransferInfo(dialog);

  const toggle = dialog.getByRole("switch", { name: /양도시\(증여일\) 조정대상지역/ });
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(dialog.getByText(/소재지 주소로 증여일 현재 조정대상지역으로 자동 판정/)).toBeVisible();

  const body = await calculateAndCapture(page, mock);
  expect(body.regionCode).toBe("1168010100");
  expect(body.isRegulatedArea).toBe(true);
});

/**
 * [BT-E2E-11] E-1 잔여 B — §155①2호 신규 주택 소재지. 주소를 고르면 신규 주택 조정 여부가 선언 라디오 대신
 * 자동 판정되고 본문에 `temporaryTwoHouse.newHouseRegionCode`가 실린다. 인천 서구는 2020-06-19 조정 지정 —
 * 2020-06-18 취득이면 「조정대상지역 아님」.
 */
test("[BT-E2E-11] 신규 주택 소재지 → 자동 판정 · 요청 본문 temporaryTwoHouse.newHouseRegionCode", async ({ page }) => {
  test.setTimeout(120_000);
  const mock = await setupTransferApiMock(page);
  await page.route("**/api/address/search**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        results: [
          {
            pnu: "2826010100100010000",
            title: "인천 서구 1",
            road: "인천 서구 서곶로 1",
            jibun: "인천광역시 서구 x동 1",
            building: "",
            zipcode: "",
            lng: "",
            lat: "",
          },
        ],
      }),
    }),
  );
  await goToGiftAssets(page, { year: "2021", month: "8", day: "1" });

  const dialog = await addApartmentWithDebt(page);
  await enableBurdenedTransferToggle(dialog);
  await fillApartmentTransferInfo(dialog);
  const count = dialog.getByTestId("bg-transfer-house-count");
  await count.fill("2");
  await expect(count).toHaveValue("2");
  const dateField = (label: string) =>
    dialog.getByText(label, { exact: true }).locator("xpath=ancestor::div[.//input[@aria-label='연도']][1]");
  const fillDate = async (label: string, y: string, m: string, d: string) => {
    const f = dateField(label);
    await f.getByRole("textbox", { name: "연도" }).fill(y);
    await f.getByRole("textbox", { name: "월" }).fill(m);
    await f.getByRole("textbox", { name: "일" }).fill(d);
  };
  await fillDate("종전 주택 취득일", "2010", "3", "15");
  await fillDate("신규 주택 취득일", "2020", "6", "18");

  const box = dialog.getByTestId("bg-transfer-new-house-address");
  await box.getByPlaceholder("도로명 또는 지번 주소 입력").fill("서구 1");
  await box.getByRole("button", { name: /서곶로 1/ }).click();
  const block = dialog.getByTestId("temp-two-house-regulated-block");
  await expect(block.getByTestId("temp-two-house-new-regulated-auto")).toHaveText(
    "조정대상지역 아님 — 신규 주택 소재지 주소로 자동 판정",
  );
  await block.locator('input[name="prevHouseRegulatedAtNewAcquisition"][value="yes"]').check();

  const body = await calculateAndCapture(page, mock);
  expect(body.temporaryTwoHouse).toEqual({
    previousAcquisitionDate: "2010-03-15",
    newAcquisitionDate: "2020-06-18",
    newHouseRegionCode: "2826010100",
    previousHouseRegulatedAtNewAcquisition: true,
  });
});

/**
 * [BT-E2E-12] E-1 잔여 C — §155⑳ 장기임대주택 보유자 거주주택 특례(㉓ 말소일 포함). 계산기와 같은 카드가
 * 부담부증여 주택 입력(1세대 1주택 ON)에 뜨고, 계산기와 같은 leaf로 본문 `rentalHousingException`에 실린다.
 */
test("[BT-E2E-12] §155⑳ 거주주택 특례 · 말소일 → 요청 본문 rentalHousingException", async ({ page }) => {
  test.setTimeout(150_000);
  const mock = await setupTransferApiMock(page);
  await goToGiftAssets(page, { year: "2025", month: "6", day: "1" });

  const dialog = await addApartmentWithDebt(page);
  await enableBurdenedTransferToggle(dialog);
  await fillApartmentTransferInfo(dialog); // 취득 2010-03-15 · 1세대 1주택 ON · 거주 120개월
  const count = dialog.getByTestId("bg-transfer-house-count");
  await count.fill("2");
  await expect(count).toHaveValue("2");

  await dialog.getByRole("switch", { name: /장기임대주택 보유자 거주주택 비과세 특례 적용/ }).click();
  await fillDateAndVerify(page, { year: "2018", month: "06", day: "01" }, { scope: dialog.getByTestId("rental-biz-reg-date-0") });
  await fillDateAndVerify(page, { year: "2018", month: "06", day: "01" }, { scope: dialog.getByTestId("rental-reg-date-0") });
  await fillDateAndVerify(page, { year: "2018", month: "06", day: "01" }, { scope: dialog.getByTestId("rental-period-0-start-0") });
  await fillDateAndVerify(page, { year: "2020", month: "12", day: "01" }, { scope: dialog.getByTestId("rental-period-0-end-0") });
  await fillAndVerify(
    dialog.getByTestId("rental-stdprice-0-price-input").getByRole("textbox"),
    "300000000",
  );
  await dialog.getByRole("switch", { name: /^임대료 5% 상한/ }).click();
  await dialog.getByRole("switch", { name: /자진말소 또는 자동말소/ }).click();
  await dialog.getByTestId("rental-terminated-type-short-0").click();
  await fillDateAndVerify(page, { year: "2021", month: "03", day: "03" }, {
    scope: dialog.getByTestId("rental-cancellation-date-0"),
  });

  const body = await calculateAndCapture(page, mock);
  const rhe = body.rentalHousingException as { applyException: boolean; scenario: string; rentalUnits: Record<string, unknown>[] };
  expect(rhe.applyException).toBe(true);
  expect(rhe.scenario).toBe("A");
  expect(rhe.rentalUnits[0]).toMatchObject({
    businessRegistrationDate: "2018-06-01T00:00:00.000Z",
    rentalAutoTermination: true,
    terminatedRegistrationType: "short_term",
    registrationCancellationDate: "2021-03-03T00:00:00.000Z",
    requirementsConfirmed: true,
    rentalMonths: 30,
  });
});
