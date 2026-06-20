/**
 * 양도소득세 세율 시딩 스크립트 (Phase 1)
 *
 * 실행: npm run seed:tax-rates
 *
 * 멱등성: ON CONFLICT DO UPDATE → 반복 실행 가능
 * Zod 검증: DB 저장 전 구조 검증 → 잘못된 데이터 차단
 *
 * 환경변수 필수:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  (service_role key — RLS 우회 필요)
 */

import { createClient } from "@supabase/supabase-js";
import {
  progressiveRateSchema,
  deductionRulesSchema,
  surchargeRateSchema,
  surchargeSpecialRulesSchema,
  oneHouseSpecialRulesSchema,
  houseCountExclusionSchema,
  nonBusinessLandJudgmentSchema,
  longTermRentalRuleSetSchema,
  newHousingMatrixSchema,
} from "../lib/tax-engine/schemas/rate-table.schema";
import { transferTaxSeeds } from "../lib/tax-engine/data/transfer-rate-seed";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("환경변수 미설정: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

// service_role 클라이언트 (RLS 우회 — 서버 전용)
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

// 시딩 데이터: lib/tax-engine/data/transfer-rate-seed.ts (단일 소스 — fallback 공용)

// ============================================================
// Zod 검증 함수
// ============================================================

function validateSeed(seed: {
  tax_type: string;
  category: string;
  sub_category: string;
  rate_table: unknown;
  deduction_rules: unknown;
  special_rules: unknown;
}, index: number): void {
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

  // long_term_rental_v2, new_housing_matrix는 별도 스키마로 검증 (discriminated union 외)
  const SPECIAL_DEDUCTION_TYPES = ["long_term_rental_v2", "new_housing_matrix"];
  if (seed.deduction_rules && !SPECIAL_DEDUCTION_TYPES.includes(seed.sub_category)) {
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

  if (seed.special_rules && seed.category === "special" && seed.sub_category === "one_house_exemption") {
    const result = oneHouseSpecialRulesSchema.safeParse(seed.special_rules);
    if (!result.success) {
      throw new Error(`[${index}] special_rules 검증 실패: ${result.error.message}`);
    }
  }

  if (seed.special_rules && seed.sub_category === "house_count_exclusion") {
    const result = houseCountExclusionSchema.safeParse(seed.special_rules);
    if (!result.success) {
      throw new Error(`[${index}] house_count_exclusion 검증 실패: ${result.error.message}`);
    }
  }

  if (seed.special_rules && seed.sub_category === "non_business_land_judgment") {
    const result = nonBusinessLandJudgmentSchema.safeParse(seed.special_rules);
    if (!result.success) {
      throw new Error(`[${index}] non_business_land_judgment 검증 실패: ${result.error.message}`);
    }
  }

  if (seed.deduction_rules && seed.sub_category === "long_term_rental_v2") {
    const result = longTermRentalRuleSetSchema.safeParse(seed.deduction_rules);
    if (!result.success) {
      throw new Error(`[${index}] long_term_rental_v2 검증 실패: ${result.error.message}`);
    }
  }

  if (seed.deduction_rules && seed.sub_category === "new_housing_matrix") {
    const result = newHousingMatrixSchema.safeParse(seed.deduction_rules);
    if (!result.success) {
      throw new Error(`[${index}] new_housing_matrix 검증 실패: ${result.error.message}`);
    }
  }
}

// ============================================================
// 시딩 실행
// ============================================================

async function seedTransferTaxRates(): Promise<void> {
  console.log("=== 양도소득세 세율 시딩 시작 ===");

  for (let i = 0; i < transferTaxSeeds.length; i++) {
    const seed = transferTaxSeeds[i];
    const label = `[${i + 1}/${transferTaxSeeds.length}] ${seed.tax_type}:${seed.category}:${seed.sub_category}`;

    // Zod 검증 게이트 (DB 저장 전)
    try {
      validateSeed(seed, i + 1);
    } catch (err) {
      console.error(`✗ 검증 실패 ${label}`, err);
      throw err;
    }

    // ON CONFLICT DO UPDATE (멱등성)
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

  console.log(`\n=== 시딩 완료 (${transferTaxSeeds.length}건) ===`);
}

// 실행
seedTransferTaxRates().catch((err) => {
  console.error("시딩 중 오류:", err);
  process.exit(1);
});
