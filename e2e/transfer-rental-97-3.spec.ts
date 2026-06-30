/**
 * 장기임대 §97의3 감면 UI — E2E (시나리오 A 축약)
 *
 * 1) 자산 취득일 입력 (buildPeriodContext의 시한 판정 fallback 활성화)
 * 2) 사이드바로 감면 단계 이동 (자유 이동 허용 — 최종 계산 시 전체 재검증 정책)
 * 3) rental 그룹 펼침 → §97의3 라디오 활성·선택 → 입력 폼 렌더 확인
 *
 * worktree 실행: E2E_PORT=3100 npx playwright test e2e/transfer-rental-97-3.spec.ts
 */
import { test, expect } from "@playwright/test";

test.describe("양도세 §97의3 감면 패널", () => {
  test("rental 그룹 펼침 → §97의3 선택 → 폼 렌더", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    // ── Step 1: 양도일 입력 (등록일 낙관 fallback의 기준 — §97의3 시한 ~2027 내) ──
    await page.getByTestId("transfer-date").getByLabel("연도").fill("2024");
    await page.getByTestId("transfer-date").getByLabel("월").fill("06");
    await page.getByTestId("transfer-date").getByLabel("일").fill("01");

    // ── 사이드바: 감면·공제 단계로 이동 ──
    await page.getByRole("button", { name: "감면·공제" }).click();

    // ── rental 그룹 펼침 ──
    await page.getByRole("button", { name: /장기임대주택/ }).click();

    // §97의3 항목 노출 + 클릭 (등록일 미입력 → 양도일 낙관 fallback으로 활성)
    const item973 = page.getByText("§97의3 — 장특공제율 70%", { exact: false }).first();
    await expect(item973).toBeVisible();
    await item973.click();

    // ── 입력 폼 렌더 확인 ──
    await expect(page.getByText("임대사업자 등록일", { exact: false }).first()).toBeVisible();
    // R-5 확정 hint — 기준시가 한도 (령 §97의3③4호)
    await expect(page.getByText(/6억|3억/).first()).toBeVisible();
    // 3-state 임대료 위반 위젯
    await expect(page.getByText(/임대료/).first()).toBeVisible();
  });
});
