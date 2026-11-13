import { test, expect, type Page } from "@playwright/test";
import {
  openHouseModal,
  closeHouseModal,
  expandHouseAdvanced,
} from "./_helpers/tax-flow";

/**
 * 종합부동산세 단기민간임대주택(6년형) 합산배제 E2E — 시행령 §3①10호(건설)·11호(매입)
 *
 * 폼 → 계산 → 결과 경로 + exclusionType↔rentalRegistrationType 자동매칭 검증.
 * - STR6Y-E2E-1: 건설 단기(수도권 5억·100㎡) → 합산배제 적용 + 자동매칭
 * - STR6Y-E2E-2: 매입 단기(비수도권 2억·200㎡ 면적무관) → 합산배제 (location·면적 분기)
 * - STR6Y-E2E-3: 2024 과세연도 → 10·11호 시행(2025.6.4.) 전이라 불성립
 *
 * 과세연도 2025 = 부칙<대통령령 제35352호> 제3조 특례(2025.9.30.까지 단기 등록 · 아파트 아님).
 * 2026은 Step1 선택지(COMPREHENSIVE_SUPPORTED_YEARS)에 없다.
 *
 * worktree 실행: E2E_PORT=3102 npx playwright test e2e/comprehensive-short-term-rental-6y.spec.ts
 */

const PAGE = "/calc/comprehensive-tax";

async function clickNext(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^다음/ }).click();
}

async function fillDate(page: Page, idx: number, y: string, m: string, d: string): Promise<void> {
  await page.getByLabel("연도").nth(idx).fill(y);
  await page.getByLabel("월").nth(idx).fill(m);
  await page.getByLabel("일").nth(idx).fill(d);
}

/** Step3: 등록일(첫 DateInput) → 단기 제외 요건 칸 → 임대개시일 */
async function fillStep3(page: Page, opts: { acquisition?: boolean } = {}): Promise<void> {
  await fillDate(page, 0, "2025", "7", "1"); // 임대사업자 등록일(2025.9.30. 이전)
  if (opts.acquisition) {
    const acq = page.getByTestId("comprehensive-8na-acquisition-date");
    await acq.getByLabel("연도").fill("2018");
    await acq.getByLabel("월").fill("1");
    await acq.getByLabel("일").fill("2");
  }
  await page.getByTestId("comprehensive-8na-apartment-no").check();
  const startBox = page.locator('div.space-y-1\\.5:has(> label:has-text("임대개시일"))');
  await startBox.getByLabel("연도").fill("2024");
  await startBox.getByLabel("월").fill("1");
  await startBox.getByLabel("일").fill("1");
}

async function calcAndWait(page: Page): Promise<void> {
  const calcResponse = page.waitForResponse(
    (r) => r.url().includes("/api/calc/comprehensive") && r.request().method() === "POST",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: /계산하기/ }).click();
  const resp = await calcResponse;
  expect(
    resp.ok(),
    `계산 API 비정상 응답 ${resp.status()} — 폼 입력 누락/검증 실패 의심`,
  ).toBe(true);
}

