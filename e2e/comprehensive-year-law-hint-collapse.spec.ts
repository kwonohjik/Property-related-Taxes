import { test, expect } from "@playwright/test";

/**
 * 종합부동산세 YearLawHintCard 접기 (도움말 간소화 declutter §5-B C1)
 *
 * Step1(과세연도)에서 연도별 세법 요약 카드(기본공제·세율·세부담상한)를
 * CollapsibleHintCard로 감싸 기본 접힘 + 토글 펼침으로 전환.
 *
 * - CPT-DECLUTTER-1: summary 항상 노출 / 본문 기본 접힘 / 토글 클릭 시 펼침
 *
 * worktree: E2E_PORT=3100 npx playwright test e2e/comprehensive-year-law-hint-collapse.spec.ts
 */

const PAGE = "/calc/comprehensive-tax";

test.describe("종부세 YearLawHintCard 접기 (declutter)", () => {
  test("CPT-DECLUTTER-1: 연도 세법 요약 본문 기본 접힘 + 토글 펼침", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto(PAGE);
    await page.getByRole("radio", { name: "2024" }).check();

    // summary(요약 한 줄)는 항상 노출
    await expect(
      page.getByText(/2024 귀속 적용 기준/).first(),
    ).toBeVisible();

    // 본문(기본공제 줄)은 기본 접힘 → 화면에서 숨김 (hidden print:block)
    const detail = page.getByText(/기본공제: 일반/).first();
    await expect(detail).toBeHidden();

    // 토글 클릭 → 본문 펼침
    await page.getByRole("button", { name: /펼치기/ }).first().click();
    await expect(detail).toBeVisible();
  });
});
