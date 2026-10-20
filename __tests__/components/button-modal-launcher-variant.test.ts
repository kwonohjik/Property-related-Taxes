import { describe, it, expect } from "vitest";
import { buttonVariants } from "@/components/ui/button";

/**
 * P0 앵커 — 모달 런처 버튼 통일 variant.
 * "자동" 배지(LandPriceLookupField: bg-green-100/text-green-800)와 동일 톤으로 통일.
 * 글자는 green-800 — green-700은 green-100 위 대비 4.497로 WCAG 4.5 미달(2026-10-20).
 * 설계: docs/02-design/features/modal-launcher-button-style.plan.md
 */
describe("Button modalLauncher variant (모달 런처 통일)", () => {
  it("연녹색 배지 톤을 렌더한다 ('자동' 배지와 동일)", () => {
    const cls = buttonVariants({ variant: "modalLauncher" });
    expect(cls).toContain("bg-green-100");
    expect(cls).toContain("text-green-800");
    expect(cls).not.toMatch(/(^|\s)text-green-700(\s|$)/);
    expect(cls).toContain("border-green-200");
    expect(cls).toContain("hover:bg-green-200");
  });

  it("green dark override가 없다 (배지와 전 테마 동일 — 계획 F3)", () => {
    const cls = buttonVariants({ variant: "modalLauncher" });
    // base cva의 dark:aria-invalid는 허용, variant 고유 green dark 톤만 없어야 함.
    expect(cls).not.toContain("dark:bg-green");
    expect(cls).not.toContain("dark:text-green");
  });

  it("죽은 aria-expanded 규칙이 없다 (plain onClick 런처 — 계획 F6)", () => {
    const cls = buttonVariants({ variant: "modalLauncher" });
    expect(cls).not.toContain("aria-expanded:bg-green");
  });
});
