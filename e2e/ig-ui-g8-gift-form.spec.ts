import { test, expect } from "@playwright/test";

/**
 * 상속·증여 UI 리뷰 G8 — 증여 마법사 입력 화면 축.
 *
 * · IG-154 — 입력 화면의 저장하기 버튼 2개가 구조적으로 항상 disabled였다
 *   (`if (result) return <ResultView/>` 조기 반환 아래에서 `result`는 항상 null).
 *
 * IG-026(사전증여 조회 필터 요약)은 모달을 직접 띄우는 렌더 anchor가 정본이다 —
 * `__tests__/components/calc/ig-ui-g8-prior-gift-modal.anchor.test.tsx`.
 */

test.describe("IG-154 — 증여 마법사 저장 버튼은 입력 기반으로 열린다", () => {
  test("빈 폼에서는 비활성, 증여일을 넣으면 활성 (형제인 상속세와 동형)", async ({ page }) => {
    await page.goto("/calc/gift-tax");

    // 헤더·하단 두 개 모두 저장 버튼이다 (접근성 이름은 SaveButton의 aria-label)
    const saveButtons = page.getByRole("button", { name: "현재 입력 저장" });
    await expect(saveButtons).toHaveCount(2);

    // ① 빈 폼 — 두 버튼 모두 비활성
    for (let i = 0; i < 2; i++) {
      await expect(saveButtons.nth(i)).toBeDisabled();
    }

    // ② 증여일 입력 → 「저장할 것」이 생긴다
    await page.getByLabel("연도").first().fill("2025");
    await page.getByLabel("월").first().fill("06");
    await page.getByLabel("일").first().fill("01");

    // 🔴 종전에는 결과를 계산하기 전까지 영원히 비활성이었다
    for (let i = 0; i < 2; i++) {
      await expect(saveButtons.nth(i)).toBeEnabled();
    }
  });
});
