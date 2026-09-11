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
  /** 나. 임대부동산 (총액). 사택 단서 제외분은 rentedRealEstateExclusion으로 차감 */
  rentedRealEstate?: number;
  /** 다. 임직원 외 대여금 (총액). 학자금·전세금 단서 제외분은 externalLoansExclusion으로 차감 */
  externalLoans?: number;
  /** 라. 과다보유현금 (5년 평균 초과분) — 직접입력 모드. currentCash·cashByYearEnd 입력 시 자동산정 우선 */
  excessCash?: number;
  /** 마. 영업무관 금융상품 */
  nonOperatingFinancial?: number;

  // ─ 라목 과다현금 자동산정 (상증령 §15⑤2호 라목 — PR-3-b) ─
  /**
   * 상속개시일 현재 보유현금 (요구불예금 + 취득일부터 만기 3개월 이내 금융상품 포함).
   * cashByYearEnd와 함께 입력 시 과다현금 = max(0, currentCash − 5년평균 × 비율) 자동산정.
   */
  currentCash?: number;
  /**
   * 직전 5개 사업연도 말 현금보유액 (평균 산정용, 1~5개). 비율은 상속개시일 시기별
   * (2025.2.28. 이후 200% / 이전 150%, getExcessCashRatioByDate).
   */
  /**
   * 직전 5개 사업연도 말 현금 — **자리 고정 배열**이다(인덱스 0 = 1년 전).
   *
   * 🔴 미입력 칸은 `null`이다(IG-028·IG-029). 0으로 저장하면 5년 평균의 분모·분자에 그대로
   * 들어가 평균이 과소 산정되고(→ 과다보유현금 과대 → 사업무관자산 과대 → 공제대상 주식가액
   * 과소 → 세액 과대), 화면에는 빈 칸으로 보여 원인을 볼 수 없다. 반대로 «구멍»(sparse hole)을
   * 두면 JSON 직렬화에서 `null`이 되어 Zod가 거절했다 — 그래서 `null`을 **명시 값**으로 쓰고
   * 스키마·엔진 필터가 함께 받아들인다. 「입력한 칸의 평균 사용」이라는 화면 안내와 일치한다.
   */
  cashByYearEnd?: (number | null)[];

  // ─ 나·다목 2025.2.28. 신설 제외 단서 (deathDate ≥ 2025-02-28에만 적용 — PR-3-b) ─
  /** 나목 단서 — 임대부동산 중 임직원 사택(국민주택규모↓ or 기준시가 6억↓ + 5년↑ 무상) 제외분 */
  rentedRealEstateExclusion?: number;
  /** 다목 단서 — 대여금 중 임직원 학자금·6억↓ 주택 전세금 제외분 */
  externalLoansExclusion?: number;
}

/**
 * 사업무관자산 차감 결과 (calcCorporateStockAdjustedValue 반환).
 */
export interface CorporateStockAdjustedResult {
  /** 차감 후 주식가치 = floor(stockValue × businessRatio) */
  adjustedValue: number;
  /** 사업무관자산 합계 (5종 양수만 합산, 자동산정·단서 차감 반영) */
  sumOfNonBusiness: number;
  /** 사업자산 비율 = (totalAssets − sumOfNonBusiness) / totalAssets. totalAssets=0 또는 음수 시 0 */
  ratio: number;
  // ─ PR-3-b 과다현금 자동산정 검증 메타 ─
  /** 적용된 과다현금 (자동산정 또는 직접입력) */
  excessCash: number;
  /** 과다현금 자동산정 여부 (currentCash·cashByYearEnd 입력 시 true) */
  excessCashAuto: boolean;
  /** 5개년 현금 평균 (자동산정 시) */
  excessCashAvg5y?: number;
  /** 적용 초과 비율 (2.0 또는 1.5 — 상속개시일 시기별) */
  excessCashRatio?: number;
}
