/**
 * E2E: 법령 리서치 — 행위시법 판단(applicable_law)
 *
 * 검증:
 *   APP-1: "2021년 시행 소득세법 89조" 검색 → 라우팅 배너 applicable_law +
 *          법령·조문 탭의 "기준일 시점 조회(행위시법)" 패널 자동 펼침 + 입력 prefill.
 *   APP-2: 패널 수동 입력(법령명·조문·기준일) → 행위시법 조회 버튼 노출.
 *
 * 비고:
 *   - route-router는 순수 정규식이라 라우팅 배너·패널 펼침은 외부 의존 없이 결정적.
 *   - 조문 본문·부칙은 법제처 API(KOREAN_LAW_OC) 의존 → 결과 카드 내용은 단정하지 않음.
 * 정책: [[feedback_browser_verify_with_playwright]] [[feedback_e2e_worktree_port_isolation]]
 */
import { test, expect, type Page } from "@playwright/test";

async function search(page: Page, query: string) {
  const input = page.getByLabel("통합 검색창");
  await input.click();
  await input.fill(query);
  await page.getByRole("button", { name: /검색|라우팅 중/ }).first().click();
}

test.describe("법령 리서치 — 행위시법", () => {
  test("APP-1: '2021년 시행 소득세법 89조' → applicable_law 라우팅 + 패널 펼침", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto("/law");

    await search(page, "2021년 시행 소득세법 89조");

    // 라우팅 배너 — 신규 패턴명(결정적)
    await expect(page.getByText("applicable_law")).toBeVisible();

    // 행위시법 패널이 자동으로 펼쳐지고 기준일 입력이 prefill 됨
    await expect(page.getByText(/기준일 시점 조회 \(행위시법\)/)).toBeVisible();
    await expect(page.getByText("행위시법 조회")).toBeVisible();
  });

  test("APP-2: 패널 수동 펼침 + 입력 필드 노출", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/law");

    // 패널 토글 클릭하여 펼침
    await page.getByText(/기준일 시점 조회 \(행위시법\)/).click();

    // 법령명·조문번호·기준일·조회 버튼 노출
    await expect(page.getByText("법령명")).toBeVisible();
    await expect(page.getByText("조문번호")).toBeVisible();
    await expect(page.getByText(/기준일 \(양도일/)).toBeVisible();
    await expect(page.getByRole("button", { name: "행위시법 조회" })).toBeVisible();
  });
});
