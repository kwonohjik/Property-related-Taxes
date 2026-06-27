/**
 * 가상화폐(가상자산) §60② 평가 보충 필드 mixin.
 *
 * EstateItemCryptoFields 는 EstateItem 인터페이스가 다중 상속으로 흡수.
 * 법령: 상속세및증여세법 §65② → 시행령 §60② (특금법 §2③ 가상자산)
 *   - 1호(국세청장 고시 사업장): 평가기준일 전·이후 각 1개월 동안 일평균가액의 평균액
 *   - 2호(그 밖): 거래일 일평균가액·종료시각 시세가액 등 합리적 가액
 *   - 적용시기: 2022.1.1. 이후 상속개시·증여분 (부칙 2020.12.22 1단서)
 *
 * 분리 사유: inheritance-gift-estate.types.ts 800줄 초과 방지 (2026-06-27).
 */

/** 가상화폐(가상자산) §60② 보충평가 옵션 필드 mixin (EstateItem의 다중 상속 대상) */
export interface EstateItemCryptoFields {
  // ===== 가상화폐(가상자산) §60② 보충평가 =====
  /**
   * 가상자산 평가 모드.
   * - "direct": 1코인당 평가단가 직접입력 (cryptoUnitPrice × 수량). 2호·시가 또는 사용자 산정값.
   * - "timeseries": 거래일별 일평균가액의 평균액(P_d) 배열 → 엔진이 단순평균(§60②1호 2단계) 산정.
   * undefined → "direct" 처리 (display/API/validate 3중 fallback). 선례 savingsValuationMode 동일.
   */
  cryptoValuationMode?: "direct" | "timeseries";
  /** 보유 수량 (소수 8자리, 1 satoshi = 0.00000001 단위 허용). */
  cryptoQuantity?: number;
  /** direct 모드: 1코인당 평가단가 (원). */
  cryptoUnitPrice?: number;
  /**
   * timeseries 모드: 거래일별 "일평균가액의 평균액" P_d 배열 (원).
   * 각 원소 = 그 거래일에 코인을 거래하는 고시사업장들의 일평균가액 단순평균(§60②1호 1단계 — 사용자 산정).
   * 엔진 computeCryptoUnitPrice가 이 배열의 단순평균(2단계)을 산정. ⚠️ Map 금지 — number[] (JSON 보존).
   */
  cryptoDailyPrices?: number[];
  /**
   * 1호(국세청 고시사업장 거래)=true / 2호(그 밖)=false.
   * undefined → true 처리 (display fallback). method 산정에 사용(crypto_statutory vs market_value).
   */
  cryptoIsListedProvider?: boolean;
  /**
   * [파생 echo] 엔진(injectCryptoUnitPriceIfTimeseries)이 산정한 1코인당 평가단가 (timeseries 2단계 결과, 원).
   * UI 산출근거 표시·검증 일관용. 선례 savingsAccruedInterest echo 패턴.
   */
  cryptoUnitPriceComputed?: number;
}
