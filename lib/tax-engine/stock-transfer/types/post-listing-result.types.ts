/**
 * 취득 후 상장 환산 결과 타입 (§165⑤) — 800줄 정책으로 stock-transfer.types.ts에서 분리.
 *
 * stock-transfer.types.ts가 import + re-export하므로 기존 import 경로 무변경
 * (`./stock-valuation-post-listing` · `./types/stock-transfer.types` 양쪽 유효).
 */

export type PostListingValuationResult = {
  /** 상장연도 직전 사업연도 1주당 비상장 평가액 (가중평균) */
  listingYearPerShareValue: number;
  /** 취득연도 직전 사업연도 1주당 비상장 평가액 (가중평균) */
  acquisitionYearPerShareValue: number;
  /** 환산비율 = 취득연도 평가 / 상장연도 평가 */
  conversionRatio: number;
  /** 1주당 취득기준시가 = floor(상장일 1개월 종가평균 × 환산비율) */
  finalPerShareValue: number;
  /** 총 환산취득가 = 1주당 × 주식수 */
  totalAcquisitionPrice: number;
  /**
   * 월할 가산 적용 여부 (시행규칙 §81④).
   * PR-2 의미 재정의: "평가액 동일 감지"(PR-1) → "1호 보정 실제 발동" (C-3·C-5만 true).
   */
  monthlyAccrualApplied: boolean;
  /** §81④ 1호 보정 상세 (보정 발동 시만 — 결과 카드 산식 표시용) */
  monthlyAccrualDetail?: {
    /** 전전사업연도 가중평균 평가액 (H-04 재사용, 80% 하한 미적용) */
    prePriorYearPerShareValue: number;
    /** 절상 후 보유월수 m (취득일~상장일, 1개월 미만 절상) */
    holdingMonths: number;
    /** 분모 월수 d (echo) */
    priorBizYearMonths: number;
    /** 보정 상장일 평가액 = floor((직전×d + (직전−전전)×m) / d) — 환산식 새 분모 */
    adjustedListingYearPerShareValue: number;
  };
  appliedRules: string[];
  warnings: string[];

  /**
   * [B-5] 증자·합병 기간 절단 발동 echo (상증령 §52의2②2호 — 결과 카드 표시).
   * 미발동(hasIncrease 무·윈도우 밖·절단 후 0건) 시 undefined. C-3·C-5 안내는 warnings[].
   */
  capitalEventTruncation?: {
    eventDate: string;
    includedDays: number;
    excludedDays: number;
  };

  /** Round 4 H-04 — full/listing_only 모드의 상세 산출 echo */
  detail?: {
    /** 종가 1개월 평균 계산 결과 (full 모드 또는 listing_only 모드) */
    closing?: {
      tradingDays: number;
      sum: number;
      avg: number;
    };
    /** 순손익 계산서 산출 결과 (full = 양 연도, listing_only = 상장연도만) */
    netIncome?: {
      listing: { netIncomeAmount: number; perShareIncome: number; perShareValue: number };
      acquisition?: { netIncomeAmount: number; perShareIncome: number; perShareValue: number };
    };
    /** 순자산 계산서 산출 결과 (full = 양 연도, listing_only = 상장연도만) */
    netAsset?: {
      listing: { netAssetAmount: number; perShareAsset: number };
      acquisition?: { netAssetAmount: number; perShareAsset: number };
    };
    /** 사용된 모드 (디버깅·결과 카드 배지용) */
    mode: "simple" | "listing_only" | "full";
    /** 80% 하한 비적용 명시 — 환산비율 단계 (회귀 보호용 echo) */
    floor80NotApplied: true;
  };
};
