/**
 * 개별주택가격 미공시 취득 + 토지/건물 취득일 분리 케이스 fixture
 *
 * Excel 근거: "주택분(환산취득, 토지 건물 취득 시기 상이).xlsx" — 시트 "환산, 공시전"
 * Python 역산으로 검증 완료 (2026-04-27).
 *
 * 시나리오 개요:
 *   - 주택 양도, 양도가액 715,000,000원, 양도일 2023-02-16
 *   - 토지 취득일 2013-06-01, 건물 취득일 2014-09-14 (취득일 분리)
 *   - 취득 당시 개별주택가격 미공시 → 최초 공시일 2015-04-30 사용
 *   - 환산취득가액 방식 (acquisitionMethod === "estimated")
 *   - 일반과세 (2주택, 비조정지역 또는 유예 상태 가정)
 */

import type { PreHousingDisclosureInput } from "@/lib/tax-engine/types/transfer.types";

// ──────────────────────────────────────────────
// 입력 상수
// ──────────────────────────────────────────────

export const PHD_TRANSFER_PRICE = 715_000_000;        // 총 양도가액
export const PHD_LAND_AREA = 212;                     // 토지 면적 (㎡)

/** 취득시 기준시가 구성요소 (2013년 공시지가 기준) */
export const PHD_LAND_SQM_AT_ACQ = 2_360_000;         // 원/㎡
export const PHD_BLDG_STD_AT_ACQ = 220_890_540;        // 건물 기준시가

/** 최초공시일(2015-04-30) 기준시가 구성요소 — 2014년 토지공시지가 사용 (2015-04-30 ≤ 2015-05-31 → prior year) */
export const PHD_LAND_SQM_AT_FIRST = 2_369_000;       // 원/㎡  (2014년)
export const PHD_BLDG_STD_AT_FIRST = 220_725_560;     // 건물 기준시가

/** 양도시(2022년) 기준시가 구성요소 */
export const PHD_LAND_SQM_AT_TRANSFER = 3_486_000;    // 원/㎡
export const PHD_BLDG_STD_AT_TRANSFER = 252_871_000;  // 건물 기준시가

/** 개별주택가격 */
export const PHD_FIRST_DISCLOSURE_HOUSING_PRICE = 486_000_000; // P_F 최초공시
export const PHD_TRANSFER_HOUSING_PRICE = 627_000_000;          // P_T 양도시

/** PreHousingDisclosureInput 객체 */
export const PHD_INPUT: PreHousingDisclosureInput = {
  firstDisclosureDate:            new Date("2015-04-30"),
  firstDisclosureHousingPrice:    PHD_FIRST_DISCLOSURE_HOUSING_PRICE,
  landArea:                       PHD_LAND_AREA,
  landPricePerSqmAtAcquisition:   PHD_LAND_SQM_AT_ACQ,
  buildingStdPriceAtAcquisition:  PHD_BLDG_STD_AT_ACQ,
  landPricePerSqmAtFirstDisclosure: PHD_LAND_SQM_AT_FIRST,
  buildingStdPriceAtFirstDisclosure: PHD_BLDG_STD_AT_FIRST,
  transferHousingPrice:           PHD_TRANSFER_HOUSING_PRICE,
  landPricePerSqmAtTransfer:      PHD_LAND_SQM_AT_TRANSFER,
  buildingStdPriceAtTransfer:     PHD_BLDG_STD_AT_TRANSFER,
};

// ──────────────────────────────────────────────
// 중간 계산값 (Excel 역산 검증 완료)
// ──────────────────────────────────────────────

/** Sum_A = 2,360,000 × 212 + 220,890,540 = 721,210,540 */
export const PHD_SUM_A = 721_210_540;

/** Sum_F = 2,369,000 × 212 + 220,725,560 = 722,953,560 */
export const PHD_SUM_F = 722_953_560;

/** Sum_T = 3,486,000 × 212 + 252,871,000 = 991,903,000 */
export const PHD_SUM_T = 991_903_000;

/** 취득시 토지 기준시가 = 2,360,000 × 212 = 500,320,000 */
export const PHD_LAND_STD_AT_ACQ = 500_320_000;

/** 최초공시일 토지 기준시가 = 2,369,000 × 212 = 502,228,000 */
export const PHD_LAND_STD_AT_FIRST = 502_228_000;

/** 양도시 토지 기준시가 = 3,486,000 × 212 = 739,032,000 */
export const PHD_LAND_STD_AT_TRANSFER = 739_032_000;

/**
 * P_A_est = floor(486,000,000 × 721,210,540 / 722,953,560) = 484,828,268
 * 추정 취득시 개별주택가격
 */
