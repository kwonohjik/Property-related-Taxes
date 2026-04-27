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
  const year = d.getFullYear();
  const month = d.getMonth() + 1; // 0-indexed → 1-indexed
  const day = d.getDate();

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
