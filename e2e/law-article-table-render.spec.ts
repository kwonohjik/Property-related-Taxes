/**
 * E2E: 조문 팝업 표 렌더 + 제목 중복 버그 수정 (법인세법 §55 세율표)
 *
 * 검증:
 *   TBL-1: "법인세법 제55조" → 팝업에 <img> raw 태그 노출 없음 + 제목("세율") 표시.
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

test.describe("조문 팝업 — 표 렌더 / 제목 중복", () => {
  test("TBL-1: 법인세법 §55 세율표 → <img> 노출 없음 + 제목 정상", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/law");

    await search(page, "법인세법 제55조");

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // 본문 로드 대기 — [현행] 배지가 본문 도착 신호
    await expect(dialog.getByText("[현행]")).toBeVisible({ timeout: 30_000 });

    // ① 표 깨짐 버그: raw <img 태그가 화면에 노출되지 않아야 함
    await expect(dialog).not.toContainText("<img");
    await expect(dialog).not.toContainText("flDownload");

    // ② 제목 표시 (괄호 안 "세율")
    await expect(dialog.getByText("세율").first()).toBeVisible();
  });
});
