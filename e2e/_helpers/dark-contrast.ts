import { expect, type Locator, type Page } from "@playwright/test";

/**
 * 다크 모드에서 대상 요소 안 글자의 대비가 기준(WCAG 일반 글자 4.5) 이상이다.
 * 글자색과, 조상 배경을 투명도까지 겹친 실제 바탕색으로 계산한다.
 * 계획서: docs/00-pm/ui-dark-low-contrast-residual.plan.md — 테스트 끝 상태를 그대로 다크로 바꿔 확인한다.
 *
 * 색 전환 효과(transition-colors)가 있으면 테마를 바꾼 직후 중간값이 잡힌다 → 잴 동안 끈다.
 */
export async function expectDarkContrast(page: Page, target: Locator, min = 4.5) {
  await page.emulateMedia({ media: "screen", colorScheme: "dark" });
  await page.addStyleTag({ content: "*,*::before,*::after{transition:none!important;animation:none!important}" });
  await expect(target.first()).toBeVisible();
  await expect
    .poll(
      () =>
        target.evaluateAll((els) => {
          const cv = document.createElement("canvas");
          cv.width = cv.height = 1;
          const ctx = cv.getContext("2d")!;
          const rgba = (css: string) => {
            ctx.clearRect(0, 0, 1, 1);
            ctx.fillStyle = "#000";
            ctx.fillStyle = css;
            ctx.fillRect(0, 0, 1, 1);
            const d = ctx.getImageData(0, 0, 1, 1).data;
            return [d[0], d[1], d[2], d[3] / 255];
          };
          const over = (t: number[], b: number[]) => [0, 1, 2].map((i) => t[i] * t[3] + b[i] * (1 - t[3])).concat(1);
          const bgOf = (el: Element | null): number[] => {
            if (!el) return [255, 255, 255, 1];
            const p = bgOf(el.parentElement);
            const b = rgba(getComputedStyle(el).backgroundColor);
            return b[3] > 0 ? over(b, p) : p;
          };
          const lum = (c: number[]) => {
            const f = (x: number) => ((x /= 255) <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
            return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
          };
          let worst = 99;
          for (const root of els) {
            for (const e of [root, ...root.querySelectorAll("*")]) {
              if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim())) continue;
              const bg = bgOf(e);
              const fg = over(rgba(getComputedStyle(e).color), bg);
              const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
              worst = Math.min(worst, (a + 0.05) / (b + 0.05));
            }
          }
          return worst; // 반올림 금지 — green-700 on green-100은 4.497이라 반올림하면 4.50으로 통과한다
        }),
      { message: "다크 모드 글자 대비(최저)" },
    )
    .toBeGreaterThanOrEqual(min);
}
