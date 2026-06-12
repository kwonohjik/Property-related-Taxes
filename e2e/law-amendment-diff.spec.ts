/**
 * E2E: 법령 리서치 — 개정 신구대조(time_travel via amendment_track)
 *
 * 검증:
 *   DIFF-1: "소득세법 89조 개정" → 라우팅 배너 amendment_article + 리서치 체인 탭 전환 +
 *           "최근 개정 신구대조" 섹션 표시 (diff 또는 "본문 동일").
 *
 * 비고:
 *   - route-router는 순수 정규식이라 라우팅 배너는 결정적.
 *   - 체인 본문은 법제처 API(KOREAN_LAW_OC) 의존 → 섹션 헤딩 노출까지만 단정.
 * 정책: [[feedback_browser_verify_with_playwright]] [[feedback_e2e_worktree_port_isolation]]
 */
import { test, expect, type Page } from "@playwright/test";

async function search(page: Page, query: string) {
  const input = page.getByLabel("통합 검색창");
  await input.click();
  await input.fill(query);
  await page.getByRole("button", { name: /검색|라우팅 중/ }).first().click();
}

test.describe("법령 리서치 — 개정 신구대조", () => {
  test("DIFF-1: '소득세법 89조 개정' → amendment_article 라우팅 + 신구대조 섹션", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto("/law");

    await search(page, "소득세법 89조 개정");

    // 라우팅 배너 — 신규 패턴(결정적)
    await expect(page.getByText("amendment_article")).toBeVisible();

    // 리서치 체인 탭으로 이동 + 신구대조 섹션 헤딩 (실 API → 넉넉한 타임아웃)
    await expect(page.getByText(/최근 개정 신구대조/)).toBeVisible({ timeout: 60_000 });
  });
});
