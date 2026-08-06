/**
 * E2E: 조문 박스 표 → HTML 표 렌더 (소득세법 §55 세율표)
 *
 * 검증:
 *   HTML-1: "소득세법 제55조" → 팝업에 <table> 렌더 + 헤더("세 율")·세율 행 셀 표시.
 *           박스 문자(┌│)가 raw 텍스트로 노출되지 않음.
 *
 * 비고: 조문 본문은 **fixture mock**이다(`_helpers/law-api-mock`).
 *   ⚠️ fixture는 **실제 법제처 응답 원문**이어야 한다 — 실응답은 박스표가 개행 없이 한 줄로
 *   붙어서 오고(`…2022.12.31>┌───┬───┐│종합소득  │세  율`), 그것을 복원하는
 *   `restoreBoxTableLines` 전처리를 지키는 것이 이 spec의 존재 이유다. 손으로 만든 이상적인
 *   JSON을 넣으면 회귀 테스트가 조용히 무의미해진다.
 * 정책: [[feedback_browser_verify_with_playwright]] [[feedback_e2e_worktree_port_isolation]]
 */
import { test, expect, type Page } from "@playwright/test";
import { mockLawApi } from "./_helpers/law-api-mock";

async function search(page: Page, query: string) {
  const input = page.getByLabel("통합 검색창");
  await input.click();
  await input.fill(query);
  await page.getByRole("button", { name: /검색|라우팅 중/ }).first().click();
}

test.describe("조문 본문 — 박스 표 → HTML 표", () => {
  test.beforeEach(async ({ page }) => {
    await mockLawApi(page);
  });

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
