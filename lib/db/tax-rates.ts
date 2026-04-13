import { createClient } from "@/lib/supabase/server";
import type { TaxRateKey, TaxRateRecord, TaxType } from "@/lib/tax-engine/types";
import { TaxRateNotFoundError } from "@/lib/tax-engine/tax-errors";

// key: `${tax_type}:${category}:${sub_category}`
export type TaxRatesMap = Map<TaxRateKey, TaxRateRecord>;

// Supabase DB 응답 행 형식 (snake_case)
interface TaxRateRow {
  id: string;
  tax_type: string;
  category: string;
  sub_category: string;
  effective_date: string;
  rate_table: unknown;
  deduction_rules: unknown;
  special_rules: unknown;
  is_active: boolean;
  created_at: string;
}

function rowToRecord(row: TaxRateRow): TaxRateRecord {
  return {
    id: row.id,
    taxType: row.tax_type as TaxType,
    category: row.category as TaxRateRecord["category"],
    subCategory: row.sub_category,
    effectiveDate: row.effective_date,
    rateTable: row.rate_table,
    deductionRules: row.deduction_rules,
    specialRules: row.special_rules,
  };
}

/**
 * 복수 세금 타입의 세율을 1회 RPC 호출로 일괄 로드.
 * tax_type+category+sub_category별 targetDate 이하 가장 최근 세율 반환.
 *
 * @example
 * const rates = await preloadTaxRates(['transfer'], new Date());
 * const progressive = getRate(rates, 'transfer', 'progressive_rate');
 */
export async function preloadTaxRates(
  taxTypes: TaxType[],
  targetDate: Date,
): Promise<TaxRatesMap> {
  const supabase = await createClient();
  const dateStr = targetDate.toISOString().split("T")[0];

  const { data, error } = await supabase.rpc("preload_tax_rates", {
    p_tax_types: taxTypes,
    p_target_date: dateStr,
  });

  if (error) {
    throw new TaxRateNotFoundError(
      `세율 로드 실패 (tax_types=${taxTypes.join(",")}, date=${dateStr}): ${error.message}`,
    );
  }

  const result: TaxRatesMap = new Map();
  for (const row of (data as TaxRateRow[]) ?? []) {
    const key = `${row.tax_type}:${row.category}:${row.sub_category}` as TaxRateKey;
    result.set(key, rowToRecord(row));
  }

  return result;
}

/**
 * TaxRatesMap에서 특정 세율 레코드를 조회.
 * sub_category 미지정 시 '_default' 사용.
 */
export function getRate(
  map: TaxRatesMap,
  taxType: TaxType,
  category: TaxRateRecord["category"],
  subCategory: string = "_default",
): TaxRateRecord | undefined {
  const key = `${taxType}:${category}:${subCategory}` as TaxRateKey;
  return map.get(key);
}

/**
 * TaxRatesMap에서 동일 category의 모든 sub_category 레코드 조회.
 * 예: 양도세의 모든 deduction 규칙 목록
 */
export function getRatesByCategory(
  map: TaxRatesMap,
  taxType: TaxType,
  category: TaxRateRecord["category"],
): TaxRateRecord[] {
  const prefix = `${taxType}:${category}:`;
  return Array.from(map.entries())
    .filter(([key]) => key.startsWith(prefix))
    .map(([, value]) => value);
}
