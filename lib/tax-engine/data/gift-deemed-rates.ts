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

// 전환사채등 §40 적정할인율(상증칙 §18의3: 2010.11.5~ 8% / 과거 6.5·7·7.5%)은
// 이자손실분 자동계산이 "적정할인율 현가계수"를 직접 input으로 받으므로(0원 정확 재현)
// 별도 시대표 상수·룩업 함수를 두지 않는다(현가계수에 율·기간이 내재).

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
