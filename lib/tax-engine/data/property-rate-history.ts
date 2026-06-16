/**
 * 재산세 비주택 세율 역사표 (지방세법 §111) — §118 세부담상한 정밀 재산정용.
 *
 * 비주택 표준세율은 역사적으로 불변(KoreanLaw amendment_track 확인, 2026-06-16) →
 * 단일 기준연도(2005~) 엔트리. 미래 개정 시 해당 fromYear 엔트리 추가.
 *
 * 현행값은 PROPERTY_CONST·PROPERTY_SEPARATE_CONST(legal-codes/property.ts) 및
 * separate-taxation.ts RATE_LOW/STD/HEAVY, property-tax.ts 선박·factory 리터럴을 미러한다.
 * 드리프트는 property-rate-history-anchor.test.ts 가 일치 검증으로 차단.
 *
 * 주택(§111①3호)은 §122 단서로 세부담상한 미적용 → 본 표 비대상.
 */

/** 토지 누진세율 3구간 (종합합산·별도합산) */
export interface LandProgressiveRateSet {
  /** 1구간 상한 (원) */
  bracket1: number;
  /** 2구간 상한 (원) */
  bracket2: number;
  /** 1구간 세율 */
  rate1: number;
  /** 2구간 세율 */
  rate2: number;
  /** 3구간(초과) 세율 */
  rate3: number;
}

/** 연도별 재산세 비주택 세율 세트 */
export interface PropertyRateSet {
  /** 건축물 일반 (§111①2호 다목) */
  buildingGeneral: number;
  /** 건축물 골프장·고급오락장 (§111①2호 가목) */
  buildingLuxury: number;
  /** 건축물 공장 (§111①2호 나목) */
  buildingFactory: number;
  /** 선박(일반)·항공기 (§111①4호 나목·5호) */
  vesselAircraft: number;
  /** 토지 종합합산 (§111①1호 가목) */
  landComprehensive: LandProgressiveRateSet;
  /** 토지 별도합산 (§111①1호 나목) */
  landSeparateAggregate: LandProgressiveRateSet;
  /** 토지 분리 저율 — 전·답·과수원·목장·임야 (§111①1호 다목 1) */
  landSeparatedLow: number;
  /** 토지 분리 일반 — 그 밖의 토지 (§111①1호 다목 3) */
  landSeparatedGeneral: number;
  /** 토지 분리 중과 — 골프장·고급오락장용 (§111①1호 다목 2) */
  landSeparatedHigh: number;
}

/** 2005년 이후 현행 세율 (개정 이력 없음 — amendment_track 확인) */
const RATE_SET_2005: PropertyRateSet = {
  buildingGeneral: 0.0025,
  buildingLuxury: 0.04,
  buildingFactory: 0.005,
  vesselAircraft: 0.003,
  landComprehensive: {
    bracket1: 50_000_000,
    bracket2: 100_000_000,
    rate1: 0.002,
    rate2: 0.003,
    rate3: 0.005,
  },
  landSeparateAggregate: {
    bracket1: 200_000_000,
    bracket2: 1_000_000_000,
    rate1: 0.002,
    rate2: 0.003,
    rate3: 0.004,
  },
  landSeparatedLow: 0.0007,
  landSeparatedGeneral: 0.002,
  landSeparatedHigh: 0.04,
};

/** fromYear → 해당 연도부터 적용되는 세율 세트 (오름차순 키) */
export const PROPERTY_RATE_HISTORY: Record<number, PropertyRateSet> = {
  2005: RATE_SET_2005,
};

/**
 * 지정 연도에 적용되는 재산세 비주택 세율 세트 반환.
 * `year` 이하 최대 fromYear 엔트리(없으면 최소 엔트리)를 선택한다.
 */
export function getPropertyRateSet(year: number): PropertyRateSet {
  const fromYears = Object.keys(PROPERTY_RATE_HISTORY)
    .map(Number)
    .sort((a, b) => b - a); // 내림차순
  const applicable = fromYears.find((y) => year >= y) ?? fromYears[fromYears.length - 1];
  return PROPERTY_RATE_HISTORY[applicable];
}

/** 현행(최신 fromYear) 세율 세트 — 일반 계산(당해연도)·calc 기본 인자용 */
export function getCurrentPropertyRateSet(): PropertyRateSet {
  const fromYears = Object.keys(PROPERTY_RATE_HISTORY).map(Number);
  return PROPERTY_RATE_HISTORY[Math.max(...fromYears)];
}
