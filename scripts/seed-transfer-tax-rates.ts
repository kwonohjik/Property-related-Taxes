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
} from "../lib/tax-engine/schemas/rate-table.schema";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("환경변수 미설정: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

// service_role 클라이언트 (RLS 우회 — 서버 전용)
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

// ============================================================
// 양도소득세 시딩 데이터 (2023.1.1~ 현행)
// ============================================================

const transferTaxSeeds = [
  // 1. 누진세율 (2023.1.1~ 현행)
  {
    tax_type: "transfer",
    category: "progressive_rate",
    sub_category: "_default",
    effective_date: "2023-01-01",
    rate_table: {
      brackets: [
        { min: 0, max: 14000000, rate: 0.06, deduction: 0 },
        { min: 14000001, max: 50000000, rate: 0.15, deduction: 1260000 },
        { min: 50000001, max: 88000000, rate: 0.24, deduction: 5760000 },
        { min: 88000001, max: 150000000, rate: 0.35, deduction: 15440000 },
        { min: 150000001, max: 300000000, rate: 0.38, deduction: 19940000 },
        { min: 300000001, max: 500000000, rate: 0.40, deduction: 25940000 },
        { min: 500000001, max: 1000000000, rate: 0.42, deduction: 35940000 },
        { min: 1000000001, rate: 0.45, deduction: 65940000 },
      ],
    },
    deduction_rules: null,
    special_rules: null,
    is_active: true,
  },

  // 2. 장기보유특별공제
  {
    tax_type: "transfer",
    category: "deduction",
    sub_category: "long_term_holding",
    effective_date: "2023-01-01",
    rate_table: null,
    deduction_rules: {
      type: "long_term_holding",
      general: { ratePerYear: 0.02, maxRate: 0.30, minHoldingYears: 3 },
      oneHouseSpecial: {
        holdingRatePerYear: 0.04,
        holdingMaxRate: 0.40,
        residenceRatePerYear: 0.04,
        residenceMaxRate: 0.40,
        combinedMaxRate: 0.80,
        minHoldingYears: 3,
      },
      exclusions: ["multi_house_surcharge", "non_business_land", "unregistered"],
    },
    special_rules: null,
    is_active: true,
  },

  // 3. 기본공제 (연 250만원)
  {
    tax_type: "transfer",
    category: "deduction",
    sub_category: "basic",
    effective_date: "2023-01-01",
    rate_table: null,
    deduction_rules: {
      type: "basic_deduction",
      annualLimit: 2500000,
      excludeUnregistered: true,
    },
    special_rules: null,
    is_active: true,
  },

  // 4. 중과세율 (다주택/비사업용 토지/미등기)
  {
    tax_type: "transfer",
    category: "surcharge",
    sub_category: "_default",
    effective_date: "2023-01-01",
    rate_table: {
      multi_house_2: {
        additionalRate: 0.20,
        condition: "regulated_area_2house",
        referenceDate: "transfer_date",
      },
      multi_house_3plus: {
        additionalRate: 0.30,
        condition: "regulated_area_3house_plus",
        referenceDate: "transfer_date",
      },
      non_business_land: { additionalRate: 0.10 },
      unregistered: {
        flatRate: 0.70,
        excludeDeductions: true,
        excludeBasicDeduction: true,
      },
    },
    deduction_rules: null,
    // 다주택 중과세 한시 유예 (2026.05.09까지)
    special_rules: {
      surcharge_suspended: true,
      suspended_types: ["multi_house_2", "multi_house_3plus"],
      suspended_until: "2026-05-09",
      legal_basis: "소득세법 부칙 (2024.1.1 시행)",
    },
    is_active: true,
  },

  // 5. 1세대1주택 비과세 특례
  {
    tax_type: "transfer",
    category: "special",
    sub_category: "one_house_exemption",
    effective_date: "2023-01-01",
    rate_table: null,
    deduction_rules: null,
    special_rules: {
      one_house_exemption: {
        maxExemptPrice: 1200000000, // 12억원 초과분 과세
        minHoldingYears: 2,
        regulatedAreaMinResidenceYears: 2,
        prePolicyDate: "2017-08-03",
        prePolicyExemptResidence: true,
      },
      temporary_two_house: {
        disposalDeadlineYears: 3,
        regulatedAreaDeadlineYears: 2,
        regulatedAreaRelaxDate: "2022-05-10",
        regulatedAreaRelaxDeadlineYears: 3,
      },
    },
    is_active: true,
  },

  // 6. 8년 자경 농지 감면
  {
    tax_type: "transfer",
    category: "deduction",
    sub_category: "self_farming",
    effective_date: "2023-01-01",
    rate_table: null,
    deduction_rules: {
      type: "self_farming",
      maxRate: 1.0,
      maxAmount: 100000000, // 최대 1억원
      periodYears: 5,
      cumulativeMax: 200000000, // 5년간 누계 2억원
      conditions: {
        minFarmingYears: 8,
        requiresProof: true,
        maxResidenceDistance: 30, // km
      },
    },
    special_rules: null,
    is_active: true,
  },
] as const;

// ============================================================
// Zod 검증 함수
// ============================================================

function validateSeed(seed: (typeof transferTaxSeeds)[number], index: number): void {
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

  if (seed.deduction_rules) {
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

  if (seed.special_rules && seed.category === "special") {
    const result = oneHouseSpecialRulesSchema.safeParse(seed.special_rules);
    if (!result.success) {
      throw new Error(`[${index}] special_rules 검증 실패: ${result.error.message}`);
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
