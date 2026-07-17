/**
 * 연부연납 가산금 가산율 고시 연혁 (상증령 §69 → 국기령 §43의3② → 국기칙 §19의3)
 *
 * 각 회분 분할납부세액의 **납부일 현재** 가산율을 적용하며(상증령 §69①),
 * 가산금 대상 기간 중 가산율이 변경된 경우 **변경 전 기간은 변경 전 율**을 적용한다(§69②).
 * → lookupSurchargeRate(date) 로 특정 일자의 가산율을 조회하고,
 *   기간 안분은 엔진(installment-payment.ts)이 변경일 경계로 분할 계산한다.
 *
 * 출처: 국기칙 §19의3 개정 연혁(국가법령정보센터 제·개정이유). 2016 경계는 제543호(2016.3.7 시행)로 확정(M-10).
 *   그 밖 연도 시행일은 교재 PDF 기준 — 필요 시 각 개정 시행규칙 부칙으로 추가 확인.
 *
 * 역사적 데이터(개정 없는 과거 고시) — `lib/tax-engine/data/` 정적 상수 정책
 * ([[feedback_historical_tax_tables]]).
 */

export interface SurchargeRatePeriod {
  /** 시행일 (이 일자부터 적용, ISO yyyy-mm-dd) */
  from: string;
  /** 연 가산율 (decimal, 예: 0.018 = 연 1.8%) */
  rate: number;
}

/**
 * 가산율 연혁 — 시행일 오름차순. 연(年) 가산율 체계(2011.4.11~) 이후.
 * 2011 이전(일별 고시 체계)은 상속 실무 범위 밖이라 제외.
 */
export const INSTALLMENT_SURCHARGE_RATE_HISTORY: readonly SurchargeRatePeriod[] = [
  { from: "2011-04-11", rate: 0.037 }, // 연 37/1,000
  { from: "2012-03-01", rate: 0.04 },  // 연 40/1,000
  { from: "2013-03-01", rate: 0.034 }, // 연 34/1,000
  { from: "2014-03-14", rate: 0.029 }, // 연 29/1,000
  { from: "2015-03-06", rate: 0.025 }, // 연 25/1,000 (기재부령 제473호)
  { from: "2016-03-07", rate: 0.018 }, // 연 1.8% (기재부령 제543호, 2016.3.7 공포·시행) — 2016-03-06까지는 2.5% (M-10)
  { from: "2017-03-15", rate: 0.016 }, // 연 1.6%
  { from: "2018-03-19", rate: 0.018 }, // 연 1.8%
  { from: "2019-03-20", rate: 0.021 }, // 연 2.1%
  { from: "2020-03-13", rate: 0.018 }, // 연 1.8%
  { from: "2021-03-16", rate: 0.012 }, // 연 1.2%
  { from: "2023-03-20", rate: 0.029 }, // 연 2.9%
  { from: "2024-03-22", rate: 0.035 }, // 연 3.5%
  { from: "2025-03-21", rate: 0.031 }, // 연 3.1% (현행)
] as const;

/** 현행 가산율 (미래 회차 기본값) — 2025.3.21~ 연 3.1% */
export const CURRENT_SURCHARGE_RATE = 0.031;

/** 연혁 최초 시행일 — 이보다 이른 일자 조회 시 fallback */
const EARLIEST = INSTALLMENT_SURCHARGE_RATE_HISTORY[0];

/**
 * 특정 일자에 적용되는 고시 가산율 조회.
 * from <= date 인 마지막(가장 최근) 연혁 항목의 rate.
 * date가 최초 시행일 이전이면 최초 율로 fallback(경고 없이 — 실무 범위 밖).
 */
export function lookupSurchargeRate(date: Date): number {
  const t = date.getTime();
  let applicable = EARLIEST.rate;
  for (const period of INSTALLMENT_SURCHARGE_RATE_HISTORY) {
    if (new Date(period.from).getTime() <= t) {
      applicable = period.rate;
    } else {
      break;
    }
  }
  return applicable;
}

/**
 * (prevDate, endDate] 구간 내의 가산율 변경 경계일을 오름차순으로 반환.
 * prevDate 초과 ~ endDate 이하인 시행일만(구간을 실제로 분할하는 경계).
 */
export function surchargeRateBoundariesWithin(prevDate: Date, endDate: Date): Date[] {
  const p = prevDate.getTime();
  const e = endDate.getTime();
  const out: Date[] = [];
  for (const period of INSTALLMENT_SURCHARGE_RATE_HISTORY) {
    const f = new Date(period.from).getTime();
    if (f > p && f <= e) out.push(new Date(period.from));
  }
  return out;
}
