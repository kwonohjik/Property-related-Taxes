import { test, expect, type Page } from "@playwright/test";

/**
 * 종합부동산세 법인 §9② E2E (Phase B)
 *
 * 마법사 5단계: Step1(과세연도·납세의무자) → Step2(주택) → Step3(합산배제) → Step4(토지) → Step5(세부담·계산)
 *
 * - CPT-CORP-E2E-1: 법인 선택 → 1세대1주택 ToggleCard 숨김 + 법인 유형 RadioCardGroup 노출
 * - CPT-CORP-E2E-2: 2024 + 법인(§9②3호) + 공시 20억 1채 → 계산 → "32,400,000" + "§9② 법인 단일세율" 배지 + 기본공제 "적용 없음"
 *
 * worktree: E2E_PORT=3100 npx playwright test e2e/comprehensive-tax-corporation.spec.ts
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

test.describe("종합부동산세 법인 §9②", () => {
  test(
    "CPT-CORP-E2E-1: 법인 선택 → 1세대1주택 ToggleCard 숨김 + 법인 유형 노출",
    async ({ page }) => {
      test.setTimeout(60_000);
      await page.goto(PAGE);

      // 기본값은 개인 — 1세대1주택 토글이 보여야 함
      await expect(page.getByText(/1세대 1주택자/)).toBeVisible({ timeout: 10_000 });

      // [법인] 라디오 선택
      await page.getByRole("radio", { name: "법인" }).check();

      // 1세대1주택 ToggleCard 숨김 확인
      await expect(page.getByText(/1세대 1주택자/)).toHaveCount(0);

      // 법인 유형 RadioCardGroup 노출 확인
      await expect(
        page.getByRole("radio", { name: /일반 법인.*단일세율.*§9②3호/ }),
      ).toBeVisible({ timeout: 5_000 });
      await expect(
        page.getByRole("radio", { name: /공공주택사업자.*§9②1호/ }),
      ).toBeVisible();
      await expect(
        page.getByRole("radio", { name: /공익법인등.*§9②2호/ }),
      ).toBeVisible();
    },
  );

  test(
    "CPT-CORP-E2E-2: 2024 + 법인(§9②3호) + 공시 20억 → 32,400,000 + 배지 + 적용 없음",
    async ({ page }) => {
      test.setTimeout(90_000);
      await page.goto(PAGE);

      // Step1: 2024 선택
      await page.getByRole("radio", { name: "2024" }).check();

      // 납세의무자 유형 → 법인
      await page.getByRole("radio", { name: "법인" }).check();

      // 법인 유형 — 일반 법인(§9②3호) 기본 선택 확인 후 유지
      await expect(
        page.getByRole("radio", { name: /일반 법인.*단일세율.*§9②3호/ }),
      ).toBeChecked({ timeout: 5_000 });

      await clickNext(page); // Step1 → Step2

      // Step2: 공시가격 20억 주택 1채
      await page.getByPlaceholder("금액 입력").first().fill("2000000000");
      await page.getByPlaceholder("0.00").first().fill("84");

      await clickNext(page); // Step2 → Step3
      await clickNext(page); // Step3 → Step4
      await clickNext(page); // Step4 → Step5

      // Step5: corporate_special → 전년도 세액 입력란 숨김 + 상한 미적용 안내 표시
      await expect(page.getByText(/세부담 상한 미적용/)).toBeVisible({ timeout: 5_000 });
      await expect(page.getByLabel(/전년도 총세액/)).toHaveCount(0);

      await calcAndWait(page);

      // 결과: 산출세액 32,400,000 표시 (20억 × 2.7% = 54,000,000 → 과표 20억 × 60% = 12억 × 2.7% = 32,400,000)
      await expect(
        page.getByText(/32,400,000/).first(),
      ).toBeVisible({ timeout: 30_000 });

      // "§9② 법인 단일세율" 배지 표시
      await expect(page.getByText(/§9② 법인 단일세율/)).toBeVisible({ timeout: 10_000 });

      // 기본공제 "적용 없음 (§8①2호)" 라벨 표시
      await expect(page.getByText(/적용 없음.*§8①2호/)).toBeVisible({ timeout: 5_000 });
    },
  );
});
