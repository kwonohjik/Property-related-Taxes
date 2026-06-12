/**
 * E2E: 조문 박스 표 → HTML 표 렌더 (소득세법 §55 세율표)
 *
 * 검증:
 *   HTML-1: "소득세법 제55조" → 팝업에 <table> 렌더 + 헤더("세 율")·세율 행 셀 표시.
 *           박스 문자(┌│)가 raw 텍스트로 노출되지 않음.
 *
 * 비고: 조문 본문은 법제처 API 의존 → 본문 로드 후 단정.
 * 정책: [[feedback_browser_verify_with_playwright]] [[feedback_e2e_worktree_port_isolation]]
 */
import { test, expect, type Page } from "@playwright/test";

async function search(page: Page, query: string) {
  const input = page.getByLabel("통합 검색창");
  await input.click();
  await input.fill(query);
  await page.getByRole("button", { name: /검색|라우팅 중/ }).first().click();
}

test.describe("조문 본문 — 박스 표 → HTML 표", () => {
  test("HTML-1: 소득세법 §55 세율표 → <table> 렌더", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/law");

    await search(page, "소득세법 제55조");

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("[현행]")).toBeVisible({ timeout: 30_000 });

    // HTML <table> 렌더 + 표 내용
    const table = dialog.locator("table");
    await expect(table.first()).toBeVisible({ timeout: 30_000 });
    await expect(table.getByText("과세표준의 6퍼센트")).toBeVisible();
    await expect(table.getByText(/10억원 초과/)).toBeVisible();

    // 박스 드로잉 문자가 raw로 노출되지 않음
    await expect(dialog).not.toContainText("┌");
    await expect(dialog).not.toContainText("├");
  });
});
