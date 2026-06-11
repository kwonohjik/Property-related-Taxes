/**
 * P2 — §98의7 9억↓ 미분양 + §99의2 신축·미분양·1세대1주택 하이브리드 UI E2E
 *
 * isFullyImplemented=true 전환 확인: 라디오 활성 → 폼 렌더 (9억 hint / 6억 OR 85㎡ + 유형 라디오).
 *
 * worktree 실행: E2E_PORT=3100 npx playwright test e2e/transfer-p2-hybrid.spec.ts
 * ⚠️ stale 서버 주의 — lsof -ti :3100 | xargs kill 후 실행.
 */
import { test, expect } from "@playwright/test";

test.describe("양도세 P2 하이브리드 감면 패널", () => {
  test("미분양 그룹 → §98의7 폼 렌더 + §99의2 폼 렌더", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    // ── 양도일 입력 ──
    await page.getByLabel("연도").first().fill("2024");
    await page.getByLabel("월").first().fill("06");
    await page.getByLabel("일").first().fill("01");

    // ── 감면·공제 단계로 이동 ──
    await page.getByRole("button", { name: "감면·공제" }).click();

    // ── §98의7: 미분양주택 그룹 펼침 → 라디오 활성 + 폼 렌더 ──
    await page.getByRole("button", { name: /미분양주택/ }).click();
    const item987 = page.getByText("§98의7 — 9억↓ 미분양 100%", { exact: false }).first();
    await expect(item987).toBeVisible();
    await item987.click();
    await expect(page.getByText("최초 매매계약 정보", { exact: false }).first()).toBeVisible();
    await expect(page.getByText(/9억원 이하/).first()).toBeVisible();
    await expect(page.getByText(/2012\.9\.24~2012\.12\.31/).first()).toBeVisible();

    // ── §99의2: 같은 그룹 라디오 전환 → 폼 렌더 ──
    const item992 = page.getByText("§99의2 — 신축·미분양·1세대1주택 100%", { exact: false }).first();
    await expect(item992).toBeVisible();
    await item992.click();
    await expect(page.getByText("대상 주택 유형", { exact: false }).first()).toBeVisible();
    await expect(page.getByText(/하나만 충족해도 적용/).first()).toBeVisible();
    await expect(page.getByText(/85㎡ 이하/).first()).toBeVisible();
    await expect(page.getByText("1세대1주택자의 주택", { exact: false }).first()).toBeVisible();
  });
});
