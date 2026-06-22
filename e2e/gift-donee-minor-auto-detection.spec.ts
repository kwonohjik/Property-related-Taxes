/**
 * E2E: 증여세 수증자 주민등록번호 → 미성년 자동판정
 *
 * 시나리오 (Step0 "증여 정보"):
 *   1. 직계존속(부) 증여 → 수증자 주민번호 input 노출
 *   2. 미입력 → 수동 미성년 토글 fallback (D-1)
 *   3. 미성년 주민번호 입력 → 자동 배지 "미성년자 (§57①)" + 수동 토글 숨김
 *   4. 성년 주민번호 입력 → 자동 배지 "성년 (할증 대상 아님)"
 *
 * 주의: worktree 실행 시 E2E_PORT=3100 (memory: feedback_e2e_worktree_port_isolation).
 */
import { test, expect } from "@playwright/test";

test.describe("수증자 주민번호 미성년 자동판정", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/calc/gift-tax");
    // Step0: 증여일 + 부(father) 선택
    await page.getByLabel("연도").first().fill("2025");
    await page.getByLabel("월").first().fill("06");
    await page.getByLabel("일").first().fill("01");
    await page.locator("select").first().selectOption("father");
  });

  test("[E2E-DM-1] 주민번호 미입력 → 수동 미성년 토글 fallback 노출", async ({
    page,
  }) => {
    await expect(page.getByTestId("donee-resident-number")).toBeVisible();
    // 자동 배지 없음 + 수동 토글(description) 노출
    await expect(page.getByTestId("donee-minor-auto-badge")).toHaveCount(0);
    await expect(
      page.getByText("수증자가 미성년자이고 세대생략"),
    ).toBeVisible();
  });

  test("[E2E-DM-2] 미성년 주민번호 → 자동 배지 '미성년자' + 수동 토글 숨김", async ({
    page,
  }) => {
    // 2010-05-01생 → 증여일 2025-06-01 기준 만 15세
    await page.getByTestId("donee-resident-number").fill("1005013000000");

    const badge = page.getByTestId("donee-minor-auto-badge");
    await expect(badge).toBeVisible();
    await expect(badge).toContainText("미성년자");
    await expect(badge).toContainText("§57①");
    // 수동 토글 description 숨김
    await expect(
      page.getByText("수증자가 미성년자이고 세대생략"),
    ).toHaveCount(0);
  });

  test("[E2E-DM-3] 성년 주민번호 → 자동 배지 '성년 (할증 대상 아님)'", async ({
    page,
  }) => {
    // 2000-01-01생 → 증여일 2025-06-01 기준 만 25세
    await page.getByTestId("donee-resident-number").fill("0001013000000");

    const badge = page.getByTestId("donee-minor-auto-badge");
    await expect(badge).toBeVisible();
    await expect(badge).toContainText("할증 대상 아님");
  });
});
