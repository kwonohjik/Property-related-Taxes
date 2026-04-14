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
  regulatedAreaHistorySchema,
  nonBusinessLandJudgmentSchema,
  longTermRentalRuleSetSchema,
  newHousingMatrixSchema,
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

  // 7. 주택 수 산정 배제 규칙 (다주택 중과세)
  {
    tax_type: "transfer",
    category: "special",
    sub_category: "house_count_exclusion",
    effective_date: "2022-01-01",
    rate_table: null,
    deduction_rules: null,
    special_rules: {
      type: "house_count_exclusion",
      inheritedHouseYears: 5,
      rentalHousingExempt: true,
      lowPriceThreshold: {
        capital: null,        // 수도권은 저가 배제 없음
        non_capital: 100000000, // 비수도권 1억 이하 배제
      },
      presaleRightStartDate: "2021-01-01",
      officetelStartDate: "2022-01-01",
    },
    is_active: true,
  },

  // 8. 조정대상지역 이력 (서울 25개구 + 경기·인천 주요 지역)
  //    주요 변경 이력: 2017.8.3 최초 / 2020.6.19 / 2020.12.18 / 2022.9.26 / 2023.1.5 전면 해제
  {
    tax_type: "transfer",
    category: "special",
    sub_category: "regulated_areas",
    effective_date: "2017-08-03",
    rate_table: null,
    deduction_rules: null,
    special_rules: {
      type: "regulated_area_history",
      regions: [
        // 서울특별시 — 2017.8.3 전체 지정, 2023.1.5 전면 해제
        { code: "11110", name: "서울 종로구", designations: [{ designatedDate: "2017-08-03", releasedDate: "2023-01-05" }] },
        { code: "11140", name: "서울 중구",   designations: [{ designatedDate: "2017-08-03", releasedDate: "2023-01-05" }] },
        { code: "11170", name: "서울 용산구", designations: [{ designatedDate: "2017-08-03", releasedDate: "2023-01-05" }] },
        { code: "11200", name: "서울 성동구", designations: [{ designatedDate: "2017-08-03", releasedDate: "2023-01-05" }] },
        { code: "11215", name: "서울 광진구", designations: [{ designatedDate: "2017-08-03", releasedDate: "2023-01-05" }] },
        { code: "11230", name: "서울 동대문구", designations: [{ designatedDate: "2017-08-03", releasedDate: "2023-01-05" }] },
        { code: "11260", name: "서울 중랑구", designations: [{ designatedDate: "2017-08-03", releasedDate: "2023-01-05" }] },
        { code: "11290", name: "서울 성북구", designations: [{ designatedDate: "2017-08-03", releasedDate: "2023-01-05" }] },
        { code: "11305", name: "서울 강북구", designations: [{ designatedDate: "2017-08-03", releasedDate: "2023-01-05" }] },
        { code: "11320", name: "서울 도봉구", designations: [{ designatedDate: "2017-08-03", releasedDate: "2023-01-05" }] },
        { code: "11350", name: "서울 노원구", designations: [{ designatedDate: "2017-08-03", releasedDate: "2023-01-05" }] },
        { code: "11380", name: "서울 은평구", designations: [{ designatedDate: "2017-08-03", releasedDate: "2023-01-05" }] },
        { code: "11410", name: "서울 서대문구", designations: [{ designatedDate: "2017-08-03", releasedDate: "2023-01-05" }] },
        { code: "11440", name: "서울 마포구", designations: [{ designatedDate: "2017-08-03", releasedDate: "2023-01-05" }] },
        { code: "11470", name: "서울 양천구", designations: [{ designatedDate: "2017-08-03", releasedDate: "2023-01-05" }] },
        { code: "11500", name: "서울 강서구", designations: [{ designatedDate: "2017-08-03", releasedDate: "2023-01-05" }] },
        { code: "11530", name: "서울 구로구", designations: [{ designatedDate: "2017-08-03", releasedDate: "2023-01-05" }] },
        { code: "11545", name: "서울 금천구", designations: [{ designatedDate: "2017-08-03", releasedDate: "2023-01-05" }] },
        { code: "11560", name: "서울 영등포구", designations: [{ designatedDate: "2017-08-03", releasedDate: "2023-01-05" }] },
        { code: "11590", name: "서울 동작구", designations: [{ designatedDate: "2017-08-03", releasedDate: "2023-01-05" }] },
        { code: "11620", name: "서울 관악구", designations: [{ designatedDate: "2017-08-03", releasedDate: "2023-01-05" }] },
        { code: "11650", name: "서울 서초구", designations: [{ designatedDate: "2017-08-03", releasedDate: "2023-01-05" }] },
        { code: "11680", name: "서울 강남구", designations: [{ designatedDate: "2017-08-03", releasedDate: "2023-01-05" }] },
        { code: "11710", name: "서울 송파구", designations: [{ designatedDate: "2017-08-03", releasedDate: "2023-01-05" }] },
        { code: "11740", name: "서울 강동구", designations: [{ designatedDate: "2017-08-03", releasedDate: "2023-01-05" }] },
        // 경기도 — 2020.6.19 지정, 2022.9.26 또는 2023.1.5 해제
        { code: "41111", name: "수원 장안구", designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-09-26" }] },
        { code: "41113", name: "수원 권선구", designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-09-26" }] },
        { code: "41115", name: "수원 팔달구", designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-09-26" }] },
        { code: "41117", name: "수원 영통구", designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-09-26" }] },
        { code: "41131", name: "성남 수정구", designations: [{ designatedDate: "2017-08-03", releasedDate: "2023-01-05" }] },
        { code: "41133", name: "성남 중원구", designations: [{ designatedDate: "2017-08-03", releasedDate: "2023-01-05" }] },
        { code: "41135", name: "성남 분당구", designations: [{ designatedDate: "2017-08-03", releasedDate: "2023-01-05" }] },
        { code: "41150", name: "의정부시",   designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-09-26" }] },
        { code: "41171", name: "안양 만안구", designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-09-26" }] },
        { code: "41173", name: "안양 동안구", designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-09-26" }] },
        { code: "41281", name: "고양 덕양구", designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-09-26" }] },
        { code: "41285", name: "고양 일산동구", designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-09-26" }] },
        { code: "41287", name: "고양 일산서구", designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-09-26" }] },
        { code: "41390", name: "하남시",     designations: [{ designatedDate: "2017-08-03", releasedDate: "2023-01-05" }] },
        { code: "41410", name: "광명시",     designations: [{ designatedDate: "2017-08-03", releasedDate: "2023-01-05" }] },
        { code: "41450", name: "광주시",     designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-09-26" }] },
        { code: "41460", name: "양주시",     designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-09-26" }] },
        { code: "41480", name: "구리시",     designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-09-26" }] },
        { code: "41550", name: "남양주시",   designations: [{ designatedDate: "2017-08-03", releasedDate: "2023-01-05" }] },
        { code: "41570", name: "오산시",     designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-09-26" }] },
        { code: "41590", name: "시흥시",     designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-09-26" }] },
        { code: "41610", name: "군포시",     designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-09-26" }] },
        { code: "41630", name: "의왕시",     designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-09-26" }] },
        { code: "41650", name: "하남시(재)",  designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-09-26" }] },
        { code: "41670", name: "용인 처인구", designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-09-26" }] },
        { code: "41671", name: "용인 기흥구", designations: [{ designatedDate: "2017-08-03", releasedDate: "2023-01-05" }] },
        { code: "41673", name: "용인 수지구", designations: [{ designatedDate: "2017-08-03", releasedDate: "2023-01-05" }] },
        { code: "41820", name: "파주시",     designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-09-26" }] },
        { code: "41830", name: "이천시",     designations: [{ designatedDate: "2020-12-18", releasedDate: "2022-09-26" }] },
        { code: "41390", name: "화성시",     designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-09-26" }] },
        // 인천광역시
        { code: "28110", name: "인천 중구",   designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-09-26" }] },
        { code: "28140", name: "인천 동구",   designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-09-26" }] },
        { code: "28177", name: "인천 미추홀구", designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-09-26" }] },
        { code: "28185", name: "인천 연수구", designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-09-26" }] },
        { code: "28200", name: "인천 남동구", designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-09-26" }] },
        { code: "28237", name: "인천 부평구", designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-09-26" }] },
        { code: "28245", name: "인천 계양구", designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-09-26" }] },
        { code: "28260", name: "인천 서구",   designations: [{ designatedDate: "2020-06-19", releasedDate: "2022-09-26" }] },
      ],
    },
    is_active: true,
  },

  // 10. 장기임대주택 감면 규칙 V2 (조특법 §97, §97의3, §97의4, §97의5)
  {
    tax_type: "transfer",
    category: "deduction",
    sub_category: "long_term_rental_v2",
    effective_date: "2020-08-18",
    rate_table: null,
    deduction_rules: {
      type: "long_term_rental_v2",
      subTypes: [
        {
          code: "public_construction",
          lawArticle: "97",
          mandatoryYears: 5,
          reductionRate: 1.0,
          maxOfficialPrice: { capital: 300000000, non_capital: null },
          rentIncreaseLimit: null,
        },
        {
          code: "long_term_private",
          lawArticle: "97-3",
          tiers: [
            { mandatoryYears: 8, reductionRate: 0.5, longTermDeductionRate: 0.5 },
            { mandatoryYears: 10, reductionRate: 0.7, longTermDeductionRate: 0.7 },
          ],
          maxOfficialPrice: { capital: 600000000, non_capital: 300000000 },
          rentIncreaseLimit: 0.05,
        },
        {
          code: "public_support_private",
          lawArticle: "97-4",
          tiers: [
            { mandatoryYears: 8, reductionRate: 0.5, longTermDeductionRate: 0.5 },
            { mandatoryYears: 10, reductionRate: 0.7, longTermDeductionRate: 0.7 },
          ],
          maxOfficialPrice: { capital: 600000000, non_capital: 300000000 },
          rentIncreaseLimit: 0.05,
          fullReductionAfterMandatory: true,
        },
        {
          code: "public_purchase",
          lawArticle: "97-5",
          reductionRate: 1.0,
          conditions: { mustSellToPublicEntity: true },
        },
      ],
    },
    special_rules: null,
    is_active: true,
  },

  // 11. 신축주택·미분양주택 감면 매트릭스 (조특법 §98의2, §99①~⑥, §99의3)
  {
    tax_type: "transfer",
    category: "deduction",
    sub_category: "new_housing_matrix",
    effective_date: "2001-05-23",
    rate_table: null,
    deduction_rules: {
      type: "new_housing_matrix",
      articles: [
        // §98의2 — 1998.5.22~2001.12.31 신축주택 5년간 양도차익 면제
        {
          code: "98-2",
          article: "§98의2",
          acquisitionPeriod: { start: "1998-05-22", end: "2001-12-31" },
          region: "nationwide",
          maxAcquisitionPrice: null,
          maxArea: null,
          requiresFirstSale: false,
          requiresUnsoldCertificate: false,
          reductionScope: "capital_gain",
          reductionRate: 1.0,
          fiveYearWindowRule: true,
          isExcludedFromHouseCount: true,
          isExcludedFromMultiHouseSurcharge: true,
        },
        // §99 ① — 2001.5.23~2003.6.30 수도권 과밀억제권역 외 신축
        {
          code: "99-1",
          article: "§99 ①",
          acquisitionPeriod: { start: "2001-05-23", end: "2003-06-30" },
          region: "outside_overconcentration",
          maxAcquisitionPrice: null,
          maxArea: null,
          requiresFirstSale: true,
          requiresUnsoldCertificate: false,
          reductionScope: "capital_gain",
          reductionRate: 1.0,
          fiveYearWindowRule: true,
          isExcludedFromHouseCount: true,
          isExcludedFromMultiHouseSurcharge: true,
        },
        // §99 ② — 2009.2.12~2010.2.11 비수도권 미분양/수도권 과밀억제권역 외 신축 (6억 이하 100%)
        {
          code: "99-2-low",
          article: "§99 ② (6억 이하)",
          acquisitionPeriod: { start: "2009-02-12", end: "2010-02-11" },
          region: "non_metropolitan",
          maxAcquisitionPrice: 600000000,
          maxArea: null,
          requiresFirstSale: false,
          requiresUnsoldCertificate: true,
          reductionScope: "capital_gain",
          reductionRate: 1.0,
          fiveYearWindowRule: true,
          isExcludedFromHouseCount: true,
          isExcludedFromMultiHouseSurcharge: true,
        },
        // §99 ② — 6억 초과 9억 이하 80%
        {
          code: "99-2-mid",
          article: "§99 ② (6억~9억)",
          acquisitionPeriod: { start: "2009-02-12", end: "2010-02-11" },
          region: "non_metropolitan",
          maxAcquisitionPrice: 900000000,
          maxArea: null,
          requiresFirstSale: false,
          requiresUnsoldCertificate: true,
          reductionScope: "capital_gain",
          reductionRate: 0.8,
          fiveYearWindowRule: true,
          isExcludedFromHouseCount: true,
          isExcludedFromMultiHouseSurcharge: true,
        },
        // §99 ② — 9억 초과 60%
        {
          code: "99-2-high",
          article: "§99 ② (9억 초과)",
          acquisitionPeriod: { start: "2009-02-12", end: "2010-02-11" },
          region: "non_metropolitan",
          maxAcquisitionPrice: null,
          maxArea: null,
          requiresFirstSale: false,
          requiresUnsoldCertificate: true,
          reductionScope: "capital_gain",
          reductionRate: 0.6,
          fiveYearWindowRule: true,
          isExcludedFromHouseCount: true,
          isExcludedFromMultiHouseSurcharge: true,
        },
        // §99 ③ — 2010.2.12~2011.4.30 수도권 외 미분양 60%
        {
          code: "99-3",
          article: "§99 ③",
          acquisitionPeriod: { start: "2010-02-12", end: "2011-04-30" },
          region: "non_metropolitan",
          maxAcquisitionPrice: null,
          maxArea: null,
          requiresFirstSale: false,
          requiresUnsoldCertificate: true,
          reductionScope: "capital_gain",
          reductionRate: 0.6,
          fiveYearWindowRule: true,
          isExcludedFromHouseCount: false,
          isExcludedFromMultiHouseSurcharge: false,
        },
        // §99 ④ — 2012.9.24~2013.4.1 전국 미분양 (6억 이하 또는 국민주택규모)
        {
          code: "99-4",
          article: "§99 ④",
          acquisitionPeriod: { start: "2012-09-24", end: "2013-04-01" },
          region: "nationwide",
          maxAcquisitionPrice: 600000000,
          maxArea: 85,
          requiresFirstSale: false,
          requiresUnsoldCertificate: true,
          reductionScope: "capital_gain",
          reductionRate: 1.0,
          fiveYearWindowRule: true,
          isExcludedFromHouseCount: false,
          isExcludedFromMultiHouseSurcharge: false,
        },
        // §99 ⑤ — 2013.4.1~2013.12.31 수도권 6억 이하
        {
          code: "99-5-c",
          article: "§99 ⑤ (수도권)",
          acquisitionPeriod: { start: "2013-04-01", end: "2013-12-31" },
          region: "metropolitan",
          maxAcquisitionPrice: 600000000,
          maxArea: 85,
          requiresFirstSale: false,
          requiresUnsoldCertificate: false,
          reductionScope: "capital_gain",
          reductionRate: 1.0,
          fiveYearWindowRule: true,
          isExcludedFromHouseCount: false,
          isExcludedFromMultiHouseSurcharge: false,
        },
        // §99 ⑤ — 비수도권 3억 이하
        {
          code: "99-5-nc",
          article: "§99 ⑤ (비수도권)",
          acquisitionPeriod: { start: "2013-04-01", end: "2013-12-31" },
          region: "non_metropolitan",
          maxAcquisitionPrice: 300000000,
          maxArea: 85,
          requiresFirstSale: false,
          requiresUnsoldCertificate: false,
          reductionScope: "capital_gain",
          reductionRate: 1.0,
          fiveYearWindowRule: true,
          isExcludedFromHouseCount: false,
          isExcludedFromMultiHouseSurcharge: false,
        },
        // §99 ⑥ — 2014.1.1~2014.12.31 수도권 6억 이하
        {
          code: "99-6-c",
          article: "§99 ⑥ (수도권)",
          acquisitionPeriod: { start: "2014-01-01", end: "2014-12-31" },
          region: "metropolitan",
          maxAcquisitionPrice: 600000000,
          maxArea: 85,
          requiresFirstSale: false,
          requiresUnsoldCertificate: false,
          reductionScope: "capital_gain",
          reductionRate: 1.0,
          fiveYearWindowRule: true,
          isExcludedFromHouseCount: false,
          isExcludedFromMultiHouseSurcharge: false,
        },
        // §99 ⑥ — 비수도권 3억 이하
        {
          code: "99-6-nc",
          article: "§99 ⑥ (비수도권)",
          acquisitionPeriod: { start: "2014-01-01", end: "2014-12-31" },
          region: "non_metropolitan",
          maxAcquisitionPrice: 300000000,
          maxArea: 85,
          requiresFirstSale: false,
          requiresUnsoldCertificate: false,
          reductionScope: "capital_gain",
          reductionRate: 1.0,
          fiveYearWindowRule: true,
          isExcludedFromHouseCount: false,
          isExcludedFromMultiHouseSurcharge: false,
        },
        // §99의3 ② — 2013.4.1~2013.12.31 전국 미분양 6억 이하 60%
        {
          code: "99-3-2",
          article: "§99의3 ②",
          acquisitionPeriod: { start: "2013-04-01", end: "2013-12-31" },
          region: "nationwide",
          maxAcquisitionPrice: 600000000,
          maxArea: null,
          requiresFirstSale: false,
          requiresUnsoldCertificate: true,
          reductionScope: "capital_gain",
          reductionRate: 0.6,
          fiveYearWindowRule: true,
          isExcludedFromHouseCount: false,
          isExcludedFromMultiHouseSurcharge: false,
        },
        // §99의3 ⑩ — 2015.1.1~2015.12.31 전국 미분양 100%
        {
          code: "99-3-10",
          article: "§99의3 ⑩",
          acquisitionPeriod: { start: "2015-01-01", end: "2015-12-31" },
          region: "nationwide",
          maxAcquisitionPrice: null,
          maxArea: null,
          requiresFirstSale: false,
          requiresUnsoldCertificate: true,
          reductionScope: "capital_gain",
          reductionRate: 1.0,
          fiveYearWindowRule: true,
          isExcludedFromHouseCount: false,
          isExcludedFromMultiHouseSurcharge: false,
        },
      ],
    },
    special_rules: null,
    is_active: true,
  },

  // 9. 비사업용 토지 판정 기준 (소득세법 §104조의3, 시행령 §168조의6~8)
  {
    tax_type: "transfer",
    category: "special",
    sub_category: "non_business_land_judgment",
    effective_date: "2007-01-01",
    rate_table: null,
    deduction_rules: null,
    special_rules: {
      type: "non_business_land_judgment",
      buildingAreaMultipliers: {
        residential: 5,
        commercial: 5,
        industrial: 7,
        green: 10,
        management: 10,
        agriculture_forest: 10,
        natural_env: 10,
        undesignated: 7,
      },
      farmlandDistanceKm: 30,
      exemptionPeriods: {
        inheritance: 5,
        construction: 2,
        unavoidable: 2,
        preparation: 2,
        sale_contract: 2,
      },
    },
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

  if (seed.special_rules && seed.sub_category === "regulated_areas") {
    const result = regulatedAreaHistorySchema.safeParse(seed.special_rules);
    if (!result.success) {
      throw new Error(`[${index}] regulated_areas 검증 실패: ${result.error.message}`);
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
