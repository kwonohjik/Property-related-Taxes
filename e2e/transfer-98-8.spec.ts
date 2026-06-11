/**
 * P1 — §98의8 준공후미분양 50% + §99 신축주택(IMF 1차) UI E2E
 *
 * isFullyImplemented=true 전환 확인: 라디오 활성 → 폼 렌더 (hint 6억·135㎡ / 국민주택).
 *
 * worktree 실행: E2E_PORT=3100 npx playwright test e2e/transfer-98-8.spec.ts
 * ⚠️ stale 서버 주의 — lsof -ti :3100 | xargs kill 후 실행.
 */
import { test, expect } from "@playwright/test";

test.describe("양도세 P1 차감형 감면 패널", () => {
  test("미분양 그룹 → §98의8 폼 렌더 + 신축 그룹 → §99 폼 렌더", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    // ── 양도일 입력 ──
    await page.getByLabel("연도").first().fill("2024");
    await page.getByLabel("월").first().fill("06");
    await page.getByLabel("일").first().fill("01");

    // ── 감면·공제 단계로 이동 ──
    await page.getByRole("button", { name: "감면·공제" }).click();

    // ── §98의8: 미분양주택 그룹 펼침 → 라디오 활성 + 폼 렌더 ──
    await page.getByRole("button", { name: /미분양주택/ }).click();
    const item988 = page.getByText("§98의8 — 준공후미분양 6억·135㎡↓ 50%", { exact: false }).first();
    await expect(item988).toBeVisible();
    await item988.click();
    await expect(page.getByText("최초 매매계약 정보", { exact: false }).first()).toBeVisible();
    await expect(page.getByText(/6억원 이하/).first()).toBeVisible();
    await expect(page.getByText(/135㎡ 이하/).first()).toBeVisible();
    await expect(page.getByText("임대개시일", { exact: false }).first()).toBeVisible();

    // ── §99: 신축주택 그룹 펼침 → 라디오 활성 + 폼 렌더 ──
    await page.getByRole("button", { name: /신축주택/ }).click();
    const item99 = page.getByText("§99 — 신축주택 양도세 감면 (IMF 1차)", { exact: false }).first();
    await expect(item99).toBeVisible();
    await item99.click();
    await expect(page.getByText("취득 유형·시기", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("주택건설사업자로부터 취득", { exact: false }).first()).toBeVisible();
    await expect(page.getByText(/재개발·재건축하여 취득한 신축주택/).first()).toBeVisible();
  });
});
