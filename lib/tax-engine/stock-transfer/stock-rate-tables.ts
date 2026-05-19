/**
 * 주식 양도소득세 — 세율표 + 대주주 임계 시기별 매트릭스
 *
 * 법령: 소득세법 시행령 §157 (상장 대주주 임계) / §167의8 (비상장 대주주 임계)
 *       / §104①11 (세율)
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
  /**
   * 적용 규칙 출처 (UI 라벨링용 — Phase B 신설, 2026-05-19).
   * - "§157": 상장 (kospi/kosdaq/konex)
   * - "§167의8①2호": 비상장 일반
   * - "§167의8①2호_벤처": 비상장 벤처기업 (시총 임계 40억 적용)
   *
   * 매트릭스 상수 정의 시점엔 undefined, `getMajorShareholderThreshold()` 반환 시 동적 부착.
   */
  ruleSource?: "§157" | "§167의8①2호" | "§167의8①2호_벤처";
  /**
   * 비상장 벤처기업 임계 적용 여부 (UI 배지 분기용 — Phase B 신설, 2026-05-19).
   * `getMajorShareholderThreshold(unlisted, _, { isVentureCompany: true })` 호출 시 true.
   */
  isVentureRule?: boolean;
}

/** 코스피 대주주 임계 이력 (코넥스 공통 적용 없음 — 코스닥·코넥스 별도) */
export const KOSPI_MAJOR_THRESHOLDS: MajorShareholderThreshold[] = [
  // 2024.1.1.~ (현행) — 시행령 §157 개정
  { from: new Date("2024-01-01"), shareRatioThreshold: 0.01, marketCapThreshold: 5_000_000_000 },
  // 2020.4.1.~ 2023.12.31.
  { from: new Date("2020-04-01"), shareRatioThreshold: 0.01, marketCapThreshold: 1_000_000_000 },
  // 2018.4.1.~ 2020.3.31.
  { from: new Date("2018-04-01"), shareRatioThreshold: 0.01, marketCapThreshold: 1_500_000_000 },
  // 2017.~ 2018.3.31.
  { from: new Date("2017-01-01"), shareRatioThreshold: 0.01, marketCapThreshold: 2_500_000_000 },
  // 2016.4.1.~ 2016.12.31. (F-01 — 교재 §3장 이미지 48 ⑤, KoreanLaw 미검증)
  { from: new Date("2016-04-01"), shareRatioThreshold: 0.01, marketCapThreshold: 2_500_000_000 },
  // 2013.~ 2016.3.31. (구간 단축)
  { from: new Date("2013-01-01"), shareRatioThreshold: 0.02, marketCapThreshold: 5_000_000_000 },
  // 1999.~ 2012.12.31.
  { from: new Date("1999-01-01"), shareRatioThreshold: 0.05, marketCapThreshold: Infinity },
  // ~1998 (임의 시작일)
  { from: new Date("1900-01-01"), shareRatioThreshold: 0.05, marketCapThreshold: Infinity },
];

/** 코스닥 대주주 임계 이력 */
export const KOSDAQ_MAJOR_THRESHOLDS: MajorShareholderThreshold[] = [
  // 2024.1.1.~ (현행)
  { from: new Date("2024-01-01"), shareRatioThreshold: 0.02, marketCapThreshold: 5_000_000_000 },
  // 2020.4.1.~
  { from: new Date("2020-04-01"), shareRatioThreshold: 0.02, marketCapThreshold: 1_000_000_000 },
  // 2018.4.1.~
  { from: new Date("2018-04-01"), shareRatioThreshold: 0.02, marketCapThreshold: 1_500_000_000 },
  // 2017.~
  { from: new Date("2017-01-01"), shareRatioThreshold: 0.02, marketCapThreshold: 2_000_000_000 },
  // 2016.4.1.~ 2016.12.31. (F-02 — 교재 §3장 이미지 48 ⑤, KoreanLaw 미검증)
  { from: new Date("2016-04-01"), shareRatioThreshold: 0.02, marketCapThreshold: 2_000_000_000 },
  // 2013.8.29.~ 2016.3.31. (구간 단축)
  { from: new Date("2013-08-29"), shareRatioThreshold: 0.02, marketCapThreshold: 4_000_000_000 },
  // 2000.~
  { from: new Date("2000-01-01"), shareRatioThreshold: 0.03, marketCapThreshold: 10_000_000_000 },
  // 1999.~
  { from: new Date("1999-01-01"), shareRatioThreshold: 0.05, marketCapThreshold: Infinity },
  // ~1998
  { from: new Date("1900-01-01"), shareRatioThreshold: 0.05, marketCapThreshold: Infinity },
];

