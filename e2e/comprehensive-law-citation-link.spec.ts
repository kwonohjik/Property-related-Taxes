/**
 * E2E: 종합부동산세 마법사 법조문 링크 배지(LawArticleModal) → 조문 HTML 팝업
 *
 * 검증 대상: Phase 3에서 추가한 종부세 입력폼 LawArticleModal 배지.
 *   LawArticleModal은 6대세목 공용 컴포넌트 — 팝업 헤더는 parseLawRef(props) 기반(법제처 API 무관 즉시 렌더).
 *
 * 진입: 종부세 마법사 Step1(기본 정보) — YearLawHintCard가 무조건 렌더(기본 현재연도 ≥ 2023).
 *   세율 도움말 "§9①2호" 배지 + 세부담상한 도움말 "§10" 배지가 진입 즉시 노출.
 *
 * CLAW-1: §9①2호 배지 클릭 → 팝업 헤더 "종합부동산세법 제9조"
 * CLAW-2: §10 배지 클릭 → 헤더 "종합부동산세법 제10조" + ESC 닫힘
 * CLAW-3: 과세기준일 §3 배지 → 헤더 "종합부동산세법 제3조" (구 "§16①" 오인용 정정 anchor)
 *
 * 비고: 조문 본문은 법제처 API(KOREAN_LAW_OC) 의존 → 팝업 헤더(법령명·조문번호, props 기반)만 단정.
 *       본문 텍스트는 비단정(property-law-citation-link.spec.ts 동일 철학).
 * 정책: [[feedback_browser_verify_with_playwright]] · [[feedback_e2e_worktree_port_isolation]]
 * worktree 실행: E2E_PORT=3102 npx playwright test e2e/comprehensive-law-citation-link.spec.ts
 *   ⚠️ stale 서버 주의 — lsof -ti :3102 | xargs kill 후 실행.
 */
import { test, expect, type Page } from "@playwright/test";

/** 종부세 마법사 첫 화면(Step1 기본 정보) 도달 */
async function gotoComprehensiveStep1(page: Page) {
  await page.goto("/calc/comprehensive-tax");
  // 연도 선택 라디오가 보이면 Step1 도달
  await page.getByRole("radio", { name: String(new Date().getFullYear()) }).waitFor();
}

test.describe("종합부동산세 마법사 법조문 링크 → 조문 팝업", () => {
  test("CLAW-1: §9①2호 배지 → 종합부동산세법 제9조 팝업 헤더", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoComprehensiveStep1(page);

    // YearLawHintCard(연도 세법 요약)는 기본 접힘 — 세율·세부담상한 배지는 본문 안 → 펼치기 선행
    await page.getByRole("button", { name: /펼치기/ }).first().click();

    // 세율 도움말 배지 — 버튼 텍스트 "§9①2호 ↗" (legalBasis="종합부동산세법 §9")
    const badge = page.getByRole("button", { name: /§9①2호/ });
    await expect(badge).toBeVisible();
    await badge.click();

    // 조문 팝업 헤더 — props 기반(parseLawRef: "종합부동산세법 §9" → "종합부동산세법 제9조")
    await expect(
      page.getByRole("dialog").getByText("종합부동산세법 제9조"),
    ).toBeVisible();
  });

  test("CLAW-2: §10 배지 → 종합부동산세법 제10조 헤더 + ESC 닫힘", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoComprehensiveStep1(page);

    // YearLawHintCard(연도 세법 요약)는 기본 접힘 — 세율·세부담상한 배지는 본문 안 → 펼치기 선행
    await page.getByRole("button", { name: /펼치기/ }).first().click();

    // 세부담상한 도움말 배지 — 버튼 텍스트 "§10 ↗" (legalBasis="종합부동산세법 §10")
    const badge = page.getByRole("button", { name: /§10/ }).first();
    await expect(badge).toBeVisible();
    await badge.click();

    // parseLawRef: "종합부동산세법 §10" → "종합부동산세법 제10조"
    const title = page.getByRole("dialog").getByText("종합부동산세법 제10조");
    await expect(title).toBeVisible();

    // ESC로 조문 팝업 닫힘
    await page.keyboard.press("Escape");
    await expect(title).toBeHidden();
  });

  test("CLAW-3: 과세기준일 §3 배지 → 종합부동산세법 제3조 (구 §16① 정정)", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoComprehensiveStep1(page);

    // 과세기준일 도움말 배지 — label="§3" (legalBasis="종합부동산세법 §3")
    const badge = page.getByRole("button", { name: /§3/ });
    await expect(badge).toBeVisible();
    await badge.click();

    await expect(
      page.getByRole("dialog").getByText("종합부동산세법 제3조"),
    ).toBeVisible();
  });
});
