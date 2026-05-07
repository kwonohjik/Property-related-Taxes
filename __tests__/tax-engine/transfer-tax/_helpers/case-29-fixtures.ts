/**
 * 사례 29 fixtures — 상업용건물·오피스텔 환산취득가 (호별고시 전 취득)
 *
 * 법령: 소득세법 시행령 §164⑧·§176조의2②2호·§163⑥
 * 참조: 양도코리아 PDF 사례 29 (p.504), 양도소득세 계산-오피스텔.xlsx
 *
 * ── 핵심 anchor 수치 역산 ──
 * 아래 입력값은 다음 anchor를 동시에 재현하도록 역산됨:
 *   환산취득가합계 135,155,041 / 개산공제 3,588,219 / 양도차익 401,256,740
 *
 * 개산공제 = floor(취득시 환산기준시가(P_A) × 3%)  — §163⑥ '취득당시의 기준시가 × 3%'
 * P_A = INT(최초고시 호별총액 × Sum_A / Sum_F) = 119,607,326
 * Sum_A = 취득시 기준시가합 = 개공지_취득 × 12.57 + 건물기준_취득(총액) = 119,607,326
 * Sum_F = 최초고시시 기준시가합 = 11,060,632 × 12.57 + 건물기준_최초(총액) = 208,560,000
 * (Sum_F = hobelF = C2005 × 69.52 = 3,000,000 × 69.52 이므로 P_A = Sum_A 성립)
 *
 * ※ 건물 기준시가는 사용자가 ㎡당 단가 × 연면적 보정계수를 미리 곱해 입력하는 총액 (원).
 * C2022 = 6,874,000원/㎡ → hobelT = 6,874,000 × 69.52 = 477,880,480
 * 환산취득가합계 = INT(540M × 119,607,326 / 477,880,480) = 135,155,041 ✓
 *
 * 양도연도 2022 적용 소법 §55 세율: 1.5~3억 38%, 누진공제 19,940,000
 * 지방세법 §103조의3 세율: 1.5~3억 3.8%, 누진공제 1,994,000
 */

import type {
  CommercialBuildingValuationInput,
} from "@/lib/tax-engine/commercial-building-valuation";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput } from "../../_helpers/mock-rates";

// ============================================================
// 사례 29 기본 상수
// ============================================================

/** 양도일 (2022-02-16) */
export const TRANSFER_DATE = new Date("2022-02-16");
/** 취득일 (2000-12-07) — 호별고시 전 취득 (< 2005-01-01) */
export const ACQUISITION_DATE = new Date("2000-12-07");
/** 양도가액 */
export const TRANSFER_PRICE = 540_000_000;

// ── 면적 ──
export const EXCLUSIVE_AREA  = 36;      // 전용면적 (㎡)
export const COMMON_AREA     = 33.52;   // 공유면적 (㎡)
export const FLOOR_AREA_TOTAL = 69.52;  // 연면적 = 전용 + 공유 (㎡)
export const LAND_AREA       = 12.57;   // 대지면적 (㎡)

// ── 호별 ㎡당 고시가 ──
/** 양도시(2022) ㎡당 호별고시가 */
export const UNIT_PRICE_AT_TRANSFER   = 6_874_000;  // 원/㎡ (역산값)
/** 최초고시(2005) ㎡당 호별고시가 */
export const UNIT_PRICE_AT_FIRST      = 3_000_000;  // 원/㎡ (역산값)

// ── 건물 기준시가 (총액, 원) — 사용자 외부 곱셈 입력 ──
// (실무: 사용자가 ㎡당 단가 × 연면적 보정계수를 직접 곱해 정수 입력. 본 fixture는 종전 ㎡당값 × 69.52를 그대로 사용해 anchor 등가성 보존)
/** 취득시(2000) 건물 기준시가 — 총액 = 1,001,189 × 69.52 */
export const BUILDING_STD_AT_ACQ     = 69_602_659.28;
/** 최초고시시(2005) 건물 기준시가 — 총액 = 1,000,113 × 69.52 */
export const BUILDING_STD_AT_FIRST   = 69_527_855.76;

// ── 개별공시지가 ──
/** 취득시(2000) 개별공시지가 */
export const LAND_PRICE_AT_ACQ       = 3_978_096;  // 원/㎡ (역산값)
/** 최초고시시(2005) 개별공시지가 */
export const LAND_PRICE_AT_FIRST     = 11_060_632; // 원/㎡ (역산값)

// ============================================================
// 계산 anchor 상수 (모두 법령 기준 정확값)
// ============================================================

/** 양도시 호별총액 = C2022 × 69.52 */
export const UNIT_TOTAL_AT_TRANSFER = 477_880_480;   // 6,874,000 × 69.52

/** 최초고시 호별총액 = C2005 × 69.52 */
export const UNIT_TOTAL_AT_FIRST = 208_560_000;       // 3,000,000 × 69.52

/** 취득시 기준시가합(Sum_A) */
export const COMBINED_STD_AT_ACQ = 119_607_326;
/** 최초고시시 기준시가합(Sum_F) */
export const COMBINED_STD_AT_FIRST = 208_560_000;

/** 취득시 환산기준시가(P_A) = INT(hobelF × Sum_A / Sum_F) */
export const ESTIMATED_BASIS_AT_ACQ = 119_607_326;

