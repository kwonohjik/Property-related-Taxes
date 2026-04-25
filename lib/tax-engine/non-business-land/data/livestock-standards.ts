/**
 * 가축 두수당 표준 면적 (㎡/두)
 *
 * 출처: 축산법 시행규칙 별표2 (가축사육업 시설 기준)
 * 목장용지 비사업용 판정 시 사업용 허용 면적 계산에 사용 (시행령 §168조의10 ③).
 *
 * 사업용 허용 면적 = 사육두수 × 단위면적 (개체군별)
 */
export const LIVESTOCK_STANDARD_AREA: Readonly<Record<string, number>> = Object.freeze({
  hanwoo:           10,    // 한우 (㎡/두)
  dairy:            15,    // 젖소
  pig_sow:           2.5,  // 돼지 (모돈)
  pig_fattening:     0.8,  // 돼지 (비육)
  poultry:           0.05, // 닭·오리 등 가금
  horse:            20,    // 말
  sheep:             2,    // 양
  goat:              2,    // 염소
});

/**
 * 가축 종류와 사육두수로 사업용 허용 면적(㎡)을 계산한다.
 *
 * @param livestockType - LIVESTOCK_STANDARD_AREA 키 (예: "hanwoo", "dairy")
 * @param count         - 사육두수 (양의 정수)
 * @returns 사업용 허용 면적 (㎡). 알 수 없는 축종이면 0 반환.
 */
export function getLivestockStandardArea(
  livestockType: string,
  count: number,
): number {
  const perHead = LIVESTOCK_STANDARD_AREA[livestockType] ?? 0;
  return perHead * count;
}
