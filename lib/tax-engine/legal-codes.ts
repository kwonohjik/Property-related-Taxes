/**
 * 세금 관련 법령 조문 상수 — barrel 파일
 *
 * 실제 상수는 세목별 모듈에 위치:
 *   - ./legal-codes/transfer         — NBL, NBL_REVENUE_THRESHOLDS, TRANSFER, MULTI_HOUSE
 *   - ./legal-codes/acquisition      — ACQUISITION, ACQUISITION_CONST
 *   - ./legal-codes/property         — PROPERTY_EXEMPT, PROPERTY, PROPERTY_CONST, PROPERTY_CAL, PROPERTY_SEPARATE, PROPERTY_SEPARATE_CONST
 *   - ./legal-codes/comprehensive    — COMPREHENSIVE*, COMPREHENSIVE_LAND*, COMPREHENSIVE_EXCL*
 *   - ./legal-codes/inheritance-gift — INH, GIFT, VALUATION, EXEMPTION, TAX_CREDIT
 *   - ./legal-codes/common           — PENALTY, PENALTY_CONST (국세기본법 공통)
 *
 * 하위 호환: 기존 `import { TRANSFER, NBL, ... } from "@/lib/tax-engine/legal-codes"` 그대로 작동.
 * 세법 개정 시 해당 세목 파일만 수정하면 된다.
 */

export * from "./legal-codes/transfer";
export * from "./legal-codes/acquisition";
export * from "./legal-codes/property";
export * from "./legal-codes/comprehensive";
export * from "./legal-codes/inheritance-gift";
export * from "./legal-codes/common";