test.describe("종부세 단기민간임대 6년 합산배제", () => {
  test("STR6Y-E2E-1: 건설 단기(수도권 5억·100㎡) → 합산배제 + 자동매칭", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto(PAGE);

    // Step1: 과세연도
    await page.getByRole("radio", { name: "2025" }).check();
    await clickNext(page);

    // Step2: 공시 5억·면적 100㎡·수도권·합산배제 단기건설 (모두 주택 편집 모달 안)
    //   공시·면적·수도권은 모달 본문, 합산배제 유형 select는 고급 옵션 안.
    await openHouseModal(page, 0);
    await page.getByPlaceholder("금액 입력").first().fill("500000000");
    await page.getByPlaceholder("0.00").first().fill("100");
    await page
      .getByRole("dialog")
      .locator('select:has(option[value="metro"])')
      .selectOption("metro");
    await expandHouseAdvanced(page);
    await page
      .getByRole("dialog")
      .locator('select:has(option[value="private_short_term_rental_6y_construction"])')
      .selectOption("private_short_term_rental_6y_construction");
    await closeHouseModal(page);
    await clickNext(page);

    // Step3: 자동매칭(exclusionType→rentalRegistrationType) 확인 + 등록일·임대개시일
    await expect(
      page.locator('select:has(option[value="private_short_term_6y_construction"])'),
    ).toHaveValue("private_short_term_6y_construction");
    await fillStep3(page);
    // §3①10호 「2호 이상」 — 이 스펙은 2025 특례 축만 본다
    await page.getByTestId("comprehensive-qualifying-unit-count").locator("input").fill("2");
    await clickNext(page); // Step3 → Step4(토지·계산)
    await calcAndWait(page);

    await expect(page.getByText(/합산배제/).first()).toBeVisible({ timeout: 30_000 });
    // 성립 — 「합산배제 불성립」 사유 목록이 없다(2025 부칙 제3조 특례 충족)
    await expect(page.getByTestId("comprehensive-exclusion-fail-reasons")).toHaveCount(0);
  });

  test("STR6Y-E2E-2: 매입 단기(비수도권 2억·200㎡) → 합산배제 (면적무관·2억 경계)", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto(PAGE);

    // Step1
    await page.getByRole("radio", { name: "2025" }).check();
    await clickNext(page);

    // Step2: 공시 2억·면적 200㎡(매입은 면적조건 없음)·비수도권·합산배제 단기매입 (모달 안)
    await openHouseModal(page, 0);
    await page.getByPlaceholder("금액 입력").first().fill("200000000");
    await page.getByPlaceholder("0.00").first().fill("200");
    await page
      .getByRole("dialog")
      .locator('select:has(option[value="metro"])')
      .selectOption("non_metro");
    await expandHouseAdvanced(page);
    await page
      .getByRole("dialog")
      .locator('select:has(option[value="private_short_term_rental_6y_purchase"])')
      .selectOption("private_short_term_rental_6y_purchase");
    await closeHouseModal(page);
    await clickNext(page);

    // Step3: 자동매칭 매입 확인 + 등록일·임대개시일
    await expect(
      page.locator('select:has(option[value="private_short_term_6y_purchase"])'),
    ).toHaveValue("private_short_term_6y_purchase");
    await fillStep3(page, { acquisition: true }); // 개인 11호 — 취득일(2018.9.13. 이전이면 1) 해당 없음)
    await clickNext(page); // Step3 → Step4(토지·계산)
    await calcAndWait(page);

    await expect(page.getByText(/합산배제/).first()).toBeVisible({ timeout: 30_000 });
    // 성립 — 「합산배제 불성립」 사유 목록이 없다(2025 부칙 제3조 특례 충족)
    await expect(page.getByTestId("comprehensive-exclusion-fail-reasons")).toHaveCount(0);
  });

  test("STR6Y-E2E-3: 2024 과세연도 매입 단기 → 시행 전 불성립", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto(PAGE);
    await page.getByRole("radio", { name: "2024" }).check();
    await clickNext(page);

    await openHouseModal(page, 0);
    await page.getByPlaceholder("금액 입력").first().fill("200000000");
    await page.getByPlaceholder("0.00").first().fill("59");
    await page
      .getByRole("dialog")
      .locator('select:has(option[value="metro"])')
      .selectOption("non_metro");
    await expandHouseAdvanced(page);
    await page
      .getByRole("dialog")
      .locator('select:has(option[value="private_short_term_rental_6y_purchase"])')
      .selectOption("private_short_term_rental_6y_purchase");
    await closeHouseModal(page);
    await clickNext(page);

    // 2024에는 11호 제외 요건 칸이 없다 — 등록일·임대개시일만
    await expect(page.getByTestId("comprehensive-8na-acquisition-date")).toHaveCount(0);
    await fillDate(page, 0, "2024", "1", "1");
    await fillDate(page, 1, "2024", "1", "1");
    await clickNext(page);
    await calcAndWait(page);

    await expect(page.getByTestId("comprehensive-exclusion-fail-reasons")).toContainText("2025.6.4. 시행", {
      timeout: 30_000,
    });
  });
});
