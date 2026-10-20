import { expect, type Page } from "@playwright/test";

/**
 * 375px에서 페이지 전체가 가로로 스크롤되지 않는다(문서 폭 ≤ 화면 폭).
 * 표·탭·고정 폭 칸이 화면 밖으로 나가면 문서가 넓어져 모바일에서 옆으로 밀린다.
 * 계획서: docs/00-pm/ui-narrow-375-page-hscroll.plan.md — 테스트 끝 상태를 그대로 375로 줄여 확인한다.
 */
export async function expectNoPageHScroll(page: Page, width = 375) {
  const vp = page.viewportSize();
  // 인쇄 매체를 에뮬레이트한 채 끝난 테스트가 있다 — 인쇄에서는 표가 일부러 잘리지 않게(print:overflow-visible) 펼쳐지므로 화면 매체로 잰다
  await page.emulateMedia({ media: "screen" });
  await page.setViewportSize({ width, height: vp?.height ?? 900 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), { message: `${width}px 페이지 가로 스크롤` })
    .toBeLessThanOrEqual(0);
}