/** 코넥스 대주주 임계 이력 (2020.4.1. 시장 개설 이후) */
export const KONEX_MAJOR_THRESHOLDS: MajorShareholderThreshold[] = [
  // 2024.1.1.~ (현행) — §157 시총 50억 통일
  { from: new Date("2024-01-01"), shareRatioThreshold: 0.04, marketCapThreshold: STOCK_MAJOR_MARKET_CAP_2024 },
  // 2020.4.1.~
  { from: new Date("2020-04-01"), shareRatioThreshold: 0.04, marketCapThreshold: 1_000_000_000 },
  // 코넥스 최초 (2013.7.1. 개설)
  { from: new Date("2013-07-01"), shareRatioThreshold: 0.04, marketCapThreshold: 1_000_000_000 },
];

// ============================================================
// 비상장 대주주 임계 이력 (시기별 — §167의8①2호)
// ============================================================

/**
 * 비상장(주권비상장법인) 대주주 임계 이력
 *
 * 법령: 소득세법 시행령 §167의8①2호
 *   가목: 지분율 기준 (주주 1인 및 기타주주 합산)
 *   나목: 시가총액 기준
 *
 * 검증 상태:
 * - 현행(2024.1.1.~): §167의8①2호 가목 4% / 나목 10억 — KoreanLaw MCP 조문 직접 확인 (2026-05-17)
 * - 2020.4.1.~ 2023.12.31.: 4% / 10억 — 현행과 동일 (연혁 API 미지원, 조문 연속성 추정)
 * - 2018.4.1.~ 2020.3.31.: 4% / 15억 — §157 코스닥 개정 패턴 병행 참고 (법제처 연혁 미확인)
 * - 2017.1.1.~ 2018.3.31.: 4% / 25억 — 동일 (법제처 연혁 미확인)
 * - 2013.1.1.~ 2016.12.31.: 2% / 30억 — 동일 (법제처 연혁 미확인)
 * - ~2012.12.31.: 2% / Infinity — fallback (법제처 연혁 미확인)
 *
 * ⚠️ 주의: §157(상장)의 2024.1.1.~ 50억 통일과 달리, §167의8(비상장)은 10억 유지.
 * ⚠️ 2017.1.1.~2023.12.31. 임계는 법제처 연혁 API 미확인 — 실무 필요 시 재검증.
 */
export const UNLISTED_MAJOR_THRESHOLDS: MajorShareholderThreshold[] = [
  // 2020.4.1.~ 현재 (현행 §167의8①2호 KoreanLaw MCP 직접 확인 — 2026-05-17 F-6)
  // 가목: 지분율 4% / 나목: 시총 10억원 (벤처기업 40억원 — 단순화: 비벤처 기준 10억 적용)
  { from: new Date("2020-04-01"), shareRatioThreshold: 0.04, marketCapThreshold: 1_000_000_000 },
  // 2018.4.1.~ 2020.3.31. (시총 25억→15억 완화 — WebSearch 검증 2026-05-17 F-6)
  { from: new Date("2018-04-01"), shareRatioThreshold: 0.04, marketCapThreshold: 1_500_000_000 },
  // 2017.1.1.~ 2018.3.31. (시총 50억→25억 완화 — WebSearch 검증 2026-05-17 F-6)
  { from: new Date("2017-01-01"), shareRatioThreshold: 0.04, marketCapThreshold: 2_500_000_000 },
  // 2016.4.1.~ 2016.12.31. (F-03 — 교재 §3장 이미지 48 ⑤ 비상장 2%/50억, KoreanLaw 미검증)
  // 2016.1.1.~3.31. 구간은 교재 미명시 → 추정 금지, 현행 행(4%/50억) 유지
  { from: new Date("2016-04-01"), shareRatioThreshold: 0.02, marketCapThreshold: 5_000_000_000 },
  // 2013.1.1.~ 2016.3.31. (구간 단축, 시총 50억 추정·법제처 부칙 미확인)
  // F-6 정정 (2026-05-17): 지분율 0.02 → 0.04 — 비상장은 §157 코스닥 2% 패턴 잘못 차용 정정
  { from: new Date("2013-01-01"), shareRatioThreshold: 0.04, marketCapThreshold: 5_000_000_000 },
  // ~2012.12.31. fallback (법제처 부칙 미확인)
  // F-6 정정 (2026-05-17): 지분율 0.02 → 0.05 — §94①3 나목 일반 5% 보수적 fallback
  { from: new Date("1900-01-01"), shareRatioThreshold: 0.05, marketCapThreshold: Infinity },
];

