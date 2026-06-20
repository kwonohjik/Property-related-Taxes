/**
 * 양도소득세 역사 세율 시딩 (Historical)
 *
 * 목적: 2023년 이전 양도일에 대한 세율 매칭 지원.
 *   preloadTaxRates(targetDate)는 effective_date <= targetDate 중 최신 row를 반환.
 *   현행 시드가 2023-01-01 이상만 등록되어 있어 과거 양도 케이스에서 TaxRateNotFoundError 발생.
 *
 * 실행: npm run seed:tax-rates:historical  (또는 npm run seed:tax-rates 로 순차 실행)
 * 멱등성: ON CONFLICT DO UPDATE → 반복 실행 가능
 */

import { createClient } from "@supabase/supabase-js";
import {
  progressiveRateSchema,
  surchargeRateSchema,
  surchargeSpecialRulesSchema,
  deductionRulesSchema,
  oneHouseSpecialRulesSchema,
} from "../lib/tax-engine/schemas/rate-table.schema";
import { historicalSeeds } from "../lib/tax-engine/data/transfer-rate-seed-historical";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("환경변수 미설정: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);


// ============================================================
// 검증 함수
// ============================================================

function validateSeed(seed: (typeof historicalSeeds)[number], index: number): void {
  if (seed.rate_table && seed.category === "progressive_rate") {
    const result = progressiveRateSchema.safeParse(seed.rate_table);
    if (!result.success) {
      throw new Error(`[${index}] progressive_rate 검증 실패: ${result.error.message}`);
    }
  }

  if (seed.rate_table && seed.category === "surcharge") {
    const result = surchargeRateSchema.safeParse(seed.rate_table);
    if (!result.success) {
      throw new Error(`[${index}] surcharge rate_table 검증 실패: ${result.error.message}`);
    }
  }

  if (seed.deduction_rules && seed.category === "deduction") {
    const result = deductionRulesSchema.safeParse(seed.deduction_rules);
    if (!result.success) {
      throw new Error(`[${index}] deduction_rules 검증 실패: ${result.error.message}`);
    }
  }

  if (seed.special_rules && seed.category === "surcharge") {
    const result = surchargeSpecialRulesSchema.safeParse(seed.special_rules);
    if (!result.success) {
      throw new Error(`[${index}] surcharge special_rules 검증 실패: ${result.error.message}`);
    }
  }

  if (seed.special_rules && seed.sub_category === "one_house_exemption") {
    const result = oneHouseSpecialRulesSchema.safeParse(seed.special_rules);
    if (!result.success) {
      throw new Error(`[${index}] one_house_exemption 검증 실패: ${result.error.message}`);
    }
  }
}

// ============================================================
// 시딩 실행
// ============================================================

async function seedHistoricalRates(): Promise<void> {
  console.log("=== 양도소득세 역사 세율 시딩 시작 ===");

  for (let i = 0; i < historicalSeeds.length; i++) {
    const seed = historicalSeeds[i];
    const label = `[${i + 1}/${historicalSeeds.length}] ${seed.tax_type}:${seed.category}:${seed.sub_category} (${seed.effective_date})`;

    try {
      validateSeed(seed, i + 1);
    } catch (err) {
      console.error(`✗ 검증 실패 ${label}`, err);
      throw err;
    }

    const { error } = await supabaseAdmin.from("tax_rates").upsert(
      {
        tax_type: seed.tax_type,
        category: seed.category,
        sub_category: seed.sub_category,
        effective_date: seed.effective_date,
        rate_table: seed.rate_table ?? null,
        deduction_rules: seed.deduction_rules ?? null,
        special_rules: seed.special_rules ?? null,
        is_active: seed.is_active,
      },
      {
        onConflict: "tax_type,category,sub_category,effective_date",
      },
    );

    if (error) {
      console.error(`✗ 저장 실패 ${label}:`, error.message);
      throw new Error(`시딩 실패: ${error.message}`);
    }

    console.log(`✓ ${label}`);
  }

  console.log(`\n=== 역사 세율 시딩 완료 (${historicalSeeds.length}건) ===`);
}

seedHistoricalRates().catch((err) => {
  console.error("시딩 중 오류:", err);
  process.exit(1);
});
