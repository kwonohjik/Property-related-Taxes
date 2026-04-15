export enum TaxErrorCode {
  TAX_RATE_NOT_FOUND = "TAX_RATE_NOT_FOUND",
  INVALID_INPUT = "INVALID_INPUT",
  INVALID_DATE = "INVALID_DATE",
  CALCULATION_OVERFLOW = "CALCULATION_OVERFLOW",
  RATE_SCHEMA_MISMATCH = "RATE_SCHEMA_MISMATCH",
  PROPERTY_TAX_REQUIRED = "PROPERTY_TAX_REQUIRED",

  // 상속·증여세 전용 에러 코드 (W1-D1)
  /** 평가기준일이 상속개시일/증여일과 불일치 */
  VALUATION_DATE_MISMATCH = "VALUATION_DATE_MISMATCH",
  /** 시가 자료 부재 (보충적 평가로 fallback 필요) */
  MARKET_VALUE_UNAVAILABLE = "MARKET_VALUE_UNAVAILABLE",
  /** 비상장주식 평가 데이터 부족 (순자산·순손익 누락) */
  UNLISTED_STOCK_DATA_MISSING = "UNLISTED_STOCK_DATA_MISSING",
  /** 인적공제 대상자 정보 누락·중복 */
  PERSONAL_DEDUCTION_INVALID = "PERSONAL_DEDUCTION_INVALID",
  /** §24 종합한도 초과 */
  DEDUCTION_LIMIT_EXCEEDED = "DEDUCTION_LIMIT_EXCEEDED",
  /** 배우자 공제 법정상속분 산정 실패 */
  SPOUSE_SHARE_CALC_FAILED = "SPOUSE_SHARE_CALC_FAILED",
  /** 10년 이내 증여재산 합산 데이터 불일치 */
  PRIOR_GIFT_AGGREGATION_FAILED = "PRIOR_GIFT_AGGREGATION_FAILED",
  /** 단기재상속 공제율 산정 실패 (경과연수 범위 초과) */
  SHORT_TERM_REINHERIT_INVALID = "SHORT_TERM_REINHERIT_INVALID",
  /** 외국납부세액 한도 계산 실패 */
  FOREIGN_TAX_LIMIT_FAILED = "FOREIGN_TAX_LIMIT_FAILED",
  /** 비과세·과세가액 불산입 요건 불충족 */
  EXEMPTION_REQUIREMENT_FAILED = "EXEMPTION_REQUIREMENT_FAILED",
  /** 조특법 과세특례 요건 불충족 (창업자금·가업승계) */
  SPECIAL_TREATMENT_INVALID = "SPECIAL_TREATMENT_INVALID",
  /** 세대생략 할증 대상자 판정 실패 */
  GENERATION_SKIP_INVALID = "GENERATION_SKIP_INVALID",
}

export class TaxCalculationError extends Error {
  constructor(
    public readonly code: TaxErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "TaxCalculationError";
  }
}

export class TaxRateNotFoundError extends TaxCalculationError {
  constructor(message: string) {
    super(TaxErrorCode.TAX_RATE_NOT_FOUND, message);
    this.name = "TaxRateNotFoundError";
  }
}

export class TaxRateValidationError extends TaxCalculationError {
  constructor(message: string) {
    super(TaxErrorCode.RATE_SCHEMA_MISMATCH, message);
    this.name = "TaxRateValidationError";
  }
}