export const PHD_P_A_EST = 484_828_268;

// ──────────────────────────────────────────────
// 주택 공시가액 안분 결과 (Excel 검증 완료)
// ──────────────────────────────────────────────

/** 취득시 토지 성분 = floor(P_A_est × landStdAtAcq / Sum_A) = 336,336,292 */
export const PHD_LAND_HOUSING_AT_ACQ = 336_336_292;
/** 취득시 건물 성분 = P_A_est - landHousingAtAcq = 148,491,976 */
export const PHD_BLDG_HOUSING_AT_ACQ = 148_491_976;

/** 양도시 토지 성분 = floor(P_T × landStdAtTransfer / Sum_T) = 467,155,623 */
export const PHD_LAND_HOUSING_AT_TRANSFER = 467_155_623;
/** 양도시 건물 성분 = P_T - landHousingAtTransfer = 159,844,377 */
export const PHD_BLDG_HOUSING_AT_TRANSFER = 159_844_377;

// ──────────────────────────────────────────────
// 양도가액·취득가액·개산공제 분리 (Excel 검증 완료)
// ──────────────────────────────────────────────

/** 토지 양도가액 = floor(715M × 467,155,623 / 627M) = 532,721,324 */
export const PHD_LAND_TRANSFER_PRICE = 532_721_324;
/** 건물 양도가액 = 715M - 532,721,324 = 182,278,676 */
export const PHD_BLDG_TRANSFER_PRICE = 182_278_676;

/** 총 환산취득가 = floor(715M × P_A_est / P_T) = 552,874,340 */
export const PHD_TOTAL_EST_ACQ = 552_874_340;

/** 토지 환산취득가 = floor(552,874,340 × 336,336,292 / 484,828,268) = 383,541,385 */
export const PHD_LAND_ACQ_PRICE = 383_541_385;
/** 건물 환산취득가 = 552,874,340 - 383,541,385 = 169,332,955 */
export const PHD_BLDG_ACQ_PRICE = 169_332_955;

/** 토지 개산공제 = floor(336,336,292 × 3%) = 10,090,088 */
export const PHD_LAND_LUMP_DED = 10_090_088;
/** 건물 개산공제 = floor(148,491,976 × 3%) = 4,454,759 */
export const PHD_BLDG_LUMP_DED = 4_454_759;

// ──────────────────────────────────────────────
// 양도차익 (필요경비 제외, 개산공제만 포함)
// ──────────────────────────────────────────────

/** 토지 양도차익 = 532,721,324 - 383,541,385 - 10,090,088 = 139,089,851 */
export const PHD_LAND_GAIN = 139_089_851;
/** 건물 양도차익 = 182,278,676 - 169,332,955 - 4,454,759 = 8,490,962 */
export const PHD_BLDG_GAIN = 8_490_962;
/** 총 양도차익 */
export const PHD_TOTAL_GAIN = 147_580_813;

// ──────────────────────────────────────────────
// 장기보유특별공제 (일반 2%/년 기준)
// ──────────────────────────────────────────────

/** 토지 보유연수: 2013-06-01 → 2023-02-16 = 9년 */
export const PHD_LAND_HOLDING_YEARS = 9;
/** 건물 보유연수: 2014-09-14 → 2023-02-16 = 8년 */
export const PHD_BLDG_HOLDING_YEARS = 8;

/** 토지 장특공제율 = 9년 × 2% = 18% */
export const PHD_LAND_LTHD_RATE = 0.18;
/** 건물 장특공제율 = 8년 × 2% = 16% */
export const PHD_BLDG_LTHD_RATE = 0.16;

/** 토지 장특공제 = floor(139,089,851 × 18%) = 25,036,173 */
export const PHD_LAND_LTHD = 25_036_173;
/** 건물 장특공제 = floor(8,490,962 × 16%) = 1,358,553 */
export const PHD_BLDG_LTHD = 1_358_553;
/** 총 장특공제 */
export const PHD_TOTAL_LTHD = 26_394_726;

// ──────────────────────────────────────────────
// 최종 세액
// ──────────────────────────────────────────────

/** 양도소득금액 = 147,580,813 - 26,394,726 = 121,186,087 */
export const PHD_INCOME = 121_186_087;
/** 기본공제 = 2,500,000 */
export const PHD_BASIC_DED = 2_500_000;
/** 과세표준 = 118,686,087 */
export const PHD_TAX_BASE = 118_686_087;
/** 산출세액 = 26,100,130 (누진세율 적용, Excel 근거) */
export const PHD_CALCULATED_TAX = 26_100_130;
