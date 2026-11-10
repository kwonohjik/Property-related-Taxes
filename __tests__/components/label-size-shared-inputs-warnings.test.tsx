/**
 * 라벨 타이포그래피 정본(components/calc/CLAUDE.md 「라벨 타이포그래피 규칙」) — 공용 입력 자식·결과 경고 블록.
 * - 필드 라벨 = text-sm, hint = text-xs(긴 보조 문단 text-caption), 경고 = text-xs. text-micro는 번호배지·pill 전용.
 * - 대상: New99LuxuryHouseFields · ReductionPhdInput(§99·§99의3·§98 계열 PHD 공용) · ReductionDetailWarnings(결과 카드 ⚠ 블록).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { render } from "@testing-library/react";
import { ReductionDetailWarnings } from "@/components/calc/results/transfer/ReductionDetailWarnings";

const src = (p: string) => readFileSync(p, "utf8");

describe("공용 입력 자식 — 라벨·hint 정본 클래스", () => {
  for (const p of ["components/calc/transfer/New99LuxuryHouseFields.tsx", "components/calc/transfer/ReductionPhdInput.tsx"]) {
    it(`${p}: text-micro 문단이 없고 필드 label은 text-sm`, () => {
      const s = src(p);
      expect(s).not.toMatch(/<p[^>]*text-micro/);
      expect(s).not.toMatch(/<label[^>]*\btext-xs\b/);
      expect(s).toMatch(/<label[^>]*\btext-sm\b/);
    });
  }
});

describe("ReductionDetailWarnings — 경고 문단은 text-xs", () => {
  it("문단마다 text-xs가 붙는다(부모 글자 크기를 물려받지 않는다)", () => {
    const r = render(<ReductionDetailWarnings detail={{ warnings: ["확인 필요: 시험 문구"] } as never} />);
    const ps = r.container.querySelectorAll('[data-testid="reduction-detail-warnings"] p');
    expect(ps.length).toBe(1);
    for (const p of Array.from(ps)) expect(p.className).toContain("text-xs");
  });
});
