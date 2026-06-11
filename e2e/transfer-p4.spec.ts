/**
 * P4 — §98의2·§98의4 UI E2E
 *
 * worktree 실행: E2E_PORT=3100 npx playwright test e2e/transfer-p4.spec.ts
 */
import { test, expect } from "@playwright/test";

test.describe("양도세 P4 감면 패널", () => {
  test("미분양 그룹 → §98의2·§98의4 폼 렌더", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    await page.getByLabel("연도").first().fill("2024");
    await page.getByLabel("월").first().fill("06");
    await page.getByLabel("일").first().fill("01");

    await page.getByRole("button", { name: "감면·공제" }).click();
    await page.getByRole("button", { name: /미분양주택/ }).click();

    // §98의2 — 특칙 안내
    const item982 = page.getByText("§98의2 — 지방 미분양 일반세율", { exact: false }).first();
    await expect(item982).toBeVisible();
    await item982.click();
    await expect(page.getByText(/수도권 밖 미분양주택 확인/).first()).toBeVisible();
    await expect(page.getByText(/표2\s*보유기간별 공제율/).first()).toBeVisible();

    // §98의4 — 비거주자 토글 + 중과 비배제 안내
    const item984 = page.getByText("§98의4 — 비거주자 일반주택 10%", { exact: false }).first();
    await item984.click();
    await expect(page.getByText(/국내사업장 없는 비거주자/).first()).toBeVisible();
    await expect(page.getByText(/중과 배제 대상이 아닙니다/).first()).toBeVisible();
  });
});
