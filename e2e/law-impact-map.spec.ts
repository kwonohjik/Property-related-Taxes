/**
 * E2E: 법령 리서치 — 조문 영향 그래프(impact_map)
 *
 * 검증:
 *   IMP-1: "소득세법 89조 영향" → 라우팅 배너 impact_map + 조문 팝업 +
 *          영향 분석 자동 실행 → 도메인 그룹(대법원 판례/법령해석례/자치법규) 표시.
 *
 * 비고: 조문·영향 분석 모두 **fixture mock**이다(`_helpers/law-api-mock`) — 갱신은 `LAW_FIXTURE_CAPTURE=1`.
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

test.describe("법령 리서치 — 조문 영향 그래프", () => {
  test.beforeEach(async ({ page }) => {
    await mockLawApi(page);
  });

  test("IMP-1: '소득세법 89조 영향' → impact_map 라우팅 + 영향 분석", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/law");

    await search(page, "소득세법 89조 영향");

    // 라우팅 배너 — 신규 패턴(결정적)
    await expect(page.getByText("impact_map")).toBeVisible();

    // 조문 팝업(dialog) 열림
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // 영향 분석 자동 실행 → 도메인 그룹 라벨 (실 API → 넉넉히, 다중 매칭이므로 first)
    await expect(
      dialog.getByText(/대법원 판례|법령해석례|자치법규|인용한 결정을 법제처/).first(),
    ).toBeVisible({ timeout: 90_000 });
  });
});
