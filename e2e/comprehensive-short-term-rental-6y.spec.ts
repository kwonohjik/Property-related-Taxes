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
    await page.getByRole("radio", { name: "2024" }).check();
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
    await fillDate(page, 0, "2024", "1", "1"); // 임대사업자 등록일
    await fillDate(page, 1, "2024", "1", "1"); // 임대개시일
    await clickNext(page); // Step3 → Step4(토지·계산)
    await calcAndWait(page);

    await expect(page.getByText(/합산배제/).first()).toBeVisible({ timeout: 30_000 });
  });

  test("STR6Y-E2E-2: 매입 단기(비수도권 2억·200㎡) → 합산배제 (면적무관·2억 경계)", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto(PAGE);

    // Step1
    await page.getByRole("radio", { name: "2024" }).check();
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
    await fillDate(page, 0, "2024", "1", "1");
    await fillDate(page, 1, "2024", "1", "1");
    await clickNext(page); // Step3 → Step4(토지·계산)
    await calcAndWait(page);

    await expect(page.getByText(/합산배제/).first()).toBeVisible({ timeout: 30_000 });
  });
});
