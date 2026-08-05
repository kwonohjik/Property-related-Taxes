/**
 * 세금 관련 법령 조문 상수 — barrel 파일
 *
 * 실제 상수는 세목별 모듈에 위치:
 *   - ./legal-codes/transfer         — TRANSFER (소득세법 §89~§104). 아래 둘을 `export *`로 재수출
 *   - ./legal-codes/transfer-nbl     — NBL, NBL_REVENUE_THRESHOLDS, ESTIMATED_DEDUCTION_RATE
 *   - ./legal-codes/transfer-house   — MULTI_HOUSE, INHERITED_HOUSE, TRANSFER_RENTAL_HOUSING,
 *                                      TRANSFER_REDUCTION_ARTICLE, REDEVELOPMENT, LTHD_*
 *   - ./legal-codes/acquisition      — ACQUISITION, ACQUISITION_CONST
 *   - ./legal-codes/property         — PROPERTY_EXEMPT, PROPERTY, PROPERTY_CONST, PROPERTY_CAL, PROPERTY_SEPARATE, PROPERTY_SEPARATE_CONST
 *   - ./legal-codes/comprehensive    — COMPREHENSIVE*, COMPREHENSIVE_LAND*, COMPREHENSIVE_EXCL*
 *   - ./legal-codes/inheritance-gift — INH, GIFT, VALUATION, EXEMPTION, TAX_CREDIT
 *   - ./legal-codes/common           — PENALTY, PENALTY_CONST (국세기본법 공통)
 *   - ./legal-codes/building-standard-price — BUILDING_STANDARD_PRICE, BUILDING_STD_PRICE_LEGAL_BASIS_*
 *   - ./legal-codes/income-tax            — INCOME_TAX (소득세법 원천징수 조문)
 *   - ./legal-codes/local-tax             — LOCAL_TAX (지방세법 특별징수 조문)
 *
 * 하위 호환: 기존 `import { TRANSFER, NBL, ... } from "@/lib/tax-engine/legal-codes"` 그대로 작동.
 * 세법 개정 시 해당 세목 파일만 수정하면 된다.
 */

export * from "./legal-codes/transfer";
export * from "./legal-codes/surcharge-transition";
export * from "./legal-codes/acquisition";
export * from "./legal-codes/property";
export * from "./legal-codes/comprehensive";
export * from "./legal-codes/inheritance-gift";
export * from "./legal-codes/common";
export * from "./legal-codes/burdened-gift";
export * from "./legal-codes/stock";
export * from "./legal-codes/building-standard-price";
export * from "./legal-codes/income-tax";
export * from "./legal-codes/local-tax";
