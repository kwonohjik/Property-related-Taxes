import { test, expect, type Page } from "@playwright/test";

/**
 * 종합부동산세 과세연도별 세법 E2E (Phase D)
 *
 * 마법사 5단계: Step1(과세연도·1주택) → Step2(주택) → Step3(합산배제) → Step4(토지) → Step5(세부담·계산)
 *
 * - CPT-YA-E2E-1: 2022 선택 + 사례1(공시 9.5억) → 산출세액 1,260,000
 * - CPT-YA-E2E-2: 2022 → Step5 조정대상지역 ToggleCard 노출 / 2024 → 미노출
 * - CPT-YA-E2E-3: 2022 + 3주택 합산 29억 → 다주택 중과 배지 + 산출 28,080,000
 *
 * worktree: E2E_PORT=3100 npx playwright test e2e/comprehensive-tax-year-aware.spec.ts
 */

const PAGE = "/calc/comprehensive-tax";

async function clickNext(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^다음/ }).click();
}

async function calcAndWait(page: Page): Promise<void> {
  const calcResponse = page.waitForResponse(
    (r) =>
      r.url().includes("/api/calc/comprehensive") &&
      r.request().method() === "POST",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: /계산하기/ }).click();
  const resp = await calcResponse;
  expect(resp.ok(), `계산 API 비정상 ${resp.status()}`).toBe(true);
}

test.describe("종합부동산세 과세연도별 세법", () => {
  test("CPT-YA-E2E-1: 2022 사례1 (공시 9.5억) → 산출세액 1,260,000", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto(PAGE);

    await page.getByRole("radio", { name: "2022" }).check();
    await clickNext(page); // Step1 → Step2
    await page.getByPlaceholder("금액 입력").first().fill("950000000");
    await page.getByPlaceholder("0.00").first().fill("84");
    await clickNext(page); // Step2 → Step3
    await clickNext(page); // Step3 → Step4
    await clickNext(page); // Step4 → Step5
    await calcAndWait(page);

    // 2022 세율(0.6%) 산출세액 = 1,260,000 (현행 0.5%면 150,000)
    await expect(page.getByText(/1,260,000/).first()).toBeVisible({
      timeout: 30_000,
    });
  });

  // 2022 → Step5에 조정대상지역 ToggleCard 노출
  test("CPT-YA-E2E-2a: 2022 → Step5 조정대상지역 ToggleCard 노출", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto(PAGE);
    await page.getByRole("radio", { name: "2022" }).check();
    await clickNext(page); // → Step2
    await page.getByPlaceholder("금액 입력").first().fill("1500000000");
    await page.getByPlaceholder("0.00").first().fill("84");
    await clickNext(page); // → Step3
    await clickNext(page); // → Step4
    await clickNext(page); // → Step5
    await expect(
      page.getByText(/조정대상지역 2주택/).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  // 2024 → 조정대상지역 ToggleCard 미노출 (별도 test — sessionStorage 격리)
  test("CPT-YA-E2E-2b: 2024 → Step5 조정대상지역 ToggleCard 미노출", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto(PAGE);
    await page.getByRole("radio", { name: "2024" }).check();
    await clickNext(page); // → Step2
    await page.getByPlaceholder("금액 입력").first().fill("1500000000");
    await page.getByPlaceholder("0.00").first().fill("84");
    await clickNext(page); // → Step3
    await clickNext(page); // → Step4
    await clickNext(page); // → Step5
    await expect(page.getByText(/조정대상지역 2주택/)).toHaveCount(0);
  });

  test("CPT-YA-E2E-3: 2022 3주택 합산 29억 → 다주택 중과 배지", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto(PAGE);

    await page.getByRole("radio", { name: "2022" }).check();
    await clickNext(page); // → Step2

    // 주택 3채: 14억 + 10억 + 5억 = 29억
    await page.getByPlaceholder("금액 입력").first().fill("1400000000");
    await page.getByPlaceholder("0.00").first().fill("84");
    await page.getByRole("button", { name: /주택 추가/ }).click();
    await page.getByPlaceholder("금액 입력").nth(1).fill("1000000000");
    await page.getByPlaceholder("0.00").nth(1).fill("84");
    await page.getByRole("button", { name: /주택 추가/ }).click();
    await page.getByPlaceholder("금액 입력").nth(2).fill("500000000");
    await page.getByPlaceholder("0.00").nth(2).fill("84");
    await clickNext(page); // → Step3
    await clickNext(page); // → Step4
    await clickNext(page); // → Step5
    await calcAndWait(page);

    // 3주택 → 다주택 중과세율 자동 적용 + 산출세액 28,080,000
    await expect(page.getByText(/다주택 중과세율 적용/).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/28,080,000/).first()).toBeVisible();
  });

  // 2021 토지 FMR 95% (시행령 §2의4② — Phase A 토지 FMR 연도화)
  test("CPT-YA-E2E-4: 2021 + 종합합산 토지 → FMR 95% 표시 + 과표 4.75억", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto(PAGE);

    await page.getByRole("radio", { name: "2021" }).check();
    await clickNext(page); // → Step2
    await page.getByPlaceholder("금액 입력").first().fill("500000000");
    await page.getByPlaceholder("0.00").first().fill("84");
    await clickNext(page); // → Step3
    await clickNext(page); // → Step4

    // 종합합산 토지 ToggleCard ON (첫 switch) + 공시 10억
    await page.getByRole("switch").first().click();
    const landAmounts = page.getByPlaceholder("0");
    await landAmounts.nth(0).fill("1000000000"); // 공시지가 합산 10억
    await landAmounts.nth(1).fill("700000000");  // 재산세 과세표준 7억
    await landAmounts.nth(2).fill("2000000");    // 재산세 부과세액 200만
    await clickNext(page); // → Step5
    await calcAndWait(page);

    // 과세표준 = (10억 − 5억) × 95% = 475,000,000 + FMR note 95.00% 표시
    await expect(page.getByText(/공정시장가액비율 95/).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/475,000,000/).first()).toBeVisible();
  });
});
