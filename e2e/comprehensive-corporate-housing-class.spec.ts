import { test, expect, type Page } from "@playwright/test";
import { openHouseModal, closeHouseModal } from "./_helpers/tax-flow";

/**
 * 종합부동산세 법인 주택분 §9②1·2호 요건 자동판정 E2E (시행령 §4의4)
 *
 * 세부유형 Select + 조건 요건 RadioCardGroup → §9② class 도출 배지.
 * - CORP44-E2E-1: 공익법인 → 미충족(§9②2호) ↔ 충족(§9②1호) 도출 배지 실시간 전환
 * - CORP44-E2E-2: 조건부 유형 미응답 → 계산 차단 (C-15 — 시행령 §4의4)
 *
 * worktree 실행: E2E_PORT=3102 npx playwright test e2e/comprehensive-corporate-housing-class.spec.ts
 */

const PAGE = "/calc/comprehensive-tax";

async function clickNext(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^다음/ }).click();
}

test.describe("종부세 법인 §9②1·2호 자동판정 (§4의4)", () => {
  test("CORP44-E2E-1: 공익법인 미충족(§9②2호) ↔ 충족(§9②1호) 도출 배지 전환", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto(PAGE);

    await page.getByRole("radio", { name: "2024" }).check();
    await page.getByRole("radio", { name: "법인" }).check();

    // 세부유형 = 공익법인등 (조건부 유형)
    await page
      .locator('select:has(option[value="public_interest_corp"])')
      .selectOption("public_interest_corp");

    // 미응답 상태 — 안내 우선 표시
    await expect(page.getByText(/요건 충족 여부를 선택/)).toBeVisible({ timeout: 5_000 });

    // 미충족 → §9②2호 도출
    await page.getByRole("radio", { name: /^미충족/ }).check();
    await expect(page.getByText(/§9②2호 법인 주택분 특례/)).toBeVisible({ timeout: 5_000 });

    // 충족 → §9②1호 도출 (실시간 전환)
    await page.getByRole("radio", { name: /^충족/ }).check();
    await expect(page.getByText(/§9②1호 법인 주택분 특례/)).toBeVisible({ timeout: 5_000 });
    // §4의4② 서류 제출 안내 노출
    await expect(page.getByText(/§4의4②/)).toBeVisible();
  });

  test("CORP44-E2E-2: 조건부 유형 미응답 → 계산 차단 (C-15)", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto(PAGE);

    await page.getByRole("radio", { name: "2024" }).check();
    await page.getByRole("radio", { name: "법인" }).check();

    // 사회적기업(조건부) 선택 후 요건 미응답
    await page
      .locator('select:has(option[value="social_enterprise"])')
      .selectOption("social_enterprise");

    await clickNext(page); // Step1 → Step2

    // Step2: 공시 20억 1채 (주택 입력은 모달 안)
    await openHouseModal(page, 0);
    await page.getByPlaceholder("금액 입력").first().fill("2000000000");
    await page.getByPlaceholder("0.00").first().fill("84");
    await closeHouseModal(page);

    await clickNext(page); // → Step3
    await clickNext(page); // → Step4(토지·계산)

    // 계산하기 → C-15 차단 (요건 미응답)
    await page.getByRole("button", { name: /계산하기/ }).click();
    await expect(
      page.getByText(/법인 세부 유형의 요건 충족 여부를 선택/),
    ).toBeVisible({ timeout: 5_000 });
  });
});
