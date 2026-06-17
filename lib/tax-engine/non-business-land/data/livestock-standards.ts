/**
 * 가축별 기준면적 (소득세법 시행령 별표 1의3 「축산용 토지 및 건물의 기준면적」, 개정 2008.2.22)
 * — §168조의10③ 위임. 사용자 제공 정본(2026-06-17) 반영.
 *
 * 1두(수)당 기준면적 = (축사 + 부대시설 + 초지 + 사료포) / 가축두수 단위.
 * - 축사·부대시설: ㎡ (별표 그대로)
 * - 초지·사료포: 별표는 헥타르 → ㎡로 환산 저장(헥타르 × 10,000)하여 부동소수 누적 회피.
 * - 가축두수 단위(perUnit): 한우·유우 1두 / 양·사슴 10두 / 토끼·가금 100(두·수) / 돼지·밍크 5(두·수).
 */
export interface LivestockStandard {
  /** 가축두수 단위 (별표 "가축두수" 열: 1·5·10·100) */
  perUnit: number;
  /** 축사 (㎡) */
  barn: number;
  /** 부대시설 (㎡) */
  facility: number;
  /** 초지 (㎡ — 별표 헥타르 × 10,000) */
  grasslandM2: number;
  /** 사료포 (㎡ — 별표 헥타르 × 10,000) */
  fodderM2: number;
}

/**
 * 별표 1의3 가축별 기준면적 정본. 키는 축종+사업(한우는 사육/비육 구분).
 * 비고: 한우 사육=말·노새·당나귀 포함 / 토끼=친칠라 포함 / 돼지=개 포함 / 밍크=여우 포함.
 */
export const LIVESTOCK_STANDARD: Readonly<Record<string, LivestockStandard>> = Object.freeze({
  hanwoo_breeding:  { perUnit: 1,   barn: 7.5, facility: 5,  grasslandM2: 5000, fodderM2: 2500 }, // 한우(육우) 사육사업
  hanwoo_fattening: { perUnit: 1,   barn: 7.5, facility: 5,  grasslandM2: 2000, fodderM2: 1000 }, // 한우(육우) 비육사업
  dairy:            { perUnit: 1,   barn: 11,  facility: 7,  grasslandM2: 5000, fodderM2: 2500 }, // 유우 목장사업
  sheep:            { perUnit: 10,  barn: 8,   facility: 3,  grasslandM2: 5000, fodderM2: 2500 }, // 양 목장사업
  deer:             { perUnit: 10,  barn: 66,  facility: 16, grasslandM2: 5000, fodderM2: 2500 }, // 사슴 목장사업
  rabbit:           { perUnit: 100, barn: 33,  facility: 7,  grasslandM2: 2000, fodderM2: 1000 }, // 토끼 사육사업
  pig:              { perUnit: 5,   barn: 50,  facility: 13, grasslandM2: 0,    fodderM2: 0 },    // 돼지 양돈사업
  poultry:          { perUnit: 100, barn: 33,  facility: 16, grasslandM2: 0,    fodderM2: 0 },    // 가금 양계사업
  mink:             { perUnit: 5,   barn: 7,   facility: 7,  grasslandM2: 0,    fodderM2: 0 },    // 밍크 사육사업
});

/**
 * 가축 종류와 사육두수로 축산용 토지 기준면적(㎡)을 계산한다 (별표 1의3 §168조의10③).
 *
 * 기준면적 = (축사 + 부대시설 + 초지 + 사료포) × 사육두수 ÷ 가축두수 단위.
 * (곱셈을 먼저 수행해 부동소수 누적을 피한다.)
 *
 * @param livestockType - LIVESTOCK_STANDARD 키 (예: "hanwoo_breeding", "dairy")
 * @param count         - 사육두수(수) (양의 정수)
 * @returns 축산용 토지 기준면적 (㎡). 알 수 없는 축종이면 0.
 */
export function getLivestockStandardArea(livestockType: string, count: number): number {
  const s = LIVESTOCK_STANDARD[livestockType];
  if (!s) return 0;
  const sumPerUnit = s.barn + s.facility + s.grasslandM2 + s.fodderM2;
  return (sumPerUnit * count) / s.perUnit;
}
