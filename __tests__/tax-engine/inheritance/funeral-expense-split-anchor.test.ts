/**
 * 장례비 식대/봉안 분리 적용 anchor (상증령 §9②)
 *
 * §9②1호: 일반 장례비(봉안 제외) — clamp [500만, 1천만]
 *   - 500만 미만이면 500만 보장
 *   - 1천만 초과이면 1천만 한도
 * §9②2호: 봉안시설·자연장지 — min(실제, 500만)
 *   - 미이용(0)이면 0
 *
 * funeralBonganExpense가 number이면 §9② 분리 경로
 * boolean이면 legacy 경로 (funeralIncludesBongan)
 */
import { describe, it, expect } from "vitest";
import { calcFuneralExpenseDeduction } from "@/lib/tax-engine/inheritance-gift-common";

// ─────────────────────────────────────────────────────────────────
// §9②1호 + §9②2호 분리 경로 anchor
// ─────────────────────────────────────────────────────────────────
describe("calcFuneralExpenseDeduction — §9② 분리 경로 (bonganExpense: number)", () => {
  it("FUN-01: 식대 800만 + 봉안 600만 → 1,300만 (봉안 500만 상한 적용)", () => {
    // §9②1호: clamp(800만, 500만, 1천만) = 800만
    // §9②2호: min(600만, 500만) = 500만
    const { deduction } = calcFuneralExpenseDeduction(8_000_000, 6_000_000);
    expect(deduction).toBe(13_000_000);
  });

  it("FUN-02: 식대 300만 (500만 미만) + 봉안 200만 → 700만 (식대 500만 최소 보장)", () => {
    // §9②1호: max(300만, 500만) = 500만 (최소), min(500만, 1천만) = 500만
    // §9②2호: min(200만, 500만) = 200만
    const { deduction } = calcFuneralExpenseDeduction(3_000_000, 2_000_000);
    expect(deduction).toBe(7_000_000);
  });

  it("FUN-03: 식대 1,200만 (1천만 초과) + 봉안 0 → 1,000만 (상한 적용)", () => {
    // §9②1호: min(1200만, 1천만) = 1천만
    // §9②2호: min(0, 500만) = 0
    const { deduction } = calcFuneralExpenseDeduction(12_000_000, 0);
    expect(deduction).toBe(10_000_000);
  });

  it("FUN-04: 식대 700만 + 봉안 500만 (정확히 한도) → 1,200만", () => {
    // §9②1호: min(max(700만, 500만), 1천만) = 700만
    // §9②2호: min(500만, 500만) = 500만
    const { deduction } = calcFuneralExpenseDeduction(7_000_000, 5_000_000);
    expect(deduction).toBe(12_000_000);
  });

  it("FUN-05: 식대 0 + 봉안 300만 → 800만 (식대 500만 최소 보장)", () => {
    // §9②1호: max(0, 500만) = 500만
    // §9②2호: min(300만, 500만) = 300만
    const { deduction } = calcFuneralExpenseDeduction(0, 3_000_000);
    expect(deduction).toBe(8_000_000);
  });
});

// ─────────────────────────────────────────────────────────────────
// legacy boolean 경로 하위호환 anchor
// ─────────────────────────────────────────────────────────────────
describe("calcFuneralExpenseDeduction — legacy boolean 경로 (includesBongan: boolean)", () => {
  it("FUN-L1: 식대 0 + 봉안 없음(false) → 500만 (최소 보장)", () => {
    const { deduction } = calcFuneralExpenseDeduction(0, false);
    expect(deduction).toBe(5_000_000);
  });

  it("FUN-L2: 식대 800만 + 봉안 없음(false) → 800만", () => {
    const { deduction } = calcFuneralExpenseDeduction(8_000_000, false);
    expect(deduction).toBe(8_000_000);
  });

  it("FUN-L3: 식대 1,200만 + 봉안 포함(true) → 1,200만 (통합 한도 1,500만 이하)", () => {
    const { deduction } = calcFuneralExpenseDeduction(12_000_000, true);
    expect(deduction).toBe(12_000_000);
  });

  it("FUN-L4: 식대 0 + 봉안 포함(true) → 500만 (최소 보장)", () => {
    const { deduction } = calcFuneralExpenseDeduction(0, true);
    expect(deduction).toBe(5_000_000);
  });
});
