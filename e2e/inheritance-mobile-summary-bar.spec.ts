/**
 * E2E: 상속세 모바일 접이식 합계 미니바(⑧)
 *
 * 검증:
 *   MOB-1: 모바일 뷰포트 — 미니바 노출 + 접힘(사이드바 내용 미표시) → 펼침 → 접힘.
 *   MOB-2: 데스크톱 뷰포트 — 미니바 숨김, 좌측 전체 사이드바 표시.
 *
 * 설계: 모바일(<lg 1024px)은 미니바, 데스크톱은 좌측 sticky 사이드바. 펼침은 동일
 *   InheritanceSidebar 재사용(단일 출처). lg breakpoint=1024px 기준.
 * 정책: [[feedback_browser_verify_with_playwright]]
 */
import { test, expect, type Page } from "@playwright/test";
import {
  fillDateAndVerify,
  addHeir,
  addLandAsset,
  nextSteps,
} from "./_helpers/tax-flow";

/** 상속재산 1건 입력 상태(합계 > 0)까지 진행 — 미니바/사이드바 표시 게이트 충족 */
async function setupWithInput(page: Page) {
  await fillDateAndVerify(page, { year: "2024", month: "6", day: "10" });
  await addHeir(page, "heir", "child");
  await nextSteps(page, 1); // → 상속재산
  await addLandAsset(page, { area: "300", unitPrice: "10000000" });
}

test.describe("상속세 모바일 합계 미니바", () => {
  test("MOB-1: 모바일 — 미니바 노출 + 접이/펼침", async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 390, height: 844 }); // 모바일
    await page.goto("/calc/inheritance-tax");
    await setupWithInput(page);

    const bar = page.getByTestId("inheritance-mobile-summary");
    await expect(bar).toBeVisible();

    // 접힘 기본 — 펼침 사이드바("합계 미리보기") 미표시
    await expect(bar.getByText("합계 미리보기")).toHaveCount(0);

    // 펼침 → 사이드바 노출
    await bar.getByRole("button").first().click();
    await expect(bar.getByText("합계 미리보기")).toBeVisible();

    // 다시 접힘
    await bar.getByRole("button").first().click();
    await expect(bar.getByText("합계 미리보기")).toHaveCount(0);
  });

  test("MOB-2: 데스크톱 — 미니바 숨김 + 좌측 사이드바 표시", async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1440, height: 900 }); // 데스크톱
    await page.goto("/calc/inheritance-tax");
    await setupWithInput(page);

    // 미니바는 데스크톱에서 숨김(lg:hidden)
    await expect(page.getByTestId("inheritance-mobile-summary")).toBeHidden();
    // 좌측 전체 사이드바 표시
    await expect(page.getByText("합계 미리보기")).toBeVisible();
  });
});
