/**
 * transfer-rate-seed.ts — 양도소득세 세율 시드 데이터 (현행 2023.1.1~, 단일 소스)
 *
 * 용도:
 *   1. scripts/seed-transfer-tax-rates.ts — Supabase tax_rates 시딩
 *   2. lib/db/tax-rates.ts loadFallbackTransferRates() — Supabase 미도달 시 로컬 fallback
 *
 * 순수 데이터 (side effect 없음 — route 번들 import 안전).
 * 세율 개정 시 이 파일만 수정 → 시딩·fallback 동시 반영.
 */

import { ONE_HOUSE_RESIDENCE, SURCHARGE_SUSPENSION_TRANSFER_DATE_WINDOW } from "../legal-codes/transfer";

export const transferTaxSeeds = [
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
    // ⚠️ 이 레코드의 effective_date(2023-01-01)는 중과 한시배제 창
    //    (2022-05-10 ~ 2026-05-09, §167의3①12의2·§167의10①12의2) **안**이다.
    //    유예 정보를 담은 historical 레코드는 2022-05-10·2024-01-10 두 건뿐이라,
    //    여기를 null로 두면 `DISTINCT ON … ORDER BY effective_date DESC` 의미론상
    //    **2023-01-01 ~ 2024-01-09 양도분이 유예를 잃는다**(계획서 F-6, 실측 +388,410,000 과다과세).
    //    fallback·DB(preload_tax_rates) 양쪽 동일 의미론이므로 두 경로 모두 영향받았다.
    //    보유 2년 요건은 엔진(determineMultiHouseSurcharge)이 별도 게이트 — 여기는 양도일 축만.
    special_rules: {
      surcharge_suspended: true,
      suspended_types: ["multi_house_2", "multi_house_3plus"],
      suspended_until: SURCHARGE_SUSPENSION_TRANSFER_DATE_WINDOW.end,
      legal_basis: "소득세법 시행령 §167의3①12의2·§167의10①12의2",
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
        ...ONE_HOUSE_RESIDENCE, // 거주요건 3값 단일 소스 (legal-codes/transfer)
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
        non_capital: 300000000, // 지방(광역시 군·수도권 군 포함) 기준시가 3억 이하 배제 (§167의3①1호)
      },
      presaleRightStartDate: "2021-01-01",
      officetelStartDate: "2022-01-01",
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
  // ────────────────────────────────────────────────────────────────────
  // ⚠️ Phase 0 매핑 감사 (2026-05-06): article 라벨 정정 예약
  // 본 시드의 article 라벨 "§99 ①~⑥"은 코드 작성자 자체 식별자이며,
  // 실제 조특법 조문번호와 일치하지 않습니다. 회귀 안전을 위해 라벨 자체는
  // Phase 2 본격 구현 시점(anchor 테스트와 함께)에 정정합니다.
  //
  // 정정 매핑 (감사 결과):
  //   code "98-2"      → 시기 1998.5.22~1999.6.30 = 실제 §99 ① (라벨은 §98의2로 적힘)
  //   code "99-1"      → 시기 2001.5.23~2003.6.30 = 실제 §99의3
  //   code "99-2-*"    → 시기 2009.2.12~2010.2.11 = 실제 §98의3
  //   code "99-3"      → 시기 2010.2.12~2011.4.30 = 실제 §98의5
  //   code "99-4"      → 시기 2012.9.24~2013.4.1  = 실제 §98의7 (정확 시기는 ~2012.12.31)
  //   code "99-5-*"    → 시기 2013.4.1~2013.12.31 = 실제 §99의2
  //   code "99-6-*"    → 시기 2014.1.1~2014.12.31 = 실제 §98의8 (정확 시기는 2015.1.1~2015.12.31)
  //   code "99-3-2"    → 시기 2013.4.1~2013.12.31 = 실제 §99의2 (위 99-5-*와 중복 가능)
  //
  // 매핑 감사: docs/02-design/features/transfer-reduction-mapping-audit.md
  // 정정 정책: 사용자 결정사항 #3 — 자동 변환 (이력 마이그레이션은 lib/storage/migrations/)
  // ────────────────────────────────────────────────────────────────────
  {
    tax_type: "transfer",
    category: "deduction",
    sub_category: "new_housing_matrix",
    effective_date: "2001-05-23",
    rate_table: null,
    deduction_rules: {
      type: "new_housing_matrix",
      articles: [
        // §99 — 1998.5.22~1999.6.30 IMF 1차 신축주택 (국민주택 ~1999.12.31)
        // ⚠ 라벨 정정 (Phase 0 매핑 감사, 2026-05-06): 기존 "§98의2"는 코드 작성자
        // 자체 식별자였으며 실제 조특법 §98의2(미분양)와 무관. 실제 조문은 §99 ①항.
        {
          code: "99-main",
          article: "§99 (IMF 1차)",
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
        // §99의3 — 2001.5.23~2003.6.30 IMF 2차 신축주택 (가격 급등 지역 외)
        // ⚠ 라벨 정정 (Phase 0 매핑 감사, 2026-05-06): 기존 "§99 ①"은 코드 작성자
        // 자체 식별자. 실제 조문은 §99의3 ①항 1호 + 2호.
        {
          code: "99-3-main",
          article: "§99의3",
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
        // §98의3 — 2009.2.12~2010.2.11 서울 외 미분양주택 (수도권과밀 60%, 그 외 100%)
        // ⚠ 라벨 정정 (Phase 0 매핑 감사, 2026-05-06): 기존 "§99 ②"는 코드 작성자
        // 자체 식별자. 실제 조문은 §98의3 ①항. 6억 이하/6~9억/9억 초과 차등은
        // 코드 시드 자체 분기이며 §98의3 본문에는 없음 — Phase 2 본격 정정 시 검토.
        {
          code: "98-3-low",
          article: "§98의3 (6억 이하)",
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
        {
          code: "98-3-mid",
          article: "§98의3 (6억~9억)",
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
        {
          code: "98-3-high",
          article: "§98의3 (9억 초과)",
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
        // §98의5 — 2010.2.12~2011.4.30 수도권 외 미분양 (분양가 인하율 60%)
        // ⚠ 라벨 정정 (Phase 0 매핑 감사): 기존 "§99 ③" 코드 자체 식별자.
        // 실제 §98의5는 분양가 인하율별 60/80/100% 차등.
        {
          code: "98-5",
          article: "§98의5",
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
        // §98의7 — 2012.9.24~2012.12.31 9억 이하 미분양 100%
        // ⚠ 라벨 정정 + 시기 정정 (Phase 0 매핑 감사): 시기 종료일 2013.4.1 → 2012.12.31.
        {
          code: "98-7",
          article: "§98의7",
          acquisitionPeriod: { start: "2012-09-24", end: "2012-12-31" },
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
        // §99의2 — 2013.4.1~2013.12.31 신축·미분양·1세대1주택 매입자 (취득가 6억↓ OR 전용 85㎡↓)
        // ⚠ 라벨 정정 (Phase 0 매핑 감사): 기존 "§99 ⑤" 코드 자체 식별자.
        // 실제 §99의2는 가격·면적 OR 조건 (시드는 AND로 분기 — Phase 2 본격 정정 시 검토).
        {
          code: "99-2-metro",
          article: "§99의2 (수도권)",
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
        {
          code: "99-2-non-metro",
          article: "§99의2 (비수도권)",
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
        // §98의8 — 2015.1.1~2015.12.31 준공후미분양 6억·135㎡↓ (5년간 발생분 50% 차감)
        // ⚠ 라벨 정정 + 시기 정정 (Phase 0 매핑 감사): 시기 2014 → 2015 정정.
        {
          code: "98-8-metro",
          article: "§98의8 (수도권)",
          acquisitionPeriod: { start: "2015-01-01", end: "2015-12-31" },
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
        {
          code: "98-8-non-metro",
          article: "§98의8 (비수도권)",
          acquisitionPeriod: { start: "2015-01-01", end: "2015-12-31" },
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
