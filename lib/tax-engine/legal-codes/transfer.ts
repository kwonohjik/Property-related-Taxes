/**
 * 양도소득세·비사업용토지·다주택 중과 관련 법령 조문 상수
 *
 * 양도소득세 판정 단계에 법적 근거를 첨부하기 위해 사용.
 * 세법 개정 시 이 파일만 수정하면 모든 단계의 법령 참조가 일괄 반영됨.
 */

// ============================================================
// 비사업용 토지 — 소득세법 §104조의3 + 시행령 §168조의6 ~ §168조의14
// ============================================================

/** 비사업용 토지 관련 주요 법령 상수 */
export const NBL = {
  /** 소득세법 §104조의3 — 비사업용 토지의 범위 (메인 근거) */
  MAIN:           "소득세법 §104조의3",
  /** 시행령 §168조의6 — 판정 3기준 (80% / 5년3년 / 3년2년) */
  CRITERIA:       "시행령 §168조의6",
  /** 시행령 §168조의7 — 부득이한 사유 (질병·고령·징집 등) */
  UNAVOIDABLE:    "시행령 §168조의7",
  /** 시행령 §168조의8 — 농지 자경 요건 + 건물 부수 토지 배율 */
  FARMLAND:       "시행령 §168조의8",
  /** 시행령 §168조의8 ③ — 농지 사용의제 (주말농장·한계농지 등) */
  FARMLAND_DEEM:  "시행령 §168조의8 ③",
  /** 시행령 §168조의9 — 목장용지·임야 사업용 요건 */
  FOREST_PASTURE: "시행령 §168조의9",
  /** 시행령 §168조의10 — 임야 특수 요건 (영림계획·산림보호 등) */
  FOREST_SPECIAL: "시행령 §168조의10",
  /** 시행령 §168조의11 — 별장 부수 토지·기타 토지 */
  VILLA_OTHER:    "시행령 §168조의11",
  /** 시행령 §168조의11 ① — 기타토지 (나대지·잡종지) 재산세 유형 */
  OTHER_LAND:     "시행령 §168조의11 ①",
  /** 시행령 §168조의8 — 건물 부수 토지 용도지역별 배율 (농지 자경 요건과 동일 조문) */
  BUILDING_SITE:  "시행령 §168조의8",
  /** 시행령 §168조의8 — 주택 부수 토지 배율 */
  HOUSING_SITE:   "시행령 §168조의8",
  /** 시행령 §168조의14 ① — 도시지역 편입유예 (2~3년) */
  URBAN_GRACE:    "시행령 §168조의14 ①",
  /** 시행령 §168조의14 ③ — 무조건 사업용 의제 (7가지 사유) */
  UNCONDITIONAL:  "시행령 §168조의14 ③",
  /** 시행령 §168조의11 ② + 기획재정부령 §83의5 — 수입금액 비율 테스트 (업종별 기준) */
  REVENUE_TEST:   "시행령 §168조의11 ② + 기획재정부령 §83의5",

  // ── v2 엔진 전용 정확 조문 상수 (PDF p.1695~1707 매핑) ──
  CATEGORY:                       "시행령 §168조의7",
  FARMLAND_URBAN_GRACE:           "시행령 §168조의8 ⑤⑥",
  FOREST:                         "시행령 §168조의9",
  FOREST_PUBLIC:                  "시행령 §168조의9 ①",
  FOREST_RESIDENCE:               "시행령 §168조의9 ②",
  FOREST_BUSINESS:                "시행령 §168조의9 ③",
  PASTURE:                        "시행령 §168조의10",
  PASTURE_RELATED:                "시행령 §168조의10 ②",
  PASTURE_AREA:                   "시행령 §168조의10 ③",
  PASTURE_URBAN:                  "시행령 §168조의10 ④",
  PASTURE_URBAN_GRACE:            "시행령 §168조의10 ⑤",
  OTHER_LAND_BUSINESS:            "시행령 §168조의11 ①",
  HOUSING_MULTIPLIER:             "시행령 §168조의12",
  VILLA:                          "시행령 §168조의13",
  UNAVOIDABLE_PERIOD:             "시행령 §168조의14 ①",
  TRANSFER_DATE_PRESUMED:         "시행령 §168조의14 ②",
  UNCONDITIONAL_ANCESTOR:         "시행령 §168조의14 ③ 1의2호",
  UNCONDITIONAL_PUBLIC:           "시행령 §168조의14 ③ 3호",
  UNCONDITIONAL_JONGJOONG_INHERIT: "시행령 §168조의14 ③ 4호",
} as const;

