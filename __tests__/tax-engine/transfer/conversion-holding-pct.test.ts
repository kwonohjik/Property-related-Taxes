/**
 * Phase A 필수 verify — 「소득세법」 §95⑤ 제1호 보유기간별 공제율 헬퍼
 *
 * 설계: docs/02-design/features/non-housing-to-housing-conversion.engine.design.md §헬퍼 2 · ★분수 정수 연산
 *
 * 이 파일이 지키는 두 가지:
 *   ⓐ 각 구간의 **3년 미만 → 0%** 가드가 정본(`calcLongTermRate`)에 내장돼 있음 (plan R-D)
 *   ⓑ **분수 정수 연산** — 소수 rate 합산이 만드는 1원 과소를 차단 (plan R-K)
 */
import { describe, it, expect } from "vitest";
import { calcConversionHoldingPct } from "@/lib/tax-engine/conversion-holding-pct";
import { applyRate, applyRateFraction } from "@/lib/tax-engine/tax-utils";

describe("calcConversionHoldingPct — §95⑤1호 보유기간별 공제율", () => {
  it("ⓐ 3년 미만 구간은 0% — 가드가 정본에 내장돼 있다", () => {
    // 비주택 2년(표1 3년 미만 → 0%) + 주택 5년(표2 5×4% = 20%)
    const r = calcConversionHoldingPct(2, 5);

    expect(r.table1Pct).toBe(0); // ← 2×2% = 4%가 아니다
    expect(r.table2HoldingPct).toBe(20);
    expect(r.holdingPct).toBe(20);
    expect(r.capped).toBe(false);
  });

  it("ⓐ' 주택 구간이 3년 미만이어도 같다", () => {
    // 비주택 10년(표1 min(20%, 30%) = 20%) + 주택 2년(표2 3년 미만 → 0%)
    const r = calcConversionHoldingPct(10, 2);

    expect(r.table1Pct).toBe(20);
    expect(r.table2HoldingPct).toBe(0);
    expect(r.holdingPct).toBe(20);
  });

  it("PDF 사례 30 — 비주택 4년 + 주택 3년 = 20%", () => {
    const r = calcConversionHoldingPct(4, 3);

    expect(r.table1Pct).toBe(8); // 4년 × 2%
    expect(r.table2HoldingPct).toBe(12); // 3년 × 4%
    expect(r.holdingPct).toBe(20);
    expect(r.capped).toBe(false);
  });

  it("§95⑤1호 단서 — 합계가 40%를 넘으면 40%로 자른다", () => {
    // 비주택 15년(표1 30% 캡) + 주택 10년(표2 40% 캡) = 70% → 40%
    const r = calcConversionHoldingPct(15, 10);

    expect(r.table1Pct).toBe(30);
    expect(r.table2HoldingPct).toBe(40);
    expect(r.holdingPct).toBe(40);
    expect(r.capped).toBe(true);
  });

  it("40% 정확 경계 — 자르지 않는다", () => {
    // 비주택 5년(10%) + 주택 7.5년… → 정수로: 비주택 10년(20%) + 주택 5년(20%) = 40%
    const r = calcConversionHoldingPct(10, 5);

    expect(r.holdingPct).toBe(40);
    expect(r.capped).toBe(false); // raw === 40이므로 초과가 아니다
  });
});

describe("ⓑ 분수 정수 연산 — 소수 rate 합산의 1원 과소를 차단한다", () => {
  /**
   * 설계서 probe 재현:
   *   비주택 3년 → 표1  6%
   *   주택   4년 → 표2 16%   ⇒ 보유 22%
   *   거주   3년 → 표2 12%   ⇒ 합계 34%
   *
   * 소수 경로: 0.22 + 0.12 = 0.33999999999999997 → 종전 applyRate(178,540,000) = 60,703,599(지금은 백만분율 정수 연산으로 60,703,600)
   * 정수 경로: applyRateFraction(178,540,000, 34, 100)                    = 60,703,600 ← 정확값
   */
  const TAXABLE_GAIN = 178_540_000;

  it("헬퍼가 정수 %를 반환한다 (34% 케이스)", () => {
    const { table1Pct, table2HoldingPct, holdingPct } = calcConversionHoldingPct(3, 4);

    expect(table1Pct).toBe(6);
    expect(table2HoldingPct).toBe(16);
    expect(holdingPct).toBe(22);
    expect(Number.isInteger(holdingPct)).toBe(true);

    const residencePct = 12; // 거주 3년 × 4% (표2 거주분)
    expect(holdingPct + residencePct).toBe(34);
  });

  it("applyRateFraction 경로가 정확값 60,703,600을 낸다", () => {
    expect(applyRateFraction(TAXABLE_GAIN, 34, 100)).toBe(60_703_600);
  });

  it("★ 소수 경로도 이제 정확값이다 — applyRate가 소수 6자리 이내 세율을 백만분율 정수로 계산한다(종전 60,703,599 · 헬퍼 주석 갱신)", () => {
    expect(0.22 + 0.12).not.toBe(0.34);
    expect(applyRate(TAXABLE_GAIN, 0.22 + 0.12)).toBe(60_703_600);
    expect(applyRate(TAXABLE_GAIN, 0.22 + 0.12)).toBe(applyRateFraction(TAXABLE_GAIN, 34, 100));
  });

  it("전 조합 스캔 — 소수 경로(applyRate)가 정수 경로와 전부 같다(종전에는 어긋나는 조합이 있었다)", () => {
    // 표1(0~30, 2 배수) × 표2 보유(0~40, 4 배수) × 표2 거주(0~40, 4 배수)
    let mismatches = 0;
    for (let t1 = 0; t1 <= 30; t1 += 2) {
      for (let t2h = 0; t2h <= 40; t2h += 4) {
        for (let t2r = 0; t2r <= 40; t2r += 4) {
          const pct = Math.min(t1 + t2h, 40) + t2r;
          const exact = applyRateFraction(TAXABLE_GAIN, pct, 100);
          const floaty = applyRate(TAXABLE_GAIN, Math.min(t1 + t2h, 40) / 100 + t2r / 100);
          if (floaty !== exact) mismatches++;
        }
      }
    }
    expect(mismatches).toBe(0);
  });
});
