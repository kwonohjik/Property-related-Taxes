/**
 * §99의4 농어촌주택 — 주택수 제외 UI E2E
 *
 * isFullyImplemented=true 전환 확인: new_housing 그룹 라디오 활성 → 폼 렌더.
 *
 * worktree 실행: E2E_PORT=3100 npx playwright test e2e/transfer-99-4.spec.ts
 * ⚠️ stale 서버 주의 — lsof -ti :3100 | xargs kill 후 실행.
 */
import { test, expect } from "@playwright/test";

test.describe("양도세 §99의4 농어촌주택 패널", () => {
  test("신축주택 그룹 펼침 → §99의4 농어촌 선택 → 폼 렌더", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    // ── 양도일 입력 ──
    await page.getByTestId("transfer-date").getByLabel("연도").fill("2024");
    await page.getByTestId("transfer-date").getByLabel("월").fill("06");
    await page.getByTestId("transfer-date").getByLabel("일").fill("01");

    // ── 감면·공제 단계로 이동 ──
    await page.getByRole("button", { name: "감면·공제" }).click();

    // ── new_housing 그룹 펼침 ──
    await page.getByRole("button", { name: /신축주택/ }).click();

    // §99의4 농어촌 라디오 활성 + 클릭 (D-1 낙관 통과 — 시한은 evaluator 판정)
    const item994 = page.getByText("§99의4 (농어촌주택) — 주택수 제외", { exact: false }).first();
    await expect(item994).toBeVisible();
    await item994.click();

    // ── 입력 폼 렌더 확인 ──
    await expect(page.getByText("농어촌주택 취득 정보", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("취득 당시 기준시가 합계", { exact: false }).first()).toBeVisible();
    // 가액 한도 hint (3억/한옥 4억)
    await expect(page.getByText(/3억 이하/).first()).toBeVisible();
    // 소재지 확인 토글
    await expect(page.getByText("소재지 요건 충족 확인", { exact: false }).first()).toBeVisible();
  });
});