/**
 * 업종별 수입금액 비율 기준 (소득세법 시행령 §168조의11 ② + 기획재정부령 §83의5)
 *
 * 연간 수입금액 ÷ 양도당시 토지가액 ≥ 기준비율 이면 사업용으로 인정.
 * 기준에 미달하면 해당 기간은 비사업용 사용기간으로 간주.
 */
export const NBL_REVENUE_THRESHOLDS = {
  /** 자동차운전학원·자동차정비학원 등 자동차학원: 10% */
  CAR_DRIVING_SCHOOL: 0.10,
  /** 체육시설업 (골프장 외): 10% */
  SPORTS_FACILITY:    0.10,
  /** 청소년수련시설: 10% */
  YOUTH_FACILITY:     0.10,
  /** 관광숙박업·국제회의업: 7% */
  TOURIST_LODGING:    0.07,
  /** 전문휴양업·종합휴양업: 7% */
  RESORT_BUSINESS:    0.07,
  /** 창고업·운수업·주차장업: 3% */
  TRANSPORTATION:     0.03,
  /** 그 밖의 업종 (기본): 3% */
  DEFAULT:            0.03,
  /** 적용 대상 아님 (수입금액 테스트 생략) */
  NONE:               0,
} as const;

export type NblRevenueBusinessType =
  | "car_driving_school"
  | "sports_facility"
  | "youth_facility"
  | "tourist_lodging"
  | "resort_business"
  | "transportation"
  | "default"
  | "none";

export function getNblRevenueThreshold(type: NblRevenueBusinessType): number {
  switch (type) {
    case "car_driving_school": return NBL_REVENUE_THRESHOLDS.CAR_DRIVING_SCHOOL;
    case "sports_facility":    return NBL_REVENUE_THRESHOLDS.SPORTS_FACILITY;
    case "youth_facility":     return NBL_REVENUE_THRESHOLDS.YOUTH_FACILITY;
    case "tourist_lodging":    return NBL_REVENUE_THRESHOLDS.TOURIST_LODGING;
    case "resort_business":    return NBL_REVENUE_THRESHOLDS.RESORT_BUSINESS;
    case "transportation":     return NBL_REVENUE_THRESHOLDS.TRANSPORTATION;
    case "default":            return NBL_REVENUE_THRESHOLDS.DEFAULT;
    case "none":               return NBL_REVENUE_THRESHOLDS.NONE;
  }
}

// ============================================================
// 양도소득세 — 소득세법 §89 ~ §104
// ============================================================

