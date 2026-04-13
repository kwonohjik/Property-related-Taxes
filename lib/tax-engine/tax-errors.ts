export enum TaxErrorCode {
  TAX_RATE_NOT_FOUND = "TAX_RATE_NOT_FOUND",
  INVALID_INPUT = "INVALID_INPUT",
  INVALID_DATE = "INVALID_DATE",
  CALCULATION_OVERFLOW = "CALCULATION_OVERFLOW",
  RATE_SCHEMA_MISMATCH = "RATE_SCHEMA_MISMATCH",
  PROPERTY_TAX_REQUIRED = "PROPERTY_TAX_REQUIRED",
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
