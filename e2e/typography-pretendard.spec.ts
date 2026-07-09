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

/**
 * Phase 1 앵커 — 마법사 단계 제목(h2) 16→18px 승격.
 * 승격 전: text-base(16px) — 단계 제목과 섹션 제목이 동일 크기(계층 붕괴).
 * 승격 후: text-lg(18px) — 페이지 24 → 단계 18 → 섹션 16 계층 분리.
 */
test("마법사 단계 제목(h2)이 18px(text-lg)로 승격된다 (P1)", async ({ page }) => {
  await page.goto("/calc/transfer-tax");
  await page.locator("h2").first().waitFor({ state: "visible" });

  // 페이지 내 h2 중 단계 제목(text-lg=18px)이 존재하는지 — 사이드바 h2(text-sm=14px)와 공존.
  const sizes = await page
    .locator("h2")
    .evaluateAll((els) => els.map((e) => getComputedStyle(e).fontSize));
  console.log("[anchor] transfer-tax h2 fontSizes:", JSON.stringify(sizes));

  expect(sizes).toContain("18px");
});

/**
 * Phase 3 앵커 — 오프스케일 커스텀 유틸이 실사용되어 정확히 렌더되는지.
 * P0에서 정의만 했고(미사용→Tailwind 미생성), P3에서 258파일이 사용 → 이제 번들에 생성됨.
 */
test("커스텀 유틸 text-micro=10px · text-caption=11px 렌더 (P3)", async ({ page }) => {
  await page.goto("/");
  const sizes = await page.evaluate(() => {
    const measure = (cls: string) => {
      const el = document.createElement("span");
      el.className = cls;
      el.textContent = "가";
      document.body.appendChild(el);
      const fs = getComputedStyle(el).fontSize;
      el.remove();
      return fs;
    };
    return { micro: measure("text-micro"), caption: measure("text-caption") };
  });
  console.log("[anchor] micro/caption fontSize:", JSON.stringify(sizes));

  expect(sizes.micro).toBe("10px");
  expect(sizes.caption).toBe("11px");
});
