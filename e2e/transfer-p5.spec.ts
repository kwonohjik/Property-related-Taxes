/**
 * P5 — §98 폼 + 모드 2 보유 감면주택 섹션 UI E2E
 *
 * worktree 실행: E2E_PORT=3100 npx playwright test e2e/transfer-p5.spec.ts
 */
import { test, expect } from "@playwright/test";

test.describe("양도세 P5", () => {
  test("미분양 그룹 → §98 폼 렌더 + Step4 보유 감면주택 섹션", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    await page.getByLabel("연도").first().fill("2024");
    await page.getByLabel("월").first().fill("06");
    await page.getByLabel("일").first().fill("01");

    // ── Step4 보유 상황: 2채 선택 → 모드 2 섹션 노출 ──
    await page.getByRole("button", { name: "보유 상황" }).click();
    await page.getByRole("button", { name: "2채" }).click();
    const modeToggle = page.getByText("조특법 감면주택 보유 — 주택 수 제외", { exact: false }).first();
    await expect(modeToggle).toBeVisible();
    await modeToggle.click();
    await expect(page.getByText("보유 감면주택 1", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("적용 조문", { exact: false }).first()).toBeVisible();

    // ── Step5 감면: §98 폼 ──
    await page.getByRole("button", { name: "감면·공제" }).click();
    await page.getByRole("button", { name: /미분양주택/ }).click();
    const item98 = page.getByText("§98 — 미분양 분리과세 20%", { exact: false }).first();
    await expect(item98).toBeVisible();
    await item98.click();
    await expect(page.getByText(/국민주택규모 이하/).first()).toBeVisible();
    await expect(page.getByText(/5년 이상 보유·임대/).first()).toBeVisible();
    await expect(page.getByText(/100분의 20 단일세율/).first()).toBeVisible();
  });
});