/**
 * 시장 타입 + 판정 기준일로 대주주 임계 조회
 * 시기별 가장 최근 적용 임계를 반환
 *
 * Phase B 확장 (2026-05-19):
 * - `options.isVentureCompany === true && marketType === "unlisted"` 시 시총 임계 40억 적용
 *   (시행령 §167의8①2호 나목 단서 — 비상장 벤처기업 별도 임계, 교재 §3장 이미지 48 ⑤)
 * - 반환 객체에 `ruleSource`·`isVentureRule` 동적 부착
 */
export function getMajorShareholderThreshold(
  marketType: "kospi" | "kosdaq" | "konex" | "unlisted",
  priorYearEndDate: Date,
  options?: { isVentureCompany?: boolean },
): MajorShareholderThreshold {
  let thresholds: MajorShareholderThreshold[];
  if (marketType === "kospi") {
    thresholds = KOSPI_MAJOR_THRESHOLDS;
  } else if (marketType === "kosdaq") {
    thresholds = KOSDAQ_MAJOR_THRESHOLDS;
  } else if (marketType === "konex") {
    thresholds = KONEX_MAJOR_THRESHOLDS;
  } else {
    // unlisted — §167의8①2호
    thresholds = UNLISTED_MAJOR_THRESHOLDS;
  }

  // 최신 from 순 정렬 후 priorYearEndDate >= from인 첫 번째
  const sorted = [...thresholds].sort((a, b) => b.from.getTime() - a.from.getTime());
  const match = sorted.find((t) => priorYearEndDate >= t.from) ?? sorted[sorted.length - 1];

  // Phase B — 비상장 벤처기업 분기 (§167의8①2호 나목 단서)
  if (marketType === "unlisted" && options?.isVentureCompany) {
    return {
      ...match,
      marketCapThreshold: 4_000_000_000, // 시총 40억
      ruleSource: "§167의8①2호_벤처",
      isVentureRule: true,
    };
  }

  // 일반 분기 — ruleSource·isVentureRule 동적 부착
  return {
    ...match,
    ruleSource: marketType === "unlisted" ? "§167의8①2호" : "§157",
    isVentureRule: false,
  };
}

/**
 * 시장 타입 + 직전 사업연도 종료일로 해당 임계의 적용 시작일(from)을 ISO 문자열로 반환
 * buildAppliedThreshold 헬퍼에서 fromDate 산출에 사용
 */
export function resolveThresholdFromDate(
  marketType: "kospi" | "kosdaq" | "konex" | "unlisted",
  priorYearEndDate: Date,
): string {
  const table =
    marketType === "kospi" ? KOSPI_MAJOR_THRESHOLDS :
    marketType === "kosdaq" ? KOSDAQ_MAJOR_THRESHOLDS :
    marketType === "konex" ? KONEX_MAJOR_THRESHOLDS :
    UNLISTED_MAJOR_THRESHOLDS;
  const sorted = [...table].sort((a, b) => b.from.getTime() - a.from.getTime());
  const match = sorted.find((t) => priorYearEndDate >= t.from) ?? sorted[sorted.length - 1];
  return match.from.toISOString().slice(0, 10);
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
