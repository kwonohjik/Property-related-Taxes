/**
 * 공동주택(아파트) 최초고시 전 취득 + 고가주택 사례 23 fixture
 *
 * 출처: 양도소득세 사례집 23번 + 예제 검증 화면 (2026-05-04)
 * 건물 기준시가 3시점은 예제 검증값(환산취득가 244,991,717 / 개산공제 8,491,190)을
 * 역산 fitting한 테스트 전용 값.
 * 실제 운영에서는 사용자가 국세청 건물기준시가 고시 자료를 참조해 직접 입력.
 *
 * 사례 개요:
 *   - 양도자산: 경기 성남시 분당구 서현동 87 삼성아파트 108동 1402호
 *   - 양도일: 2023-02-19 / 양도가액: 1,320,000,000원
 *   - 취득일: 1992-01-30 (취득 실거래가 미확인)
 *   - 거주: 2년 미만 → 표1 LTHL 적용
 *   - 1세대1주택 + 2017.8.2 이전 취득 → 12억 초과분만 과세
 *   - 최초공시일: 1993-02-01 → 소령 §164⑤·⑦ 3-시점 환산
 *
 * 법령: 소득세법 §89, §95②, §97①, 소령 §163⑥, §164⑤·⑦
 */

import type { PreHousingDisclosureInput } from "@/lib/tax-engine/types/transfer.types";

// ──────────────────────────────────────────────────────────────
// 기본 거래 정보
// ──────────────────────────────────────────────────────────────

export const A23_TRANSFER_PRICE = 1_320_000_000;
export const A23_LAND_AREA = 65.49;         // 대지면적 (㎡)

// ──────────────────────────────────────────────────────────────
// 공동주택가격 (공시가격)
// ──────────────────────────────────────────────────────────────

/** P_F: 최초고시(1993-02-01) 공동주택가격 */
export const A23_FIRST_DISCLOSURE_HOUSING_PRICE = 280_000_000;
/** P_T: 양도시(2022-04-29) 공동주택가격 */
export const A23_TRANSFER_HOUSING_PRICE = 1_525_000_000;

// ──────────────────────────────────────────────────────────────
// 3시점 기준시가 (역산 fitting — 테스트 전용)
// ──────────────────────────────────────────────────────────────

/** 취득시(1992) 개별공시지가 (원/㎡) */
export const A23_LAND_SQM_AT_ACQ = 600_000;
/**
 * 취득시(1992) 건물 기준시가 (원) — 역산 fitting값
 *   Sum_A = 39,294,000 + 243,745,674 = 283,039,674 = P_A_est
 *   → floor(P_F × Sum_A / Sum_F) = floor(280M × 283,039,674 / 280M) = 283,039,674
 */
export const A23_BLDG_STD_AT_ACQ = 243_745_674;

/** 최초공시일(1993) 개별공시지가 (원/㎡) — 1992년과 동일 */
export const A23_LAND_SQM_AT_FIRST = 600_000;
/**
 * 최초공시일(1993) 건물 기준시가 (원) — 역산 fitting값
 *   Sum_F = 39,294,000 + 240,706,000 = 280,000,000 = P_F
 */
export const A23_BLDG_STD_AT_FIRST = 240_706_000;

/** 양도시(2022) 개별공시지가 (원/㎡) */
export const A23_LAND_SQM_AT_TRANSFER = 5_930_000;
/** 양도시(2022) 건물 기준시가 (원) — 토지/건물 안분에만 영향, 총 환산취득가 무관 */
export const A23_BLDG_STD_AT_TRANSFER = 100_000_000;

// ──────────────────────────────────────────────────────────────
// PreHousingDisclosureInput 객체
// ──────────────────────────────────────────────────────────────

export const A23_PHD_INPUT: PreHousingDisclosureInput = {
  firstDisclosureDate:               new Date("1993-02-01"),
  firstDisclosureHousingPrice:       A23_FIRST_DISCLOSURE_HOUSING_PRICE,
  landArea:                          A23_LAND_AREA,
  landPricePerSqmAtAcquisition:      A23_LAND_SQM_AT_ACQ,
  buildingStdPriceAtAcquisition:     A23_BLDG_STD_AT_ACQ,
  landPricePerSqmAtFirstDisclosure:  A23_LAND_SQM_AT_FIRST,
  buildingStdPriceAtFirstDisclosure: A23_BLDG_STD_AT_FIRST,
  transferHousingPrice:              A23_TRANSFER_HOUSING_PRICE,
  landPricePerSqmAtTransfer:         A23_LAND_SQM_AT_TRANSFER,
  buildingStdPriceAtTransfer:        A23_BLDG_STD_AT_TRANSFER,
};

// ──────────────────────────────────────────────────────────────
// 중간 계산값 (예제 역산 검증 완료)
// ──────────────────────────────────────────────────────────────

/** Sum_A = 600,000 × 65.49 + 243,745,674 = 283,039,674 */
export const A23_SUM_A = 283_039_674;
/** Sum_F = 600,000 × 65.49 + 240,706,000 = 280,000,000 = P_F */
export const A23_SUM_F = 280_000_000;
/** Sum_T = 5,930,000 × 65.49 + 100,000,000 = 488,353,700 */
export const A23_SUM_T = 488_353_700;

/**
 * P_A_est = floor(P_F × Sum_A / Sum_F)
 *         = floor(280,000,000 × 283,039,674 / 280,000,000)
 *         = 283,039,674
 */
export const A23_P_A_EST = 283_039_674;

/**
 * 총 환산취득가액 = floor(totalTransfer × P_A_est / P_T)
 *                = floor(1,320,000,000 × 283,039,674 / 1,525,000,000)
 *                = 244,991,717 (예제 검증값)
 */
export const A23_TOTAL_EST_ACQ = 244_991_717;

/**
 * 개산공제 = floor(P_A_est × 3%) (소령 §163⑥)
 *          = floor(283,039,674 × 0.03)
 *          = 8,491,190 (예제 검증값)
 */
export const A23_LUMP_DEDUCTION = 8_491_190;

// ──────────────────────────────────────────────────────────────
// 최종 세액 (예제 검증값)
// ──────────────────────────────────────────────────────────────

/** 전체 양도차익 = 1,320,000,000 - 244,991,717 - 8,491,190 */
export const A23_TOTAL_GAIN = 1_066_517_093;

/** 12억 초과 비율 = (1,320M - 1,200M) / 1,320M = 120M / 1,320M */
export const A23_HIGH_PRICE_RATIO_NUM = 120_000_000;
export const A23_HIGH_PRICE_RATIO_DEN = 1_320_000_000;

/** 과세대상 양도차익 = floor(1,066,517,093 × 120/1,320) = 96,956,099 */
export const A23_TAXABLE_GAIN = 96_956_099;

/** 비과세 양도차익 = 1,066,517,093 - 96,956,099 */
export const A23_NON_TAXABLE_GAIN = 969_560_994;

/** 장기보유특별공제 (표1, 보유 31년 → 30% 상한) = floor(96,956,099 × 30%) */
export const A23_LTHD = 29_086_829;
export const A23_LTHD_RATE = 0.30;

/** 양도소득금액 = 96,956,099 - 29,086,829 */
export const A23_INCOME = 67_869_270;

/** 양도소득기본공제 */
export const A23_BASIC_DED = 2_500_000;

/** 과세표준 = 67,869,270 - 2,500,000 */
export const A23_TAX_BASE = 65_369_270;

/** 산출세액 = 65,369,270 × 24% - 5,760,000(누진공제) = 9,928,624 */
export const A23_CALCULATED_TAX = 9_928_624;
