/**
 * 장기임대 §97의4 감면 UI — E2E (R-3 활성화 확인)
 *
 * §97의4는 R-3 확정으로 isFullyImplemented=true 전환 → 라디오 활성·폼 렌더.
 *
 * worktree 실행: E2E_PORT=3100 npx playwright test e2e/transfer-rental-97-4.spec.ts
 */
import { test, expect } from "@playwright/test";

test.describe("양도세 §97의4 감면 패널 (R-3 활성)", () => {
  test("rental 그룹 펼침 → §97의4 선택 → 추가율 표 폼 렌더", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    // ── 양도일 입력 (등록일 낙관 fallback의 기준 — §97의4 시한 내) ──
    await page.getByTestId("transfer-date").getByLabel("연도").fill("2024");
    await page.getByTestId("transfer-date").getByLabel("월").fill("06");
    await page.getByTestId("transfer-date").getByLabel("일").fill("01");

    // ── 감면·공제 단계로 이동 ──
    await page.getByRole("button", { name: "감면·공제" }).click();

    // ── rental 그룹 펼침 ──
    await page.getByRole("button", { name: /장기임대주택/ }).click();

    // §97의4 항목 노출 + 클릭 (R-3 활성 — 더 이상 disabled 아님)
    const item974 = page.getByText("§97의4 — 장특공제 추가율", { exact: false }).first();
    await expect(item974).toBeVisible();
    await item974.click();

    // ── 입력 폼 렌더 확인 ──
    await expect(page.getByText("임대사업자 등록일", { exact: false }).first()).toBeVisible();
    // 추가율 표 안내 (6년 2% ~ 10년 10%)
    await expect(page.getByText(/6년 이상 ~ 7년 미만/).first()).toBeVisible();
    await expect(page.getByText(/10년 이상/).first()).toBeVisible();
  });
});
