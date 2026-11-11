/**
 * 개별공시지가 자동추천 연도 결정 헬퍼
 *
 * 개별공시지가는 매년 5월 31일 기준으로 공시된다.
 * 기준일이 5월 31일 이하이면 전년도 공시가격을 사용하고,
 * 6월 1일 이후이면 해당 연도 공시가격을 사용한다.
 *
 * 예시:
 *   2015-04-30 → 2014 (2015년 공시 전)
 *   2015-05-31 → 2014 (공시일 당일은 아직 미공시)
 *   2015-06-01 → 2015 (공시 후)
 *   2023-02-16 → 2022
 *   2013-06-01 → 2013
 */

/**
 * 기준일 YYYY-MM-DD 기준 개별공시지가 추천 연도를 반환한다.
 *
 * @param referenceDate 기준일 (ISO 8601 'YYYY-MM-DD' 문자열 또는 Date)
 * @returns 추천 연도 (정수)
 */
export function recommendLandPriceYear(referenceDate: string | Date): number {
  const d = typeof referenceDate === "string" ? new Date(referenceDate) : referenceDate;
  // UTC 달력 — 기준일 문자열(`new Date("YYYY-MM-DD")`)은 UTC 자정이라 로컬 getter는 시간대마다 전날로 읽힌다
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1; // 0-indexed → 1-indexed
  const day = d.getUTCDate();

  // 5월 31일 이하 → 전년도
  if (month < 6 || (month === 6 && day === 1 && false)) {
    // 5월 이하는 무조건 전년도
  }
  if (month <= 5) return year - 1;
  // 6월 1일 이상 → 해당 연도
  return year;
}

/**
 * 추천 연도와 실제 선택 연도를 비교하여 수동 변경 여부를 판단한다.
 */
export function isManualYear(
  referenceDate: string | Date,
  selectedYear: number,
): boolean {
  return selectedYear !== recommendLandPriceYear(referenceDate);
}

/**
 * 연도 선택 드롭다운용 옵션 목록 (추천 연도 ±2 범위).
 *
 * @param referenceDate 기준일
 * @returns [year, label] 튜플 배열
 */
export function landPriceYearOptions(
  referenceDate: string | Date,
): { year: number; label: string; isRecommended: boolean }[] {
  const recommended = recommendLandPriceYear(referenceDate);
  const result: { year: number; label: string; isRecommended: boolean }[] = [];

  for (let y = recommended - 2; y <= recommended + 2; y++) {
    result.push({
      year: y,
      label: y === recommended ? `${y}년 (자동)` : `${y}년`,
      isRecommended: y === recommended,
    });
  }

  return result;
}

/**
 * 기준일 기준 **주택가격**(공동주택가격·개별주택가격) 추천 연도 (리뷰 US-32).
 *
 * 주택가격은 매년 4월 30일까지 공시한다(부동산 가격공시에 관한 법률 시행령 §38①·§43①). 토지(5/31)와 기준일이 달라
 * 토지용 `recommendLandPriceYear`를 쓰면 5월 기준일에 전년도 주택가격이 「자동」으로 선택된다.
 *
 *   - 5/1 이후 → 당해 연도 (법정 공시기한 경과)
 *   - 4/30 이전 → 전년도 (공시일 당일은 토지와 같은 관례로 미공시 취급 — 4/30 실제 공시일은 확인 필요, 수동 변경 가능)
 *
 * 1/1~5/31 건축·분할 주택의 6/1 기준 별도 공시는 최초공시 전 환산(PHD) 경로가 맡는다.
 */
export function recommendHousingPriceYear(referenceDate: string | Date): number {
  const d = typeof referenceDate === "string" ? new Date(referenceDate) : referenceDate;
  const year = d.getUTCFullYear();
  return d.getUTCMonth() + 1 >= 5 ? year : year - 1;
}

/** 주택가격 연도 선택 옵션 (추천 연도 ±2) */
export function housingPriceYearOptions(
  referenceDate: string | Date,
): { year: number; label: string; isRecommended: boolean }[] {
  const recommended = recommendHousingPriceYear(referenceDate);
  const result: { year: number; label: string; isRecommended: boolean }[] = [];
  for (let y = recommended - 2; y <= recommended + 2; y++) {
    result.push({ year: y, label: y === recommended ? `${y}년 (자동)` : `${y}년`, isRecommended: y === recommended });
  }
  return result;
}
