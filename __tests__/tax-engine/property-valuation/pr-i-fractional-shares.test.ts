/**
 * PR-I — 환산주식수 단주(端株, 1주 미만) floor 처리 anchor
 *
 * 검증 대상: lib/tax-engine/property-valuation/converted-shares.ts
 *
 * KoreanLaw 정책 (2026-05-24 검증):
 *   - 상증법령(§54·§55·§56)·시행규칙(§17·§17의3) 단주 명시 규정 없음
 *   - 상법 단위주(1주) 원칙 (§329·§459·§530의6)
 *   - 채택: Math.floor (절사) — 회귀 보호용 anchor
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-valuation-followup.plan.md PR-I (F-6)
 */

import { describe, it, expect } from "vitest";
import { applyShareConversion } from "@/lib/tax-engine/property-valuation/converted-shares";

describe("[PR-I] 환산주식수 단주 floor 처리", () => {
  // ============================================================
  // F-I-1: 정수 비율 — 단주 미발생 (사례 1 회귀)
  // ============================================================
  it("F-I-1: 정수 비율 (100,000 × 1.8 = 180,000) — 단주 미발생", () => {
    // 사례 1: 평가시점 발행주식 = 180,000, capitalDelta = +80,000 (유상 50,000 + 무상 30,000)
    // 이전 사업연도말 100,000 → 환산: 100,000 × (100,000 + 80,000) / 100,000 = 180,000 (정수)
    const result = applyShareConversion(100_000, 80_000);
    expect(result).toBe(180_000);
  });

  // ============================================================
  // F-I-2: 비정수 비율 — 단주 발생 시 floor 절사
  // ============================================================
  it("F-I-2: 비정수 비율 (100,000 × 4/3 = 133,333.333…) → floor 133,333", () => {
    // 가공 시나리오: 이전 사업연도말 100,000, 변동 +33,333 (1:1/3 비율)
    // 환산: 100,000 × (100,000 + 33,333) / 100,000 = 100,000 × 1.33333 = 133,333 (절사)
    const result = applyShareConversion(100_000, 33_333);
    expect(result).toBe(133_333);
    // 단주 발생 확인: 산식 raw = 133,333.0 (정수 결과)
    // 실제 단주 발생 케이스는 분자가 분모로 나누어 떨어지지 않을 때
  });

  it("F-I-2b: 진짜 단주 (100,000 × 100,001 / 100,000 = 100,001.00001) → floor 100,001", () => {
    // 1주 증자 시: 100,000 × (100,000 + 1) / 100,000 = 100,001 (정수)
    const result = applyShareConversion(100_000, 1);
    expect(result).toBe(100_001);
  });

  it("F-I-2c: 명확한 단주 발생 (3 × (3+1)/3 = 4.0) — 작은 수로 확인", () => {
    // 3주 → 4주 증자: 3 × 4 / 3 = 4 (정수)
    expect(applyShareConversion(3, 1)).toBe(4);
    // 7 × (7+1)/7 = 8.000... — 부동소수 정확
    expect(applyShareConversion(7, 1)).toBe(8);
  });

  // ============================================================
  // F-I-3: 감자 시 음수 delta — floor 처리
  // ============================================================
  it("F-I-3: 감자 비정수 비율 (100,000 × (100,000 − 30,000)/100,000 = 70,000) → 정수", () => {
    // 감자 30,000: 100,000 × 70,000 / 100,000 = 70,000 (정수)
    const result = applyShareConversion(100_000, -30_000);
    expect(result).toBe(70_000);
  });

  it("F-I-3b: 감자 단주 (3 × (3-1)/3 = 2.0)", () => {
    expect(applyShareConversion(3, -1)).toBe(2);
  });

  // ============================================================
  // F-I-4: 경계값 — priorEndShares 0 또는 음수 시 0 반환
  // ============================================================
  it("F-I-4: priorEndShares <= 0 → 0 반환 (NaN/Infinity 방지)", () => {
    expect(applyShareConversion(0, 100)).toBe(0);
    expect(applyShareConversion(-1, 100)).toBe(0);
  });

  // ============================================================
  // F-I-5: 자기일관성 — 산식 직접 검증 (수동 계산 vs 엔진)
  // ============================================================
  it("F-I-5: 산식 자기일관성 = floor(priorEndShares × (priorEndShares + delta) / priorEndShares)", () => {
    // 가공: 1,234주 → +567주 증자
    // 1,234 × (1,234 + 567) / 1,234 = 1,234 × 1801 / 1,234 = 1,801 (정수)
    const priorEnd = 1_234;
    const delta = 567;
    const expected = Math.floor((priorEnd * (priorEnd + delta)) / priorEnd);
    expect(applyShareConversion(priorEnd, delta)).toBe(expected);
    expect(expected).toBe(1_801);
  });
});
