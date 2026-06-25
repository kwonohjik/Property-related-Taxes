/**
 * 증여로 보는 경우 — 역사 고시 이자율·환산율 (상증법 §37·§41의4)
 *
 * 율은 분수 {numer, denom}로 보관 → applyRateFraction 정수연산 (부동소수 0).
 * §41의4 적정이자율 = §37② 무상담보 동일 소스 (상증령 §27⑤ → §31의4①).
 * ⚠️ Do 단계 KoreanLaw·기재부고시 교차검증 대상: 2001~2010 구간 율, §37 시행규칙 환산율.
 */

export interface RateFraction {
  numer: number;
  denom: number;
}

/**
 * 금전무상대출 적정이자율 §41의4① (= §37② 무상담보).
 * 동일율 연속 구간은 시작 고시일로 압축(from 이상 룩업이라 결과 동일).
 * PDF (6) 표: 2001·2002·2009 모두 9% → 2001-12-31 1행.
 */
export const FREE_LOAN_RATE_HISTORY: ReadonlyArray<{ from: string; rate: RateFraction }> = [
  { from: "1999-06-30", rate: { numer: 110, denom: 1000 } }, // 11%
  { from: "2001-12-31", rate: { numer: 90, denom: 1000 } }, // 9% (~2010-11-04)
  { from: "2010-11-05", rate: { numer: 85, denom: 1000 } }, // 8.5%
  { from: "2016-03-07", rate: { numer: 46, denom: 1000 } }, // 4.6% 현행
];

/** 증여일(YYYY-MM-DD) 기준 적정이자율 룩업 — 해당일 이전 가장 최근 고시 */
export function resolveFreeLoanRate(giftDate: string): RateFraction {
  let resolved = FREE_LOAN_RATE_HISTORY[0].rate;
  for (const entry of FREE_LOAN_RATE_HISTORY) {
    if (giftDate >= entry.from) resolved = entry.rate;
  }
  return resolved;
}

/** 부동산무상사용 §37① — 환산율 2% (시행규칙 위임) */
export const FREE_USE_ANNUAL_RATE: RateFraction = { numer: 2, denom: 100 };
/** 부동산무상사용 §37① — 할인율 10%: 현가 1/1.1^n = 10^n / 11^n (정수경로) */
export const FREE_USE_DISCOUNT = { base: 11, unit: 10 } as const;
/** 부동산무상사용 환산 기간 5년 */
export const FREE_USE_YEARS = 5;

/** §37① 무상사용 과세 기준금액 (1억) */
export const FREE_USE_THRESHOLD = 100_000_000;
/** §37② 무상담보 / §41의4 무상대출 과세 기준금액 (1천만) */
export const FREE_LOAN_THRESHOLD = 10_000_000;

/** §79②1호 경정청구 분모 — 무상사용 5년 = 60개월 (시행령§27③후단·§81⑤) */
export const RECT_MONTHS_FREE_USE = 60;
/** §79②1호 경정청구 분모 — 담보이용 1년 = 12개월 (시행령§27⑤후단·§81⑤가 "부동산무상사용기간"에 §27⑤후단 포함) */
export const RECT_MONTHS_COLLATERAL = 12;

// ─────────────────────────────────────────────────────────────
// §41의2 소득세 상당액 율표 (시행규칙 §10의3①)
// anchor: 교재 img26(현행 7구간) · img29(구법 6구간)
// 누진공제식: base + floor((금액 − threshold) × rate)
// 오름차순 정렬 (feedback_progressive_bracket_sort_enforcement)
// ─────────────────────────────────────────────────────────────

export interface ExcessDividendRateBracket {
  /** 구간 상한 (null = 초과 없음) */
  max: number | null;
  /** 구간 기저 세액 (원) */
  base: number;
  /** 초과분 적용세율 (소수: 0.14, 0.24, ...) */
  rate: number;
  /** 구간 하한 초과액 기준점 (원) */
  threshold: number;
}

/**
 * 2018.1.1 ~ 2024.3.21 (6구간)
 * anchor: 교재 img29
 */
export const EXCESS_DIVIDEND_RATE_TABLE_6BRACKET: readonly ExcessDividendRateBracket[] = [
  { max: 52_200_000,    base: 0,           rate: 0.14, threshold: 0           },
  { max: 88_000_000,    base: 7_310_000,   rate: 0.24, threshold: 52_200_000  },
  { max: 150_000_000,   base: 15_900_000,  rate: 0.35, threshold: 88_000_000  },
  { max: 300_000_000,   base: 37_600_000,  rate: 0.38, threshold: 150_000_000 },
  { max: 500_000_000,   base: 94_600_000,  rate: 0.40, threshold: 300_000_000 },
  { max: null,          base: 174_600_000, rate: 0.42, threshold: 500_000_000 },
];

