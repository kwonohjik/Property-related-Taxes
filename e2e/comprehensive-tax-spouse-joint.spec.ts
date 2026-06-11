import { test, expect, type Page } from "@playwright/test";

/**
 * 종합부동산세 부부 공동명의 1주택자 특례 §10의2 E2E (Phase C)
 *
 * 마법사 5단계: Step1 → Step2 → Step3 → Step4 → Step5 → 결과
 *
 * - CPT-SJ-E2E-1: 특례 ToggleCard ON → 신청인 생년월일·취득일 DateInput 펼침
 *                 + 1세대1주택 ToggleCard disabled 확인
 * - CPT-SJ-E2E-2: SC-C1 입력 (2024 + 특례 + 신청인 1953-01-01·취득 2008-01-01 + 공시 15억 1채)
 *                 → 계산 → "§10의2" 배지 + "900,000" (calculatedTax) 표시
 *
 * worktree: E2E_PORT=3100 npx playwright test e2e/comprehensive-tax-spouse-joint.spec.ts
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

test.describe("종합부동산세 부부 공동명의 1주택자 특례 §10의2", () => {
  test(
    "CPT-SJ-E2E-1: 특례 ToggleCard ON → 신청인 입력 펼침 + 1세대1주택 ToggleCard disabled",
    async ({ page }) => {
      test.setTimeout(60_000);
      await page.goto(PAGE);

      // 기본값: 개인, 1세대1주택·부부 특례 모두 OFF
      // 부부 공동명의 특례 ToggleCard는 1세대1주택 ToggleCard 다음 (2번째 switch)
      await expect(page.getByText(/부부 공동명의 1주택자 특례/)).toBeVisible({
        timeout: 10_000,
      });

      // 부부 특례 ToggleCard ON (두 번째 switch)
      const switches = page.getByRole("switch");
      await switches.nth(1).click();

      // 특례 펼침 — 신청인 생년월일 라벨 표시 확인
      await expect(
        page.getByText(/납세의무자\(신청인\).*생년월일/),
      ).toBeVisible({ timeout: 5_000 });

      // 특례 펼침 — 신청인 최초 취득일 라벨 표시 확인
      await expect(
        page.getByText(/납세의무자\(신청인\).*최초 취득일/),
      ).toBeVisible({ timeout: 5_000 });

      // 안내 문구 — 지분 합산 안내 표시 확인 (령 §5의2⑥)
      await expect(page.getByText(/전체 금액/)).toBeVisible({ timeout: 5_000 });

      // 1세대1주택 ToggleCard가 disabled 상태 확인 (첫 번째 switch)
      // disabled ToggleCard는 pointer-events-none 처리됨 — aria-disabled 또는 data 속성 확인
      await expect(switches.first()).toBeDisabled({ timeout: 5_000 });
    },
  );

  test(
    "CPT-SJ-E2E-2: SC-C1 — 2024 + 부부 특례 + 신청인 1953-01-01·취득 2008-01-01 + 공시 15억 → §10의2 배지 + 900,000",
    async ({ page }) => {
      test.setTimeout(90_000);
      await page.goto(PAGE);

      // Step1: 2024 선택
      await page.getByRole("radio", { name: "2024" }).check();

      // 부부 특례 ToggleCard ON (두 번째 switch — 1세대1주택 다음)
      const switches = page.getByRole("switch");
      await switches.nth(1).click();

      // 신청인 생년월일 1953-01-01 입력 (DateInput: 연/월/일)
      // 특례 ON 시 DateInput 2개 렌더 (생년월일 + 취득일)
      await page.getByLabel("연도").first().fill("1953");
      await page.getByLabel("월").first().fill("1");
      await page.getByLabel("일").first().fill("1");

      // 신청인 최초 취득일 2008-01-01 입력
      await page.getByLabel("연도").nth(1).fill("2008");
      await page.getByLabel("월").nth(1).fill("1");
      await page.getByLabel("일").nth(1).fill("1");

      await clickNext(page); // Step1 → Step2

      // Step2: 공시가격 15억 주택 1채
      await page.getByPlaceholder("금액 입력").first().fill("1500000000");
      await page.getByPlaceholder("0.00").first().fill("84");

      await clickNext(page); // Step2 → Step3
      await clickNext(page); // Step3 → Step4
      await clickNext(page); // Step4 → Step5
      await calcAndWait(page);

      // 결과: calculatedTax 900,000 표시 (SC-C1 — (15억−12억)×60%×0.5%=900,000)
      await expect(
        page.getByText(/900,000/).first(),
      ).toBeVisible({ timeout: 30_000 });

      // "§10의2 부부 공동명의 특례" 배지 (산출세액 행 badge span) 표시
      // getByText 정확 일치: span 배지 텍스트 전체와 일치
      await expect(
        page.getByText("§10의2 부부 공동명의 특례"),
      ).toBeVisible({ timeout: 10_000 });

      // 기본공제 라벨 "부부 공동명의 특례 (1세대1주택 의제)" 표시
      await expect(
        page.getByText(/부부 공동명의 특례.*1세대1주택 의제/),
      ).toBeVisible({ timeout: 5_000 });
    },
  );
});
