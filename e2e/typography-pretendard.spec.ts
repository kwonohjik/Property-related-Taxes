import { test, expect } from "@playwright/test";

/**
 * Phase 0 앵커 — Pretendard self-host 배선 검증.
 *
 * 배선 전: app/globals.css `--font-sans: var(--font-sans)` 순환참조로 Geist Sans 미배선
 *          → html `@apply font-sans` 가 시스템 sans 폴백(Pretendard 미로드).
 * 배선 후: --font-sans → var(--font-pretendard)(next/font/local) → computed fontFamily 에
 *          Pretendard 해시 패밀리 포함 + document.fonts 에 Pretendard face 로드.
 *
 * 계획 §2.3·§7: 주 검증 = getComputedStyle 단언(스냅샷 아님 — 폰트 교체로 사전 baseline 무의미).
 */
test("html/body 폰트가 Pretendard로 배선된다 (P0)", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);

  const fontFamily = await page.evaluate(
    () => getComputedStyle(document.body).fontFamily,
  );
  const loadedFaces = await page.evaluate(() =>
    Array.from(document.fonts).map((f) => f.family),
  );
  // 관측 로그 — 실제 해시 패밀리명 확인용(next/font/local 생성 이름).
  console.log("[anchor] computed body font-family:", fontFamily);
  console.log("[anchor] loaded font faces:", JSON.stringify(loadedFaces));

  // Pretendard 배선 성공 시 해시 패밀리명(__pretendard_*)에 'pretendard' 토큰 포함.
  expect(fontFamily.toLowerCase()).toContain("pretendard");
});