/** 양도소득세 관련 주요 법령 상수 */
export const TRANSFER = {
  // ── 과세대상·양도차익 ──
  /** 소득세법 §94 ① — 양도소득 과세대상 (양도차익 계산 근거) */
  TRANSFER_GAIN:                 "소득세법 §94 ①",

  // ── 다건 동시 양도 ──
  /** 소득세법 §92 — 동일 과세기간 양도소득금액 합산 → 통합 과세표준 */
  TRANSFER_GAIN_AGGREGATION:     "소득세법 §92",
  /** 소득세법 §102 ② + 시행령 §167의2 — 양도차손 통산 (그룹 내 + 타군 pro-rata 안분) */
  LOSS_OFFSET:                   "소득세법 §102 ② + 시행령 §167의2",
  /** 소득세법 §104의2 — 비교과세 (MAX(세율군별 분리세액, 전체 누진세액)) */
  COMPARATIVE_TAXATION:          "소득세법 §104의2",
  /** 소득세법 §97 — 양도소득 필요경비 (취득가액·자본지출·양도비용) */
  ACQUISITION_COST:              "소득세법 §97",
  /** 소득세법 §97 ① 1호 나목, 시행령 §163 ⑨ — 환산취득가액 (기준시가 비율) */
  ESTIMATED_ACQUISITION:         "소득세법 §97 ① 1호 나목, 시행령 §163 ⑨",

  // ── 비과세·특례 ──
  /** 소득세법 §89 ① — 1세대 1주택 비과세 */
  ONE_HOUSE_EXEMPT:              "소득세법 §89 ①",
  /** 소득세법 시행령 §152 — 1세대의 범위 */
  ONE_HOUSEHOLD_DEF:             "소득세법 시행령 §152",
  /** 소득세법 시행령 §154 — 1세대 1주택 비과세 요건 (보유·거주기간) */
  ONE_HOUSE_REQUIREMENT:         "소득세법 시행령 §154",
  /** 소득세법 시행령 §155 — 일시적 2주택 비과세 특례 */
  TEMPORARY_TWO_HOUSE:           "소득세법 시행령 §155",
  /** 소득세법 시행령 §159 — 보유기간 기산일 (취득일 다음날 기산, 윤년 처리) */
  HOLDING_PERIOD_CALC:           "소득세법 시행령 §159",

  // ── 과세표준·공제 ──
  /** 소득세법 §92 — 양도소득 과세표준 계산 (천원 미만 절사) */
  TAX_BASE_CALC:                 "소득세법 §92",
  /** 소득세법 §95 ② — 장기보유특별공제 */
  LONG_TERM_DEDUCTION:           "소득세법 §95 ②",
  /** 소득세법 §103 — 기본공제 (연 250만원) */
  BASIC_DEDUCTION:               "소득세법 §103",

  // ── 세율 ──
  /** 소득세법 §104 ① — 양도소득세율 (누진·단기·비사업용) */
  TAX_RATE:                      "소득세법 §104 ①",
  /** 소득세법 §104 ⑦ — 다주택 중과세율 (+20%p / +30%p) */
  SURCHARGE:                     "소득세법 §104 ⑦",
  /** 소득세법 §104 ① 10호 — 미등기 양도 70% 단일 중과세율 */
  UNREGISTERED_SURCHARGE:        "소득세법 §104 ①10호",

  // ── 결정세액·지방소득세 ──
  /** 소득세법 §92 ③ 2호 — 양도소득세 결정세액 (산출세액 − 감면세액) */
  FINAL_TAX:                     "소득세법 §92③2호",
  /** 지방세법 §103의3 — 양도소득 개인지방소득세 세율 */
  LOCAL_INCOME_TAX:              "지방세법 §103의3",

  // ── 일괄양도 안분 ──
  /** 소득세법 시행령 §166 ⑥ — 한 계약으로 토지·건물 등 여러 자산을 일괄 양도시 기준시가 비율 안분 */
  BUNDLED_APPORTIONMENT:         "소득세법 시행령 §166 ⑥",

  // ── 상속·증여 자산 취득가액 ──
  /** 소득세법 §97 + 시행령 §163 ⑨ — 상속·증여 자산의 취득가액은 상속개시·증여일 당시 상증법상 평가가액(보충적평가액 포함) */
  ACQ_INHERITED_SUPPLEMENTARY:   "소득세법 §97 · 시행령 §163 ⑨",

  // ── 감면 ──
  /** 조특법 §69 — 자경농지 양도소득세 감면 */
  REDUCTION_SELF_FARMING:        "조특법 §69",
  /** 조특령 §66 ⑪ 1호 — 상속인이 경작 중인 경우 피상속인 경작기간 합산 */
  REDUCTION_SELF_FARMING_INHERITED: "조특령 §66 ⑪ 1호",
  /** 조특법 §97 — 장기임대주택 양도소득세 감면 */
  REDUCTION_LONG_RENTAL:         "조특법 §97",
  /** 조특법 §97의5 — 공공매입임대주택 양도소득세 감면 (공공기관 매각 조건) */
  REDUCTION_LONG_RENTAL_PUBLIC:  "조특법 §97의5",
  /** 조특법 §99 — 신축주택 양도소득세 감면 */
  REDUCTION_NEW_HOUSING:         "조특법 §99",
  /** 조특법 §98의3 — 미분양주택 과세특례 */
  REDUCTION_UNSOLD_HOUSING:      "조특법 §98의3",
  /** 조특법 §127 ② — 감면 중복배제 (동일 자산 복수 감면 시 납세자 유리 1건 선택) */
  REDUCTION_OVERLAP_EXCLUSION:   "조특법 §127 ②",
  /** 조특법 §77 — 공익사업용 토지 등에 대한 양도소득세 감면 */
  REDUCTION_PUBLIC_EXPROPRIATION: "조특법 §77",
  /** 조특법 부칙 제53조 — 공익사업 수용 감면 종전 감면율 경과조치 */
  REDUCTION_PUBLIC_EXPROPRIATION_TRANSITIONAL: "조특법 부칙 제53조",
  /** 조특법 §133 — 감면 종합한도 (공익사업 수용 1년 2억 / 5년 3억) */
  REDUCTION_ANNUAL_LIMIT:        "조특법 §133",
  /** 소득세법 시행령 §168의14 ③ 3호 — 공익사업 수용 토지 당연사업용 인정 (2년/5년) */
  PUBLIC_EXPROPRIATION_NBL_EXCLUSION: "소득세법 시행령 §168의14 ③ 3호",
  /** 소득세법 §114조의2 — 신축·증축 건물 환산취득가액·감정가액 적용 시 가산세 (5%) */
  BUILDING_PENALTY:              "소득세법 §114조의2",

  // ── 1990.8.30. 이전 취득 토지 기준시가 환산 ──
  /** 소득세법 시행령 §164 — 양도소득세 기준시가 (토지) */
  PRE1990_STD_PRICE_BASE:        "소득세법 시행령 §164",
  /** 소득세법 시행령 §176조의2 — 취득 당시 기준시가 환산 */
  PRE1990_STD_PRICE_CONVERSION:  "소득세법 시행령 §176조의2",
  /** 소득세법 시행규칙 §80 ⑥ — 분모 capping + 비율 100% capping 규정 */
  PRE1990_CAP_RULE:              "소득세법 시행규칙 §80 ⑥",
  /** 국세청 양도소득세 집행기준 97-176의2 — 1990.8.30. 전 취득토지 산정예시 5가지 */
  PRE1990_GUIDELINE:             "국세청 양도소득세 집행기준 97-176의2",
  /** 환지처분 확정일 다음날을 취득일로 보는 특례 */
  REPLOTTING_ACQ_DATE:           "소득세법 시행령 §162 ① 6호",
  /** 환지 감환지·증환지 면적 산정 특례 (권리면적 > 교부면적 → 감환지로 청산금 수령 간주) */
  EXCHANGE_LAND_REDUCTION:       "소득세법 시행령 §162의2",

  // ── 자경농지 편입일 부분감면 (조특법 §69 + 시행령 §66 ⑤⑥) ──
  /** 조특법 시행령 §66 ⑤⑥ — 2002.1.1 이후 주거/상업/공업지역 편입 시 편입일까지만 감면 + 3년 내 양도 요건 */
  REDUCTION_SELF_FARMING_INCORP: "조특법 시행령 §66 ⑤⑥",
} as const;

