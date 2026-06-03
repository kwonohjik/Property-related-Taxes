/**
 * rate-table.schema — 누진세율 bracket 정렬 강제 회귀 테스트.
 *
 * calculateProgressiveTax(tax-utils)·calcTax(transfer-tax-rate-calc)는 brackets를
 * `taxBase <= max` 순회 첫 매칭으로 사용하므로 max 오름차순 정렬이 전제다.
 * DB seed가 정렬 안 된 brackets를 주입해도 progressiveRateSchema.transform이
 * 파싱 시점에 정렬해 silent 세액 오류를 차단해야 한다.
 */

import { describe, it, expect } from "vitest";
import { parseProgressiveRate } from "@/lib/tax-engine/schemas/rate-table.schema";

describe("progressiveRateSchema — bracket 오름차순 정렬 강제", () => {
  it("역순 입력 brackets를 max 오름차순으로 정렬 (최상위 max 없음 = Infinity 후순위)", () => {
    const parsed = parseProgressiveRate({
      brackets: [
        { min: 0, rate: 0.45, deduction: 65_400_000 },                // 최상위 (max 생략)
        { min: 0, max: 14_000_000, rate: 0.06, deduction: 0 },        // 최하위
        { min: 0, max: 50_000_000, rate: 0.15, deduction: 1_260_000 },
      ],
    });
    const maxes = parsed.brackets.map((b) => b.max ?? Infinity);
    expect(maxes).toEqual([14_000_000, 50_000_000, Infinity]);
  });

  it("정렬 후 순회 첫 매칭이 정확 — taxBase 10,000,000은 6% 구간 (역순 입력 방어)", () => {
    const parsed = parseProgressiveRate({
      brackets: [
        { min: 0, max: 50_000_000, rate: 0.15, deduction: 1_260_000 },
        { min: 0, max: 14_000_000, rate: 0.06, deduction: 0 }, // 역순
      ],
    });
    const first = parsed.brackets.find((b) => 10_000_000 <= (b.max ?? Infinity));
    // 정렬 안 됐으면 50M(15%)이 먼저 매칭되어 틀림 → 정렬 후 14M(6%)이 정답
    expect(first?.rate).toBe(0.06);
  });

  it("이미 정렬된 입력은 순서 보존 (동작 불변)", () => {
    const parsed = parseProgressiveRate({
      brackets: [
        { min: 0, max: 14_000_000, rate: 0.06, deduction: 0 },
        { min: 0, max: 50_000_000, rate: 0.15, deduction: 1_260_000 },
        { min: 0, rate: 0.45, deduction: 65_400_000 },
      ],
    });
    expect(parsed.brackets.map((b) => b.rate)).toEqual([0.06, 0.15, 0.45]);
  });
});
