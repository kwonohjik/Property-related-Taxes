/**
 * anchor: lib/tax-engine/legal-codes/comprehensive.ts 수치 상수의 상호 불변식
 *
 * 값 하나하나를 다시 적는 테스트가 아니라, 상수끼리 맞물려야 하는 관계를 고정한다.
 * 한쪽만 고치면(예: 구간 상한만 바꾸고 누진공제는 그대로) 세액이 구간 경계에서 조용히 튄다.
 *
 * 1. 토지분 누진세율(종합부동산세법 §14①·②) — 구간 경계에서 아래 구간 산식 = 위 구간 산식(연속)
 * 2. 합산배제 추징 계산기 시기 경계(시행령 §10) — 날짜 형식·순서·인접(하루 차이)
 * 3. 이자상당가산액 일 이자율 — 시기순으로 낮아진다(10만분의 30 → 25 → 22)
 */
import { describe, it, expect } from "vitest";
import {
  COMPREHENSIVE_LAND_CONST as L,
  COMPREHENSIVE_EXCL_CONST as X,
} from "@/lib/tax-engine/legal-codes";
import { applyRate } from "@/lib/tax-engine/tax-utils";
import { addDays, format, isBefore, parseISO } from "@/lib/tax-engine/utc-date";

/** 누진세율 구간 경계 b에서 «b × 아래 세율 − 아래 누진공제» = «b × 위 세율 − 위 누진공제» */
function taxAt(base: number, rate: number, deduction: number): number {
  return applyRate(base, rate) - deduction;
}

describe("토지분 누진세율 — 구간 경계 연속", () => {
  it("종합합산 토지(§14①): 15억 경계에서 1% 산식 = 2% − 1,500만", () => {
    const b = L.AGGREGATE_BRACKET_1;
    expect(taxAt(b, L.AGGREGATE_RATE_2, L.AGGREGATE_DEDUCTION_2)).toBe(taxAt(b, L.AGGREGATE_RATE_1, 0));
    expect(taxAt(b, L.AGGREGATE_RATE_1, 0)).toBe(15_000_000);
  });

  it("종합합산 토지(§14①): 45억 경계에서 2% 산식 = 3% − 6,000만", () => {
    const b = L.AGGREGATE_BRACKET_2;
    expect(taxAt(b, L.AGGREGATE_RATE_3, L.AGGREGATE_DEDUCTION_3)).toBe(
      taxAt(b, L.AGGREGATE_RATE_2, L.AGGREGATE_DEDUCTION_2),
    );
    expect(taxAt(b, L.AGGREGATE_RATE_2, L.AGGREGATE_DEDUCTION_2)).toBe(75_000_000);
  });

  it("별도합산 토지(§14②): 200억 경계에서 0.5% 산식 = 0.6% − 2,000만", () => {
    const b = L.SEPARATE_BRACKET_1;
    expect(taxAt(b, L.SEPARATE_RATE_2, L.SEPARATE_DEDUCTION_2)).toBe(taxAt(b, L.SEPARATE_RATE_1, 0));
    expect(taxAt(b, L.SEPARATE_RATE_1, 0)).toBe(100_000_000);
  });

  it("별도합산 토지(§14②): 400억 경계에서 0.6% 산식 = 0.7% − 6,000만", () => {
    const b = L.SEPARATE_BRACKET_2;
    expect(taxAt(b, L.SEPARATE_RATE_3, L.SEPARATE_DEDUCTION_3)).toBe(
      taxAt(b, L.SEPARATE_RATE_2, L.SEPARATE_DEDUCTION_2),
    );
    expect(taxAt(b, L.SEPARATE_RATE_2, L.SEPARATE_DEDUCTION_2)).toBe(220_000_000);
  });

  it("세율은 구간이 올라갈수록 높고, 구간 상한도 오름차순", () => {
    expect(L.AGGREGATE_RATE_1).toBeLessThan(L.AGGREGATE_RATE_2);
    expect(L.AGGREGATE_RATE_2).toBeLessThan(L.AGGREGATE_RATE_3);
    expect(L.AGGREGATE_BRACKET_1).toBeLessThan(L.AGGREGATE_BRACKET_2);
    expect(L.SEPARATE_RATE_1).toBeLessThan(L.SEPARATE_RATE_2);
    expect(L.SEPARATE_RATE_2).toBeLessThan(L.SEPARATE_RATE_3);
    expect(L.SEPARATE_BRACKET_1).toBeLessThan(L.SEPARATE_BRACKET_2);
  });
});

describe("합산배제 추징 계산기 — 시기 경계 날짜", () => {
  const DATE_KEYS = [
    "RECAPTURE_INTEREST_RULE_START",
    "RECAPTURE_RATE_2019_START",
    "RECAPTURE_EXEMPT_1HO_START",
    "RECAPTURE_EXEMPT_3HO_PROVISO_END",
    "RECAPTURE_EXEMPT_3HO_GA_FROM",
    "RECAPTURE_EXEMPT_3HO_GA_UNTIL",
    "RECAPTURE_EXEMPT_23HO_START",
    "RECAPTURE_RATE_2022_START",
    "RECAPTURE_EXEMPT_6Y_START",
  ] as const;

  it.each(DATE_KEYS)("%s 는 실재하는 YYYY-MM-DD 날짜", (key) => {
    const s = X[key];
    expect(s).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // 2020-02-30 같은 값은 parseISO 뒤 다른 날짜로 넘어가므로 왕복이 깨진다
    expect(format(parseISO(s), "yyyy-MM-dd")).toBe(s);
  });

  it("위 목록은 시기순(앞 항목이 뒤 항목보다 이르다)", () => {
    for (let i = 1; i < DATE_KEYS.length; i++) {
      const prev = parseISO(X[DATE_KEYS[i - 1]]);
      const cur = parseISO(X[DATE_KEYS[i]]);
      expect(isBefore(prev, cur), `${DATE_KEYS[i - 1]} < ${DATE_KEYS[i]}`).toBe(true);
    }
  });

  it("§10③3호: 단서 끝(2020.7.10.) 다음 날이 가목 시작(2020.7.11.) — 빈 날·겹친 날 없음", () => {
    expect(format(addDays(parseISO(X.RECAPTURE_EXEMPT_3HO_PROVISO_END), 1), "yyyy-MM-dd")).toBe(
      X.RECAPTURE_EXEMPT_3HO_GA_FROM,
    );
  });
});

describe("이자상당가산액 일 이자율 — 시기순으로 낮아진다", () => {
  it("~2019.2.11. 10만분의 30 > 2019.2.12.~ 10만분의 25 > 2022.2.15.~ 10만분의 22", () => {
    expect(X.DAILY_PENALTY_RATE_PRE_2019).toBeGreaterThan(X.DAILY_PENALTY_RATE_2019);
    expect(X.DAILY_PENALTY_RATE_2019).toBeGreaterThan(X.DAILY_PENALTY_RATE);
  });

  it("10만분의 N 을 정수로 환산하면 30·25·22 (소수 표기 오타 차단)", () => {
    expect(applyRate(100_000, X.DAILY_PENALTY_RATE_PRE_2019)).toBe(30);
    expect(applyRate(100_000, X.DAILY_PENALTY_RATE_2019)).toBe(25);
    expect(applyRate(100_000, X.DAILY_PENALTY_RATE)).toBe(22);
  });
});
