/**
 * A-1 (Pre-Do) — 외화 → 원화 정수 환산 (계획서 엔진 K-23 · K-27).
 * 부동소수 `Math.floor(a * r)`은 1원 과소가 나므로(국외주식 `foreign-stock.ts`가 같은 식) 십진 정확 환산이어야 한다.
 */
import { describe, it, expect } from "vitest";
import { toKrw } from "@/lib/tax-engine/foreign-realestate/fx";
import { TaxCalculationError } from "@/lib/tax-engine/tax-errors";

/** 독립 기준 구현 — 십진 문자열을 직접 쪼개 BigInt로 계산(구현의 decimalizeRatio와 무관). */
function referenceFloor(a: string, r: string): number {
  const split = (s: string) => {
    const [i, f = ""] = s.split(".");
    return { n: BigInt(i + f), k: f.length };
  };
  const A = split(a);
  const R = split(r);
  return Number((A.n * R.n) / 10n ** BigInt(A.k + R.k));
}

describe("A-1 — 정수 환산 toKrw", () => {
  it("K-23: 400000 × 1300.10 = 520,040,000 (부동소수는 520,039,999 — 이 함수가 아니라 JS 식이 틀림)", () => {
    expect(Math.floor(400000 * 1300.1)).toBe(520_039_999); // 함정 실측 고정
    expect(toKrw(400000, 1300.1)).toBe(520_040_000);
  });

  it("K-23: 400000 × 1300.09 = 520,036,000 (부동소수는 520,035,999)", () => {
    expect(Math.floor(400000 * 1300.09)).toBe(520_035_999);
    expect(toKrw(400000, 1300.09)).toBe(520_036_000);
  });

  it("교재 K-1 환산 3종", () => {
    expect(toKrw(900_000, 1_100)).toBe(990_000_000);
    expect(toKrw(400_000, 1_300)).toBe(520_000_000);
    expect(toKrw(30_000, 1_100)).toBe(33_000_000);
  });

  it("원 미만은 항목별 floor (1.5 → 1, 1.00020001 → 1)", () => {
    expect(toKrw(0.5, 3)).toBe(1);
    expect(toKrw(1.0001, 1.0001)).toBe(1);
    expect(toKrw(0, 1300)).toBe(0);
  });

  it("K-27: 소수 0자리(JPY)·3자리(KWD)·환율 소수 4자리 — 독립 기준 구현과 일치", () => {
    const cases: [string, string][] = [
      ["12345678", "9.1234"],
      ["12345.678", "3456.7891"],
      ["99999999999", "1300.1234"],
      ["0.0001", "9999.9999"],
      ["400000", "1300.10"],
      ["777777.7777", "1234.5678"],
    ];
    for (const [a, r] of cases) {
      expect(toKrw(Number(a), Number(r)), `${a} × ${r}`).toBe(referenceFloor(a, r));
    }
  });

  it("외화액·환율 소수 격자 전수 — 독립 기준 구현과 1원도 어긋나지 않는다", () => {
    for (let a = 1; a <= 300; a++) {
      for (const r of ["1300.10", "1300.09", "1100.05", "9.1234", "0.6667", "1450.5"]) {
        const amount = `${a * 1337}.${String(a * 7919).slice(-2).padStart(2, "0")}`;
        expect(toKrw(Number(amount), Number(r)), `${amount} × ${r}`).toBe(referenceFloor(amount, r));
      }
    }
  });

  it.each([
    ["소수 5자리 외화액", 1.00001, 1300],
    ["소수 5자리 환율", 100, 1300.12345],
    ["음수 외화액", -1, 1300],
    ["환율 0", 100, 0],
    ["환율 음수", 100, -1300],
    ["NaN 외화액", Number.NaN, 1300],
    ["Infinity 환율", 100, Number.POSITIVE_INFINITY],
    ["안전 범위 초과 외화액", 1e12, 1300],
  ])("거부: %s", (_label, amount, rate) => {
    expect(() => toKrw(amount, rate)).toThrow(TaxCalculationError);
  });
});
