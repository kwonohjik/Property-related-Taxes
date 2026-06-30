/**
 * §98의9 수도권 밖 준공후미분양 — 주택수 제외 UI E2E
 *
 * isFullyImplemented=true 전환 확인: unsold_housing 그룹 라디오 활성 → 폼 렌더.
 *
 * worktree 실행: E2E_PORT=3100 npx playwright test e2e/transfer-98-9.spec.ts
 * ⚠️ stale 서버 주의 — lsof -ti :3100 | xargs kill 후 실행.
 */
import { test, expect } from "@playwright/test";

test.describe("양도세 §98의9 준공후미분양 패널", () => {
  test("미분양주택 그룹 펼침 → §98의9 선택 → 폼 렌더", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    // ── 양도일 입력 ──
    await page.getByTestId("transfer-date").getByLabel("연도").fill("2024");
    await page.getByTestId("transfer-date").getByLabel("월").fill("06");
    await page.getByTestId("transfer-date").getByLabel("일").fill("01");

    // ── 감면·공제 단계로 이동 ──
    await page.getByRole("button", { name: "감면·공제" }).click();

    // ── unsold_housing 그룹 펼침 ──
    await page.getByRole("button", { name: /미분양주택/ }).click();

    // §98의9 라디오 활성 + 클릭 (D-1' 낙관 통과 — 시한은 evaluator 판정)
    const item989 = page.getByText("§98의9 — 수도권 밖 준공후미분양 (주택수 제외)", { exact: false }).first();
    await expect(item989).toBeVisible();
    await item989.click();

    // ── 입력 폼 렌더 확인 ──
    await expect(page.getByText("준공후미분양주택 취득 정보", { exact: false }).first()).toBeVisible();
    // 가액·면적 hint (7억·85㎡)
    await expect(page.getByText(/7억 이하/).first()).toBeVisible();
    await expect(page.getByText(/85㎡ 이하/).first()).toBeVisible();
    // 자격 토글
    await expect(page.getByText("취득 당시 1세대 1주택", { exact: false }).first()).toBeVisible();
  });
});
