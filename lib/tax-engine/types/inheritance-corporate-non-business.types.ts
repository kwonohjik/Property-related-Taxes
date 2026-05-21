/**
 * 법인 사업무관자산 타입 (상증령 §15⑤2호 + §16⑤2호 공통)
 *
 * KoreanLaw MCP 검증 2026-05-21:
 *   - §15⑤2호 가·나·다·라·마 (가업상속공제 사업무관자산 5종)
 *   - §16⑤2호 법인 영농 주식에 §15⑤2호 준용
 *
 * 산식: adjustedValue = floor(stockValue × (totalAssets − sumOfNonBusiness) / totalAssets)
 * BigInt 정수 연산 — 1조 단위 자산 곱셈 정밀도 보장.
 *
 * 800줄 정책으로 inheritance-gift.types.ts에서 분리 (PR-C F-8, 2026-05-21).
 */

/**
 * 법인 사업무관자산 5종 (시행령 §15⑤2호 가·나·다·라·마).
 *
 * 입력 가이드:
 *   - 양수만 합산 (Math.max(0, v))
 *   - 나·라는 사용자가 단서 차감/5년 평균 산정 후 입력 권장
 *   - 미입력(undefined) 키는 0으로 처리
 */
export interface CorporateNonBusinessAssets {
  /** 가. 비사업용토지 (소득세법 §104조의3) */
  nonBusinessLand?: number;
  /** 나. 임대부동산 (단서: 임직원 국민주택규모 이하 5년 무상임대 제외) — 사용자가 단서 차감 후 입력 */
  rentedRealEstate?: number;
  /** 다. 임직원 외 대여금 */
  externalLoans?: number;
  /** 라. 과다보유현금 (5년 평균 200% 초과분) — 사용자가 5년 평균 산정 후 입력 */
  excessCash?: number;
  /** 마. 영업무관 금융상품 */
  nonOperatingFinancial?: number;
}

/**
 * 사업무관자산 차감 결과 (calcCorporateStockAdjustedValue 반환).
 */
export interface CorporateStockAdjustedResult {
  /** 차감 후 주식가치 = floor(stockValue × businessRatio) */
  adjustedValue: number;
  /** 사업무관자산 합계 (5종 양수만 합산) */
  sumOfNonBusiness: number;
  /** 사업자산 비율 = (totalAssets − sumOfNonBusiness) / totalAssets. totalAssets=0 또는 음수 시 0 */
  ratio: number;
}
