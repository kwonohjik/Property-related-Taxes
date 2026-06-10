/**
 * D1. 건물신축가격기준액 (연도 → 원/㎡)
 *
 * 출처: 국세청 「건물 기준시가 계산방법」 고시 — 제3장 §3(p.297 본문) + 부록 「연도별 건물신축가격기준액」(1p).
 * PDF 전수 실측(2026-06-10). ⚠️ 본문 표(p.297)는 2025년까지, 부록 표는 2026년(860,000)까지 포함.
 *
 * 2000년 이전 = 2001년값(400,000) 적용(고시 §3 비고). 신규 연도(2027~) 고시 시 1행 추가.
 * 역사적 확정 테이블 → 정적 상수(`land-grade-values.ts` 선례).
 */
export const NEW_BUILDING_BASE_PRICE: Readonly<Record<number, number>> = Object.freeze({
  2001: 400_000,
  2002: 420_000,
  2003: 460_000,
  2004: 460_000,
  2005: 460_000,
  2006: 470_000,
  2007: 490_000,
  2008: 510_000,
  2009: 510_000,
  2010: 540_000,
  2011: 580_000,
  2012: 610_000,
  2013: 620_000,
  2014: 640_000,
  2015: 650_000,
  2016: 660_000,
  2017: 670_000,
  2018: 690_000,
  2019: 710_000,
  2020: 730_000,
  2021: 740_000,
  2022: 780_000,
  2023: 820_000,
  2024: 830_000,
  2025: 850_000,
  2026: 860_000,
});

/** 데이터 보유 연도 경계 */
export const NEW_BUILDING_BASE_PRICE_MIN_YEAR = 2001;
export const NEW_BUILDING_BASE_PRICE_MAX_YEAR = 2026;

/**
 * 연도별 신축가격기준액 조회. 2000년 이전은 2001년값(400,000) 적용.
 * 보유 범위(2026) 초과 시 undefined 반환(silent fallback 금지 — 호출부에서 검증 오류 처리).
 */
export function resolveNewBuildingBasePrice(year: number): number | undefined {
  if (year < NEW_BUILDING_BASE_PRICE_MIN_YEAR) {
    return NEW_BUILDING_BASE_PRICE[NEW_BUILDING_BASE_PRICE_MIN_YEAR];
  }
  return NEW_BUILDING_BASE_PRICE[year];
}
