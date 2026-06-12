/**
 * E2E: 법령 리서치 통합 검색 → "제" 생략 조문 표기 → 조문 팝업
 *
 * 검증:
 *   POPUP-1: "소득세법 77조"(제 생략) 검색 → 라우팅 배너 specific_article_no_je +
 *            ArticleModal(dialog) 팝업 열림 + 헤더 "소득세법 제77조".
 *   POPUP-2: "민법 제750조"(제 포함) 검색 → 동일하게 팝업으로 표시(인라인 통일).
 *
 * 비고:
 *   - route-router API는 순수 정규식(routeQuery)이라 라우팅 배너는 외부 의존 없이 결정적.
 *   - 조문 본문 로딩은 법제처 API(KOREAN_LAW_OC) 의존 → 로컬 미설정 시 본문은 실패할 수 있으나
 *     팝업 헤더(법령명·조문번호)는 props 기반이라 항상 노출. 본문 텍스트는 단정하지 않음.
 * 정책: [[feedback_browser_verify_with_playwright]] [[korean-law-citation-verify]]
 */
import { test, expect, type Page } from "@playwright/test";

async function search(page: Page, query: string) {
  const input = page.getByLabel("통합 검색창");
  await input.click();
  await input.fill(query);
  await page.getByRole("button", { name: /검색|라우팅 중/ }).first().click();
}

test.describe("법령 리서치 — 조문 팝업", () => {
  test("POPUP-1: '소득세법 77조'(제 생략) → 팝업 + 라우팅 배너", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/law");

    await search(page, "소득세법 77조");

    // 라우팅 배너 — 신규 패턴명(결정적, 외부 의존 없음)
    await expect(page.getByText("specific_article_no_je")).toBeVisible();

    // 조문 팝업(dialog) 열림 + 헤더(법령명 제N조)
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/소득세법/)).toBeVisible();
    await expect(dialog.getByText(/제77조/)).toBeVisible();

    // v3 Phase E — 현행성 라벨 [현행] (조문 본문 로드 성공 시). 법제처 API 의존이라 관대하게.
    await expect(dialog.getByText("[현행]")).toBeVisible({ timeout: 30_000 });
  });

  test("POPUP-2: '민법 제750조'(제 포함) → 동일하게 팝업 표시", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/law");

    await search(page, "민법 제750조");

    await expect(page.getByText("specific_article")).toBeVisible();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/제750조/)).toBeVisible();

    // ESC로 닫힘
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
});