// ── anchor C-01-01 ~ C-01-12 ──
/** C-01-01: 환산취득가 합계 */
export const ESTIMATED_ACQ_TOTAL   = 135_155_041;
/** C-01-02: 개산공제 합계 = floor(P_A × 0.03) */
export const LUMP_SUM_DEDUCTION    = 3_588_219;
/** C-01-03: 양도차익 = 540M − 환산취득가 − 개산공제 */
export const CAPITAL_GAIN          = 401_256_740;
/** C-01-04: 장특공률 (MIN(15,21)×2% = 30%) */
export const LONG_TERM_RATE        = 0.30;
/** C-01-05: 장특공 = floor(401,256,740 × 0.30) */
export const LONG_TERM_DEDUCTION   = 120_377_022;
/** C-01-06: 양도소득금액 = 양도차익 − 장특공 */
export const INCOME_AMOUNT         = 280_879_718;
/** C-01-07: 과세표준 = 양도소득금액 − 기본공제 2,500,000 (절사 규정 없음) */
export const TAX_BASE              = 278_379_718;
/** C-01-08: 산출세액 = floor(278,379,718 × 0.38 − 19,940,000) — 2022 §55 정확 세율 */
export const CALCULATED_TAX        = 85_844_292;
/** C-01-09: 지방소득세 = floor(278,379,718 × 0.038 − 1,994,000) — §103조의3 누진 */
export const LOCAL_INCOME_TAX      = 8_584_429;
/** C-01-10: 총 납부세액 */
export const TOTAL_TAX             = 94_428_721;

/** 취득시 토지 기준시가합 = 개공지_취득 × 대지면적 */
export const LAND_STD_AT_ACQ       = 50_004_666.72;   // 3,978,096 × 12.57 (부동소수점)
/** 취득시 건물 기준시가합 = 건물기준_취득 × 연면적 */
export const BUILDING_STD_AT_ACQ_TOTAL = 69_602_659.28; // 1,001,189 × 69.52 (부동소수점)

/** C-01-11: 환산취득가 토지분 = INT(합계 × 토지기준시가합 / Sum_A) */
export const ESTIMATED_ACQ_LAND    = 56_504_756;
/** C-01-12: 환산취득가 건물분 = 합계 − 토지분 */
export const ESTIMATED_ACQ_BUILDING = 78_650_285;

// ============================================================
// CommercialBuildingValuationInput fixture (C-01)
// ============================================================

export const CB_VALUATION_INPUT_C01: CommercialBuildingValuationInput = {
  isPreDisclosure:               true,
  exclusiveArea:                 EXCLUSIVE_AREA,
  commonArea:                    COMMON_AREA,
  landArea:                      LAND_AREA,
  unitPriceAtTransfer:           UNIT_PRICE_AT_TRANSFER,
  unitPriceAtFirstDisclosure:    UNIT_PRICE_AT_FIRST,
  buildingStdPriceAtAcquisition: BUILDING_STD_AT_ACQ,
  buildingStdPriceAtFirstDisclosure: BUILDING_STD_AT_FIRST,
  landPriceAtAcquisition:        LAND_PRICE_AT_ACQ,
  landPriceAtFirstDisclosure:    LAND_PRICE_AT_FIRST,
};

// ============================================================
// TransferTaxInput fixture (사례 29 전체 계산용)
// ============================================================

export function makeCase29Input(
  overrides: Partial<TransferTaxInput> = {},
): TransferTaxInput {
  return baseTransferInput({
    propertyType:           "commercial_building",
    transferPrice:          TRANSFER_PRICE,
    transferDate:           TRANSFER_DATE,
    acquisitionPrice:       0,
    acquisitionDate:        ACQUISITION_DATE,
    expenses:               0,
    useEstimatedAcquisition: true,
    householdHousingCount:  0,
    residencePeriodMonths:  0,
    isOneHousehold:         false,
    isRegulatedArea:        false,
    wasRegulatedAtAcquisition: false,
    isUnregistered:         false,
    isNonBusinessLand:      false,
    reductions:             [],
    annualBasicDeductionUsed: 0,
    commercialBuildingValuation: CB_VALUATION_INPUT_C01,
    ...overrides,
  });
}

// ============================================================
// 보유기간 경계 테스트용 fixtures (C-04 ~ C-06)
// ============================================================

/**
 * C-04: 보유 14년 → 장특공률 28% (MIN(15,14)×2%)
 * 취득일 2007-03-16 → 기산일 2007-03-17 → 양도일 2022-02-16 = 14년 10개월 30일 → 절사 14년
 */
export const ACQ_DATE_14Y = new Date("2007-03-16");

/**
 * C-05: 보유 정확히 15년 → 장특공률 30% (MIN(15,15)×2%)
 * 취득일 2007-02-15 → 기산일 2007-02-16 → 양도일 2022-02-16 = 정확히 15년
 */
export const ACQ_DATE_15Y_EXACT = new Date("2007-02-15");

/**
 * C-06: 보유 16년 → 장특공률 30% (MIN(15,16)×2% = 상한 동일)
 * 취득일 2006-02-14 → 기산일 2006-02-15 → 양도일 2022-02-16 = 16년 1일 → 절사 16년
 */
export const ACQ_DATE_16Y = new Date("2006-02-14");