/**
 * 2024.3.22 ~ 현행 (7구간)
 * anchor: 교재 img26
 */
export const EXCESS_DIVIDEND_RATE_TABLE_7BRACKET: readonly ExcessDividendRateBracket[] = [
  { max: 57_600_000,    base: 0,           rate: 0.14, threshold: 0           },
  { max: 88_000_000,    base: 8_060_000,   rate: 0.24, threshold: 57_600_000  },
  { max: 150_000_000,   base: 15_360_000,  rate: 0.35, threshold: 88_000_000  },
  { max: 300_000_000,   base: 37_060_000,  rate: 0.38, threshold: 150_000_000 },
  { max: 500_000_000,   base: 94_060_000,  rate: 0.40, threshold: 300_000_000 },
  { max: 1_000_000_000, base: 174_060_000, rate: 0.42, threshold: 500_000_000 },
  { max: null,          base: 384_060_000, rate: 0.45, threshold: 1_000_000_000 },
];

/**
 * 율표 적용: base + floor((amount - threshold) × rate)
 * anchor A1: applyExcessDividendRateTable(200_000_000, TABLE_7BRACKET) = 56_060_000
 * anchor A2: applyExcessDividendRateTable(200_000_000, TABLE_6BRACKET) = 56_600_000
 */
export function applyExcessDividendRateTable(
  amount: number,
  table: readonly ExcessDividendRateBracket[],
): number {
  // 오름차순 정렬 전제 — 첫 번째 매칭 구간 선택
  const bracket = table.find((b) => b.max === null || amount <= b.max) ?? table[table.length - 1];
  const excess = amount - bracket.threshold;
  const excessTax = Math.floor(excess * bracket.rate);
  return bracket.base + excessTax;
}

/** 증여일 기준 율표 선택 (2024.3.22 경계) */
export function resolveExcessDividendRateTable(
  dividendDate: Date,
): readonly ExcessDividendRateBracket[] {
  const cutoff = new Date("2024-03-22");
  return dividendDate >= cutoff
    ? EXCESS_DIVIDEND_RATE_TABLE_7BRACKET
    : EXCESS_DIVIDEND_RATE_TABLE_6BRACKET;
}

// ─────────────────────────────────────────────────────────────
// §55 종합소득세 누진세율 역사 (종합과세 실제소득세 Max 계산용)
// ─────────────────────────────────────────────────────────────

export interface ComprehensiveIncomeTaxBrackets {
  /** 적용 기준연도 이상 (from 연도, 4자리) */
  fromYear: number;
  brackets: readonly { max: number | null; rate: number; deduction: number }[];
}

export const COMPREHENSIVE_INCOME_TAX_BRACKETS_HISTORY: readonly ComprehensiveIncomeTaxBrackets[] = [
  {
    fromYear: 2014, // ~2020: 7구간
    brackets: [
      { max: 12_000_000,    rate: 0.06, deduction: 0          },
      { max: 46_000_000,    rate: 0.15, deduction: 1_080_000  },
      { max: 88_000_000,    rate: 0.24, deduction: 5_220_000  },
      { max: 150_000_000,   rate: 0.35, deduction: 14_900_000 },
      { max: 300_000_000,   rate: 0.38, deduction: 19_400_000 },
      { max: 500_000_000,   rate: 0.40, deduction: 25_400_000 },
      { max: null,          rate: 0.42, deduction: 35_400_000 },
    ],
  },
  {
    fromYear: 2021, // ~현행: 8구간 (10억 초과 45%)
    brackets: [
      { max: 12_000_000,    rate: 0.06, deduction: 0          },
      { max: 46_000_000,    rate: 0.15, deduction: 1_080_000  },
      { max: 88_000_000,    rate: 0.24, deduction: 5_220_000  },
      { max: 150_000_000,   rate: 0.35, deduction: 14_900_000 },
      { max: 300_000_000,   rate: 0.38, deduction: 19_400_000 },
      { max: 500_000_000,   rate: 0.40, deduction: 25_400_000 },
      { max: 1_000_000_000, rate: 0.42, deduction: 35_400_000 },
      { max: null,          rate: 0.45, deduction: 65_400_000 },
    ],
  },
];

/** 소득세 과세연도 기준 §55 세율표 선택 */
export function resolveComprehensiveIncomeTaxBrackets(
  incomeTaxYear: number,
): readonly { max: number | null; rate: number; deduction: number }[] {
  let resolved = COMPREHENSIVE_INCOME_TAX_BRACKETS_HISTORY[0].brackets;
  for (const entry of COMPREHENSIVE_INCOME_TAX_BRACKETS_HISTORY) {
    if (incomeTaxYear >= entry.fromYear) resolved = entry.brackets;
  }
  return resolved;
}
