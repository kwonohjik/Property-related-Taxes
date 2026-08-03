/**
 * anchor: 「소득세법」 §104①**9호** 세율표 — **법문 수치 8구간 전수 고정**
 *
 * 계획서: `docs/00-pm/stock-104-1-9-nbl-heavy-corp.plan.md` Phase 0 (Pre-Do anchor)
 *
 * ── 왜 이 파일이 먼저인가 ──────────────────────────────────────────────
 * `NBL_HEAVY_CORP_BRACKETS`를 **기본표에서 파생**(rate +10%p·deduction 동일)했다.
 * 그 파생이 법정 표와 정말 같은지는 **법문 수치를 직접 적어 두고** 대조해야 확인된다.
 * 여기서 어긋나면 표 설계를 되돌린다(Do 진입 전 환류 — `feedback_pre_anchor_verification`).
 *
 * [법령 원문 — 「소득세법」 §104①9호 별표 · MST 285523 · 2026-08-03 법제처 실측]
 *   1,400만원 이하   16퍼센트
 *   1,400만원 초과 5,000만원 이하    224만원 + (1,400만원 초과액 × 25퍼센트)
 *   5,000만원 초과 8,800만원 이하    1,124만원 + (5,000만원 초과액 × 34퍼센트)
 *   8,800만원 초과 1억5천만원 이하   2,416만원 + (8,800만원 초과액 × 45퍼센트)
 *   1억5천만원 초과 3억원 이하       5,206만원 + (1억5천만원 초과액 × 48퍼센트)
 *   3억원 초과 5억원 이하            1억2,406만원 + (3억원 초과액 × 50퍼센트)
 *   5억원 초과 10억원 이하           2억2,406만원 + (5억원 초과액 × 52퍼센트)
 *   10억원 초과                      4억8,406만원 + (10억원 초과액 × 55퍼센트)
 *
 * ⚠️ **기본표가 개정되면 이 anchor가 빨개진다 — 그것이 의도다.**
 *   9호 표는 기본표에 종속되지만 **법문 재확인 없이 따라가서는 안 된다**.
 */
import { describe, it, expect } from "vitest";
import {
  BASIC_PROGRESSIVE_BRACKETS,
  NBL_HEAVY_CORP_BRACKETS,
} from "@/lib/tax-engine/stock-transfer/stock-rate-tables";

/** 법문 「누진공제 방식」 환산 표 — `tax = base × rate − deduction` */
const STATUTORY_9HO = [
  { max: 14_000_000, rate: 0.16, deduction: 0 },
  { max: 50_000_000, rate: 0.25, deduction: 1_260_000 },
  { max: 88_000_000, rate: 0.34, deduction: 5_760_000 },
  { max: 150_000_000, rate: 0.45, deduction: 15_440_000 },
  { max: 300_000_000, rate: 0.48, deduction: 19_940_000 },
  { max: 500_000_000, rate: 0.50, deduction: 25_940_000 },
  { max: 1_000_000_000, rate: 0.52, deduction: 35_940_000 },
  { max: undefined, rate: 0.55, deduction: 65_940_000 },
] as const;

/** 법문 「기저액 + 초과액 × 세율」 형태 — 환산이 맞는지 독립 검산용 */
const STATUTORY_9HO_STEPPED = [
  { lower: 0, base: 0, rate: 0.16 },
  { lower: 14_000_000, base: 2_240_000, rate: 0.25 },
  { lower: 50_000_000, base: 11_240_000, rate: 0.34 },
  { lower: 88_000_000, base: 24_160_000, rate: 0.45 },
  { lower: 150_000_000, base: 52_060_000, rate: 0.48 },
  { lower: 300_000_000, base: 124_060_000, rate: 0.50 },
  { lower: 500_000_000, base: 224_060_000, rate: 0.52 },
  { lower: 1_000_000_000, base: 484_060_000, rate: 0.55 },
] as const;

describe("§104①9호 세율표 — 법문 수치 고정", () => {
  it("P0-1: 파생 표가 법정 8구간과 **완전히 일치**한다", () => {
    expect(NBL_HEAVY_CORP_BRACKETS).toHaveLength(8);
    NBL_HEAVY_CORP_BRACKETS.forEach((b, i) => {
      expect({ max: b.max, rate: b.rate, deduction: b.deduction }).toEqual({
        max: STATUTORY_9HO[i].max,
        rate: STATUTORY_9HO[i].rate,
        deduction: STATUTORY_9HO[i].deduction,
      });
    });
  });

  it("P0-2: 세율에 **부동소수 오염이 없다** (0.06 + 0.1 = 0.16000000000000003 함정)", () => {
    for (const b of NBL_HEAVY_CORP_BRACKETS) {
      // 소수 2자리로 표현 가능해야 한다 — `rate + 0.1` 직접 계산이면 여기서 깨진다.
      expect(Number(b.rate.toFixed(2))).toBe(b.rate);
    }
    // 첫 구간이 정확히 0.16인지(가장 오염되기 쉬운 값)
    expect(NBL_HEAVY_CORP_BRACKETS[0].rate).toBe(0.16);
    expect(NBL_HEAVY_CORP_BRACKETS[2].rate).toBe(0.34); // 0.24 + 0.1
  });

  it("P0-3: 법문 「기저액 + 초과액 × 세율」과 환산 표가 **같은 세액**을 낸다", () => {
    // 각 구간의 경계값·중간값에서 두 형태가 일치해야 환산이 옳다.
    for (let i = 0; i < STATUTORY_9HO_STEPPED.length; i++) {
      const step = STATUTORY_9HO_STEPPED[i];
      const upper = STATUTORY_9HO[i].max ?? 2_000_000_000;
      for (const base of [step.lower + 1, Math.floor((step.lower + upper) / 2), upper]) {
        const stepped = step.base + (base - step.lower) * step.rate;
        const converted = base * STATUTORY_9HO[i].rate - STATUTORY_9HO[i].deduction;
        expect(Math.round(converted)).toBe(Math.round(stepped));
      }
    }
  });

  it("P0-4: 기본표 대비 **정확히 +10%p**이고 누진공제는 **동일**하다", () => {
    // 이 관계가 깨지면 파생 자체가 성립하지 않는다.
    expect(NBL_HEAVY_CORP_BRACKETS).toHaveLength(BASIC_PROGRESSIVE_BRACKETS.length);
    NBL_HEAVY_CORP_BRACKETS.forEach((b, i) => {
      const basic = BASIC_PROGRESSIVE_BRACKETS[i];
      expect(b.max).toBe(basic.max);
      expect(Math.round((b.rate - basic.rate) * 100)).toBe(10);
      expect(b.deduction).toBe(basic.deduction);
    });
  });

  it("P0-5: 도출값 — 과세표준 297,500,000에서 122,860,000", () => {
    // 계획서 §1 실측 대조값. 5,206만 + (297,500,000 − 150,000,000) × 48% = 122,860,000
    const b = NBL_HEAVY_CORP_BRACKETS[4]; // 1.5억 ~ 3억
    expect(Math.floor(297_500_000 * b.rate) - b.deduction).toBe(122_860_000);
    // 기본표 대비 차이는 정확히 과세표준의 10%
    const basic = BASIC_PROGRESSIVE_BRACKETS[4];
    const basicTax = Math.floor(297_500_000 * basic.rate) - basic.deduction;
    expect(basicTax).toBe(93_110_000);
    expect(122_860_000 - basicTax).toBe(29_750_000);
  });
});
