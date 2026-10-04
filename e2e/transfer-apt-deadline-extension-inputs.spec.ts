/**
 * E2E: 소령 §167의3⑪ 기한 연장 사실 — 2호 명부 행(장기임대 가목 아파트) 입력 → 요청 본문 → 결과 화면.
 *
 * 2주택 세대(양도 주택 강남 일반 + 다른 주택 장기임대 가목 아파트), 양도 2028-03-01:
 *   ① 「모름」(기본) — 행에 `rentalAptDeadlineExtension`이 실리지 않고 기한 2027.12.31. 경과로 중과 + 확인 필요 고지
 *      (사용자 결정 2026-10-04 「모름은 불리 적용」 — 종전 #1910은 중과 배제 유지 + 「판정하지 못해」 고지)
 *   ② 「연장 사유 없음」 — `{ confirmedNone: true }`가 실리고 고지가 사라지며 중과가 적용된다
 *   ③ 「연장 사유 있음」 + 등록말소일 2027-06-01 — 날짜가 실리고(기한 2028-06-01) 중과 배제 · 고지 없음
 *   ④ 3호 인가 2028-03-01(2027.12.31. 뒤) · 이전고시 2033-05-01 · 양도 2030-01-01 — 3호 불성립 → 중과
 *   ⑤ 3호 인가 모름 · 양도일 현재 이전고시 전 → 3호 불성립(기한 2027.12.31. 경과 · 중과) + 인가·지정 확인 필요 고지
 *   ⑦ 3호 인가일만 입력(이전고시 상태 없음) → ⑧ 차단(이전고시일 또는 「이전고시 전」 필수)
 *   ⑥ 3호 인가 2027-06-01 · 이전고시 2033-05-01 · 협의·수용재결·매도청구소송 「예」 · 양도 2035-01-01 → 기한 내 간주(배제)
 *
 * 세액은 dev 서버의 세율 원천(DB/fallback)에 따라 달라질 수 있어 단언하지 않는다 — 금액 anchor는
 * `__tests__/api/transfer.route.apt-deadline-extension-inputs.anchor.test.ts`.
 *
 * 실행: E2E_PORT=<worktree 포트> npx playwright test e2e/transfer-apt-deadline-extension-inputs.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

const GANGNAM = "1168010100";
/** 연장 사실 「모름」 확인 필요 고지(2026-10-04 이후 문구) */
const PENDING = "연장 사유를 확인하지 못해";

function seedForm(transferDate = "2028-03-01") {
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
        transferDate,
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

async function openHolding(page: Page, transferDate?: string) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), seedForm(transferDate));
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
  test("① 모름(기본) → 미전송 + 중과(기한 2027.12.31. 경과) + 확인 필요 고지", async ({ page }) => {
    test.setTimeout(90_000);
    await openHolding(page);
    const { row, mh } = await calculate(page);
    expect(row).not.toHaveProperty("rentalAptDeadlineExtension");
    expect(mh.surchargeApplicable).toBe(true);
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

  const fillDate = async (box: ReturnType<Page["getByTestId"]>, testId: string, ymd: string) => {
    const [y, m, d] = ymd.split("-");
    const el = box.getByTestId(testId);
    await el.getByLabel("연도").fill(y);
    await el.getByLabel("월").fill(m);
    await el.getByLabel("일").fill(d);
  };
  const ID = "rental-house_rental_1";

  test("④ 3호 인가 2028-03-01 · 이전고시 2033-05-01 · 양도 2030-01-01 → 인가일 전송 · 3호 불성립 → 중과", async ({ page }) => {
    test.setTimeout(90_000);
    await openHolding(page, "2030-01-01");
    const box = await pickStatus(page, "has");
    await fillDate(box, `apt-deadline-ext-d3auth-${ID}`, "2028-03-01");
    await fillDate(box, `apt-deadline-ext-d3-${ID}`, "2033-05-01");
    await page.getByRole("button", { name: "완료" }).click();
    const { row, mh } = await calculate(page);
    expect(row?.rentalAptDeadlineExtension).toEqual({
      relocationAuthorizationDate: "2028-03-01",
      relocationAnnouncementDate: "2033-05-01",
    });
    expect(mh.surchargeApplicable).toBe(true);
  });

  test("⑤ 3호 인가 모름 · 양도일 현재 이전고시 전 → 3호 불성립(중과) + 인가·지정 확인 필요 고지", async ({ page }) => {
    test.setTimeout(90_000);
    await openHolding(page, "2030-01-01");
    const box = await pickStatus(page, "has");
    await box.getByTestId(`apt-deadline-ext-d3pending-${ID}`).getByRole("switch").click();
    await expect(box.getByTestId(`apt-deadline-ext-d3-${ID}`)).toHaveCount(0);
    await page.getByRole("button", { name: "완료" }).click();
    const { row, mh } = await calculate(page);
    expect(row?.rentalAptDeadlineExtension).toEqual({ relocationNotYetAnnounced: true });
    expect(mh.surchargeApplicable).toBe(true);
    expect(mh.warnings.some((w) => w.includes("인가 또는 지정"))).toBe(true);
    await expect(page.getByText(/인가 또는 지정이 2027\.12\.31\./).first()).toBeVisible();
  });

  test("⑥ 3호 인가 2027-06-01 · 이전고시 2033-05-01 · 수용 「예」 · 양도 2035-01-01 → 단서 전송 · 기한 내 간주(배제)", async ({ page }) => {
    test.setTimeout(90_000);
    await openHolding(page, "2035-01-01");
    const box = await pickStatus(page, "has");
    await expect(box.getByTestId(`apt-deadline-ext-exprop-${ID}`)).toHaveCount(0); // 3호 사실 전에는 없다
    await fillDate(box, `apt-deadline-ext-d3auth-${ID}`, "2027-06-01");
    await fillDate(box, `apt-deadline-ext-d3-${ID}`, "2033-05-01");
    await box.getByTestId(`apt-deadline-ext-exprop-yes-${ID}`).check();
    await page.getByRole("button", { name: "완료" }).click();
    const { row, mh } = await calculate(page);
    expect(row?.rentalAptDeadlineExtension).toEqual({
      relocationAuthorizationDate: "2027-06-01",
      relocationAnnouncementDate: "2033-05-01",
      relocationExpropriationTransfer: true,
    });
    expect(mh.surchargeApplicable).toBe(false);
  });

  test("⑦ 3호 인가일만 입력(이전고시 상태 없음) → 모달 경고 · 계산 단계 진행 차단", async ({ page }) => {
    test.setTimeout(90_000);
    await openHolding(page, "2030-01-01");
    const box = await pickStatus(page, "has");
    await fillDate(box, `apt-deadline-ext-d3auth-${ID}`, "2027-06-01");
    await page.getByRole("button", { name: "완료" }).click();
    let posted = false;
    page.on("request", (r) => {
      if (r.url().includes("/api/calc/transfer") && r.method() === "POST") posted = true;
    });
    for (const step of ["감면·공제", "가산세"]) {
      await page.getByRole("button", { name: step }).first().click();
    }
    await page.getByRole("button", { name: /계산하기/ }).click().catch(() => undefined);
    await expect(page.getByText(/이전고시일을 입력하거나/).first()).toBeVisible();
    expect(posted).toBe(false);
  });
});
