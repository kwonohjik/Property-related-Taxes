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
  /**
   * [표시 전용 echo] 「제4항에 따른 평가액」 산출 근거 — 결과 카드가 가중평균 산식을
   * 라벨·변수값으로 펼쳐 보이기 위해 필요하다(세액 산정에는 쓰이지 않는다).
   *
   * 가중치는 연혁(§165④ 개정)·§94①4다목 반전이 반영된 **실제 적용값**이므로
   * 화면에서 3/5·2/5를 하드코딩하지 말고 이 값을 쓴다.
   */
  weightedBasis?: {
    niWeight: number;
    naWeight: number;
    listing: { netIncomeValue: number; netAssetValue: number; weightedRaw: number };
    acquisition: { netIncomeValue: number; netAssetValue: number; weightedRaw: number };
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
    /**
     * §165④1 단서(80% 하한) 발동 여부 — 환산식 **분모(상장연도)·분자(취득연도) 각각**.
     *
     * 🔴 2026-08-10: 종전 `floor80NotApplied: true`(리터럴)를 대체한다. §165⑤ 본문이
     *    분자·분모를 「제4항에 따른 평가액」이라 부르고 하한은 그 제4항 제1호 **단서**이므로
     *    「미적용」을 고정하던 종전 echo는 사실과 어긋났다.
     *
     * ⚠️ **비율에는 하한이 걸리지 않는다** — 환산비율이 0.8 미만이어도 0.8로 올리지 않는다.
     */
    floor80Applied: { listing: boolean; acquisition: boolean };
  };
};
