/**
 * 주식 양도소득세 — 세율표 + 대주주 임계 시기별 매트릭스
 *
 * 법령: 소득세법 시행령 §157 (대주주 임계) / §104①11 (세율)
 * 임계 변경 시 row 추가만으로 대응 가능한 구조.
 */

import {
  STOCK_MAJOR_MARKET_CAP_2024,
} from "@/lib/tax-engine/legal-codes/stock";

// ============================================================
// 대주주 임계 이력 (시기별 — 코스피·코스닥·코넥스 분리)
// ============================================================

export interface MajorShareholderThreshold {
  /** 적용 시작일 (이상) */
  from: Date;
  /** 지분율 임계 (0.01 = 1%) */
  shareRatioThreshold: number;
  /** 시총 임계 (원) */
  marketCapThreshold: number;
}

/** 코스피 대주주 임계 이력 (코넥스 공통 적용 없음 — 코스닥·코넥스 별도) */
const KOSPI_MAJOR_THRESHOLDS: MajorShareholderThreshold[] = [
  // 2024.1.1.~ (현행) — 시행령 §157 개정
  { from: new Date("2024-01-01"), shareRatioThreshold: 0.01, marketCapThreshold: 5_000_000_000 },
  // 2020.4.1.~ 2023.12.31.
  { from: new Date("2020-04-01"), shareRatioThreshold: 0.01, marketCapThreshold: 1_000_000_000 },
  // 2018.4.1.~ 2020.3.31.
  { from: new Date("2018-04-01"), shareRatioThreshold: 0.01, marketCapThreshold: 1_500_000_000 },
  // 2017.~ 2018.3.31.
  { from: new Date("2017-01-01"), shareRatioThreshold: 0.01, marketCapThreshold: 2_500_000_000 },
  // 2013.~ 2016.12.31.
  { from: new Date("2013-01-01"), shareRatioThreshold: 0.02, marketCapThreshold: 5_000_000_000 },
  // 1999.~ 2012.12.31.
  { from: new Date("1999-01-01"), shareRatioThreshold: 0.05, marketCapThreshold: Infinity },
  // ~1998 (임의 시작일)
  { from: new Date("1900-01-01"), shareRatioThreshold: 0.05, marketCapThreshold: Infinity },
];

/** 코스닥 대주주 임계 이력 */
const KOSDAQ_MAJOR_THRESHOLDS: MajorShareholderThreshold[] = [
  // 2024.1.1.~ (현행)
  { from: new Date("2024-01-01"), shareRatioThreshold: 0.02, marketCapThreshold: 5_000_000_000 },
  // 2020.4.1.~
  { from: new Date("2020-04-01"), shareRatioThreshold: 0.02, marketCapThreshold: 1_000_000_000 },
  // 2018.4.1.~
  { from: new Date("2018-04-01"), shareRatioThreshold: 0.02, marketCapThreshold: 1_500_000_000 },
  // 2017.~
  { from: new Date("2017-01-01"), shareRatioThreshold: 0.02, marketCapThreshold: 2_000_000_000 },
  // 2013.8.29.~
  { from: new Date("2013-08-29"), shareRatioThreshold: 0.02, marketCapThreshold: 4_000_000_000 },
  // 2000.~
  { from: new Date("2000-01-01"), shareRatioThreshold: 0.03, marketCapThreshold: 10_000_000_000 },
  // 1999.~
  { from: new Date("1999-01-01"), shareRatioThreshold: 0.05, marketCapThreshold: Infinity },
  // ~1998
  { from: new Date("1900-01-01"), shareRatioThreshold: 0.05, marketCapThreshold: Infinity },
];

/** 코넥스 대주주 임계 이력 (2020.4.1. 시장 개설 이후) */
const KONEX_MAJOR_THRESHOLDS: MajorShareholderThreshold[] = [
  // 2024.1.1.~ (현행) — §157 시총 50억 통일
  { from: new Date("2024-01-01"), shareRatioThreshold: 0.04, marketCapThreshold: STOCK_MAJOR_MARKET_CAP_2024 },
  // 2020.4.1.~
  { from: new Date("2020-04-01"), shareRatioThreshold: 0.04, marketCapThreshold: 1_000_000_000 },
  // 코넥스 최초 (2013.7.1. 개설)
  { from: new Date("2013-07-01"), shareRatioThreshold: 0.04, marketCapThreshold: 1_000_000_000 },
];

/**
 * 시장 타입 + 판정 기준일로 대주주 임계 조회
 * 시기별 가장 최근 적용 임계를 반환
 */
export function getMajorShareholderThreshold(
  marketType: "kospi" | "kosdaq" | "konex",
  priorYearEndDate: Date,
): MajorShareholderThreshold {
  let thresholds: MajorShareholderThreshold[];
  if (marketType === "kospi") {
    thresholds = KOSPI_MAJOR_THRESHOLDS;
  } else if (marketType === "kosdaq") {
    thresholds = KOSDAQ_MAJOR_THRESHOLDS;
  } else {
    thresholds = KONEX_MAJOR_THRESHOLDS;
  }

  // 최신 from 순 정렬 후 priorYearEndDate >= from인 첫 번째
  const sorted = [...thresholds].sort((a, b) => b.from.getTime() - a.from.getTime());
  const match = sorted.find((t) => priorYearEndDate >= t.from);
  if (!match) {
    // fallback: 가장 오래된 임계
    return sorted[sorted.length - 1];
  }
  return match;
}

// ============================================================
// 누진세율 (§104①11 가목 2) + §55 기타자산)
// ============================================================

/** §104①11 가목 2) 주식 대주주 누진세율 2구간 */
export const STOCK_MAJOR_PROGRESSIVE_BRACKETS = [
  { max: 300_000_000, rate: 0.20, deduction: 0 },
  { max: undefined, rate: 0.25, deduction: 15_000_000 },
] as const;

/** §55 기타자산 누진세율 8단계 (부동산 양도세와 동일 구간) */
export const BASIC_PROGRESSIVE_BRACKETS = [
  { max: 14_000_000, rate: 0.06, deduction: 0 },
  { max: 50_000_000, rate: 0.15, deduction: 1_260_000 },
  { max: 88_000_000, rate: 0.24, deduction: 5_760_000 },
  { max: 150_000_000, rate: 0.35, deduction: 15_440_000 },
  { max: 300_000_000, rate: 0.38, deduction: 19_940_000 },
  { max: 500_000_000, rate: 0.40, deduction: 25_940_000 },
  { max: 1_000_000_000, rate: 0.42, deduction: 35_940_000 },
  { max: undefined, rate: 0.45, deduction: 65_940_000 },
] as const;
