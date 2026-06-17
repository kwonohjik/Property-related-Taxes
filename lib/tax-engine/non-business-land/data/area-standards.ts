/**
 * §168의11① 호별 면적기준 산식 배율 (정적 상수)
 *
 * KoreanLaw 본문 검증(2026-06-16, mst=286211 §168조의11① · mst=286379 시행규칙 §83의4):
 * - 7호:   매년 물품 보관·관리 최대면적의 100분의 120 이내 (§168의11①7호)
 * - 4호:   수용정원 × 200제곱미터 (시행규칙 §83의4⑧)
 * - 2호나: 최저차고기준면적 × 1.5 이내 (§168의11①2호나목)
 * - 13호:  660제곱미터 이내 (§168의11①13호)
 *
 * 별표3(체육 1호)·별표6(예비군 5호다목) 자동산출 = F2 Phase A. 별표4·5(가목2·나목) = F2 Phase B(B-1).
 * 별표1의3(목장 per-head·blocker)·복잡 비고(용도지역별 배율·6호 휴양 3요소·선수가산)는 후속(B-2~B-4).
 */
export const NBL_AREA_MULTIPLIER = {
  /** 7호 하치장: 매년 최대 사용면적 × 120% */
  HATCHANG_RATIO: 1.2,
  /** 4호 청소년수련시설: 수용정원 × 200㎡ */
  YOUTH_PER_CAPITA: 200,
  /** 2호 나목 업무용자동차 주차장: 최저차고기준면적 × 1.5 */
  GARAGE_MULTIPLIER: 1.5,
  /** 13호 무주택1세대 1필지 나지: 660㎡ 고정 */
  VACANT_LOT_1HOUSEHOLD: 660,
} as const;

/**
 * 별표3 선수전용 체육시설 기준면적(㎡) — 시행규칙 §83의4①(별표3). 실외 11종 + 실내 3구간.
 * KoreanLaw 본문 실측(mst=286379 별표3, 2026-06-17).
 */
export const SPORTS_OUTDOOR_STD = {
  soccer: 11000,
  baseball: 14000,
  rugby: 9000,
  field_hockey: 6500,
  tennis: 650,
  soft_tennis: 650,
  american_football: 7000,
  equestrian: 6200,
  shooting: 4000,
  archery: 7100,
  other_outdoor: 3000,
} as const;
export const SPORTS_INDOOR_STD = {
  ball_court: 800, // 핸드볼·배구·농구·탁구·배드민턴·복싱·유도·검도·태권도·펜싱·체조·역도·씨름·레슬링·볼링
  swimming: 1000, // 수영·수구·다이빙
  ice_rink: 1800, // 아이스하키·피겨·롤러스케이트
} as const;

/**
 * 별표6 제2호 예비군훈련장 기준면적(㎡) — 시행규칙 §83의4⑩(별표6). 부대편성인원 4구간 × 4시설.
 * 비고: 사격술예비·사격장·기초훈련장은 전술교육장에서 실시 불가 시에만 포함(reserveForcesFacilities 선택).
 * KoreanLaw 본문 실측(mst=286379 별표6, 2026-06-17).
 */
export const RESERVE_FORCES_STD = {
  le800: { tactical: 15000, shooting_prep: 3600, range: 1650, basic: 2500 },
  le2400: { tactical: 30000, shooting_prep: 7200, range: 2475, basic: 5000 },
  le5000: { tactical: 30000, shooting_prep: 10800, range: 3300, basic: 7500 },
  gt5000: { tactical: 45000, shooting_prep: 10800, range: 3300, basic: 7500 },
} as const;

/**
 * 별표4 운동경기업 선수전용 체육시설 기준면적(㎡) — 시행규칙 §83의4③(별표4). 실외 11종 + 실내 3구간.
 * 별표3과 종목 동일·면적 상이(약 1.5배). KoreanLaw 본문 실측(mst=286379 별표4, 2026-06-17).
 */
export const SPORTS_BUSINESS_OUTDOOR_STD = {
  soccer: 16500,
  baseball: 21000,
  rugby: 13500,
  field_hockey: 9750,
  tennis: 975,
  soft_tennis: 975,
  american_football: 10500,
  equestrian: 9300,
  shooting: 6000,
  archery: 10650,
  other_outdoor: 4500,
} as const;
export const SPORTS_BUSINESS_INDOOR_STD = {
  ball_court: 1200, // 핸드볼·배구·농구·탁구·배드민턴·복싱·유도·검도·태권도·펜싱·체조·역도·씨름·레슬링·볼링
  swimming: 1500, // 수영·수구·다이빙
  ice_rink: 2700, // 아이스하키·피겨·롤러스케이트
} as const;

/**
 * 별표5 종업원 체육시설 기준면적(㎡) — 시행규칙 §83의4④(별표5). 종업원수 5구간.
 * 운동장(field)은 구간내 선형보간, 코트(court)·실내(indoor)는 계단식 고정.
 * 비고2(종업원 50인↓ 코트면적만)·비고3(실내 바닥≤기준 시 바닥면적)은 호출부에서 처리.
 * KoreanLaw 본문 실측(mst=286379 별표5, 2026-06-17).
 */
export function employeeSportsArea(
  kind: "field" | "court" | "indoor",
  n: number,
): number {
  if (kind === "court") return n <= 500 ? 970 : n <= 2000 ? 1940 : 2910;
  if (kind === "indoor") return n <= 100 ? 150 : n <= 500 ? 300 : n <= 2000 ? 450 : 900;
  // field(운동장) — 구간내 선형보간
  if (n <= 100) return 1000;
  if (n <= 500) return 1000 + (n - 100) * 9;
  if (n <= 2000) return 4600 + (n - 500) * 3;
  if (n <= 10000) return 9100 + (n - 2000) * 1;
  return 17100;
}
