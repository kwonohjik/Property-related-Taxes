/**
 * 비사업용 토지(NBL) 관련 폼 타입 선언.
 * calc-wizard-asset.ts 800줄 정책에 따라 분리 (2026-05-11).
 */

/** 비사업용 토지 사업용 사용기간 항목 (폼 문자열 버전) */
export interface NblBusinessUsePeriod {
  startDate: string;
  endDate: string;
  usageType: string;
}

/** 소유자 거주 이력 1건 (NBL 재촌 판정용) */
export interface ResidenceHistoryInput {
  sigunguCode: string;
  sigunguName: string;
  startDate: string;
  endDate: string;
  /** 주민등록 여부 — 임야 재촌 필수 요건 */
  hasResidentRegistration: boolean;
}

/** 부득이한 사유 유예기간 1건 (§168-14①) */
export interface GracePeriodInput {
  type:
    | "inheritance"
    | "legal_restriction"
    | "sale_contract"
    | "construction"
    | "unavoidable"
    | "preparation"
    | "land_replotting";
  startDate: string;
  endDate: string;
  description: string;
}

/** 다른 보유 주택 항목 (폼 문자열 버전) */
export interface HouseEntry {
  id: string;
  region: "capital" | "non_capital";
  acquisitionDate: string;
  officialPrice: string;
  isInherited: boolean;
  isLongTermRental: boolean;
  isApartment: boolean;
  isOfficetel: boolean;
  isUnsoldHousing: boolean;
}