// ============================================================
// 다주택 중과세 — 소득세법 §104 ② + 시행령 §152·§167의3·§167의10
// ============================================================

/** 다주택 중과세 판정 관련 주요 법령 상수 */
export const MULTI_HOUSE = {
  // ── 중과세율 근거 ──
  /** 소득세법 §104 ⑦ — 다주택 중과세율 (+20%p / +30%p) */
  SURCHARGE_RATE:                 "소득세법 §104 ⑦",
  /** 소득세법 시행령 §152 — 1세대의 범위 */
  ONE_HOUSEHOLD_DEF:              "소득세법 시행령 §152",

  // ── 주택 수 산정 ──
  /** 소득세법 시행령 §167의3 — 주택 수 산정 및 3주택+ 중과배제 14가지 */
  HOUSE_COUNT_RULE:               "소득세법 시행령 §167의3",
  /** 소득세법 시행령 §167의3 ① 2호의2 — 인구감소지역 세컨드홈 주택 수 산정 배제 */
  SECOND_HOME_DEPOPULATION:       "소득세법 시행령 §167의3 ① 2호의2",
  /** 소득세법 시행령 §167의3 ① 2호 나목 10호 — 3주택 중과배제 (유일한 일반주택) */
  THREE_HOUSE_EXCLUSION_SOLE:     "소득세법 시행령 §167의3 ① 2호 나목 10호",

  // ── 2주택 중과배제 ──
  /** 소득세법 시행령 §167의10 — 2주택 중과배제 사유 10가지 */
  TWO_HOUSE_EXCLUSION:            "소득세법 시행령 §167의10",
  /** 소득세법 시행령 §167의10 ① 3호 — 부득이한 사유 취득 주택 2주택 중과배제 */
  TWO_HOUSE_UNAVOIDABLE:          "소득세법 시행령 §167의10 ① 3호",
  /** 소득세법 시행령 §167의10 ⑩ — 기준시가 1억 이하 소형주택 보유 2주택 중과배제 */
  TWO_HOUSE_SMALL_HOUSE:          "소득세법 시행령 §167의10 ⑩",

  // ── 특례·과세특례 ──
  /** 조특법 §99의3 — 미분양주택 과세특례 (주택 수 산정 배제) */
  UNSOLD_HOUSING_EXEMPTION:       "조특법 §99의3",
  /** 소득세법 시행령 §167의10 ① 8호 — 소송으로 취득한 주택 2주택 중과배제 */
  TWO_HOUSE_LITIGATION:           "소득세법 시행령 §167의10 ① 8호",
} as const;
