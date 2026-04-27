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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("환경변수 미설정: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

// ============================================================
// 누진세율 구간별 역사 데이터 (소득세법 §104①1호)
// ============================================================

// 공통 1~5구간 (1200만/4600만/8800만/1.5억/3억, 2014~2022 표)
const brackets_common_1_to_5 = [
  { min: 0, max: 12000000, rate: 0.06, deduction: 0 },
  { min: 12000001, max: 46000000, rate: 0.15, deduction: 1080000 },
  { min: 46000001, max: 88000000, rate: 0.24, deduction: 5220000 },
  { min: 88000001, max: 150000000, rate: 0.35, deduction: 14900000 },
  { min: 150000001, max: 300000000, rate: 0.38, deduction: 19400000 },
];

// surcharge rate_table (공통 — 세율 자체는 시점별 변화 없음)
const surchargeRateTable = {
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
};

// ============================================================
// 시딩 데이터
// ============================================================

const historicalSeeds = [
  // ── progressive_rate ────────────────────────────────────────

  // 1-A. 누진세율 fallback (effective ~2017.12.31: 6구간, 5억 초과 40%)
  //   소득세법 §104①1호 2014.1.1 시행 표 (3억~5억 40% 구간 추가)
  //   1990년대 초~2013년과 다소 다르지만 fallback으로 사용 (가장 유리한 쪽).
  {
    tax_type: "transfer",
    category: "progressive_rate",
    sub_category: "_default",
    effective_date: "1990-01-01",
    rate_table: {
      brackets: [
        ...brackets_common_1_to_5,
        { min: 300000001, rate: 0.40, deduction: 25400000 },
      ],
    },
    deduction_rules: null,
    special_rules: null,
    is_active: true,
  },

  // 1-B. 누진세율 2018.1.1 시행 (7구간: 5억 초과 42%)
  //   소득세법 §104①1호 2017.12.19 개정, 2018.1.1 시행
  //   적용 양도일: 2018-01-01 ~ 2020-12-31
  {
    tax_type: "transfer",
    category: "progressive_rate",
    sub_category: "_default",
    effective_date: "2018-01-01",
    rate_table: {
      brackets: [
        ...brackets_common_1_to_5,
        { min: 300000001, max: 500000000, rate: 0.40, deduction: 25400000 },
        { min: 500000001, rate: 0.42, deduction: 35400000 },
      ],
    },
    deduction_rules: null,
    special_rules: null,
    is_active: true,
  },

  // 1-C. 누진세율 2021.1.1 시행 (8구간: 10억 초과 45%)
  //   소득세법 §104①1호 2020.12.29 개정, 2021.1.1 시행
  //   적용 양도일: 2021-01-01 ~ 2022-12-31
  {
    tax_type: "transfer",
    category: "progressive_rate",
    sub_category: "_default",
    effective_date: "2021-01-01",
    rate_table: {
      brackets: [
        ...brackets_common_1_to_5,
        { min: 300000001, max: 500000000, rate: 0.40, deduction: 25400000 },
        { min: 500000001, max: 1000000000, rate: 0.42, deduction: 35400000 },
        { min: 1000000001, rate: 0.45, deduction: 65400000 },
      ],
    },
    deduction_rules: null,
    special_rules: null,
    is_active: true,
  },

  // ── deduction:long_term_holding ──────────────────────────────

  // 2. 장기보유특별공제 fallback (effective 1990-01-01)
  //   현행(2023) 규칙과 동일 내용을 과거 시점용으로 등록.
  //   1세대1주택 거주+보유 분리 요건(2020.1.1~)은 prePolicyExemptResidence(2017.8.3
  //   이전 취득) 로 커버되므로 별도 시점 분리 불필요.
  {
    tax_type: "transfer",
    category: "deduction",
    sub_category: "long_term_holding",
    effective_date: "1990-01-01",
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

  // ── deduction:basic ──────────────────────────────────────────

  // 3. 기본공제 fallback (effective 1990-01-01)
  //   연 250만원은 장기간 동일. 과거 시점 매칭용 fallback row.
  {
    tax_type: "transfer",
    category: "deduction",
    sub_category: "basic",
    effective_date: "1990-01-01",
    rate_table: null,
    deduction_rules: {
      type: "basic_deduction",
      annualLimit: 2500000,
      excludeUnregistered: true,
    },
    special_rules: null,
    is_active: true,
  },

  // ── surcharge:_default ───────────────────────────────────────

  // 4-A. 중과세율 fallback (effective 1990-01-01, 한시 유예 없음)
  //   2024.1.10 이전 양도에는 다주택 중과 한시 유예 없음.
  {
    tax_type: "transfer",
    category: "surcharge",
    sub_category: "_default",
    effective_date: "1990-01-01",
    rate_table: surchargeRateTable,
    deduction_rules: null,
    special_rules: null,
    is_active: true,
  },

  // 4-B. 중과세율 2024.1.10 시행 (다주택 한시 유예 2026.5.9까지)
  //   소득세법 부칙 2024.1.1 시행 — 양도일 기준이 아니라 시행일 이후 적용.
  //   effective_date를 2024-01-10으로 설정 → 2024.1.10+ 양도 케이스에 매칭.
  {
    tax_type: "transfer",
    category: "surcharge",
    sub_category: "_default",
    effective_date: "2024-01-10",
    rate_table: surchargeRateTable,
    deduction_rules: null,
    special_rules: {
      surcharge_suspended: true,
      suspended_types: ["multi_house_2", "multi_house_3plus"],
      suspended_until: "2026-05-09",
      legal_basis: "소득세법 부칙 (2024.1.1 시행)",
    },
    is_active: true,
  },

  // ── special:one_house_exemption ──────────────────────────────

  // 5. 1세대1주택 특례 fallback (effective 1990-01-01)
  //   prePolicyDate(2017.8.3) 기준 분기가 이미 내장되어 있어 과거 시점에도 정확하게 적용.
  {
    tax_type: "transfer",
    category: "special",
    sub_category: "one_house_exemption",
    effective_date: "1990-01-01",
    rate_table: null,
    deduction_rules: null,
    special_rules: {
      one_house_exemption: {
        maxExemptPrice: 1200000000,
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
] as const;

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
