/**
 * 6대 세금 타입 정의
 */
export const TAX_TYPES = [
  "transfer",
  "inheritance",
  "gift",
  "acquisition",
  "property",
  "comprehensive_property",
] as const;

export type TaxType = (typeof TAX_TYPES)[number];

/**
 * 세율 카테고리
 */
export const RATE_CATEGORIES = [
  "progressive_rate",
  "deduction",
  "surcharge",
  "special",
  "fair_market_ratio",
] as const;

export type RateCategory = (typeof RATE_CATEGORIES)[number];

/**
 * TaxRateMap key 형식: `${tax_type}:${category}:${sub_category}`
 */
export type TaxRateKey = `${TaxType}:${RateCategory}:${string}`;

/**
 * 누진세율 구간
 */
export interface TaxBracket {
  min: number;
  max: number | null;
  rate: number;
  deduction: number;
}

/**
 * DB에서 로드한 세율 데이터 맵
 */
export type TaxRateMap = Map<TaxRateKey, TaxRateRecord>;

export interface TaxRateRecord {
  id: string;
  taxType: TaxType;
  category: RateCategory;
  subCategory: string;
  effectiveDate: string;
  rateTable: unknown;
  deductionRules: unknown;
  specialRules: unknown;
}
