/**
 * transfer-rate-seed-historical.ts — 양도소득세 역사 세율 시드 데이터 (2023 이전, 단일 소스)
 *
 * 목적: 2023년 이전 양도일 세율 매칭. loadFallbackTransferRates(targetDate)·시딩 공용.
 *   effective_date <= targetDate 중 최신 row 선택 → 현행(2023-01-01) + 역사 병합 필요.
 *
 * 순수 데이터 (side effect 없음 — route 번들 import 안전).
 */
import { SURCHARGE_SUSPENSION_TRANSFER_DATE_WINDOW } from "../legal-codes/transfer";
import { HOUSE_COUNT_EXCLUSION_RULES } from "./transfer-rate-seed";

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

export const historicalSeeds = [
  // ── progressive_rate ────────────────────────────────────────

  // 1-A. 누진세율 fallback (effective 1990-01-01) — **2002-01-01 전 양도는 미지원**(US-10 · Q-30 (b) · 후속 W1).
  //   2002-01-01 전 시행본 세율표는 읽지 않았다(2001 시행본 §55① 10/20/30/40 — 확인 필요). 이 행은 어느 연도 법정표와도 맞지 않는 근사값이라
  //   그 양도분 결과에는 `TRANSFER_RATE_ERA_UNSUPPORTED_NOTICE`가 붙는다. 2002-01-01 이후 양도는 아래 1-A1~1-A7 행이 잡힌다.
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

  // 1-A1~1-A6. 연도별 법정 누진세율표 (소득세법 §104①1호 → §55①, 2026-11-09 KoreanLaw 시행본 원문 대조).
  //   적용례는 각 개정 부칙 「시행 후 (최초로) 양도하는 분부터」 — effective_date = 시행일.
  //   누진공제는 법령 정액(구간 누적세액)에서 역산한 값이다.
  //   · 2002-01-01 9/18/27/36 (1천만·4천만·8천만) — 법률 제6557호(2001.12.31.) 부칙 제4조 · MST 55566(§104①1호→§55①, 시행 2002.1.1.).
  //     같은 표가 2008.12.31.까지 이어진다: MST 58262(2004.1.1.)·66275(2005.1.1., §104①1호에 직접)·76551(2007.1.1.)·82364(2008.1.1.)·84761(2008.3.21., 제8911호 —
  //     §104①을 바꾸지 않았다) 본문 대조(후속 R·W1, 2026-11-10). 종전 시작일 2008-03-21 근거(제8911호)는 틀렸다.
  //   · 2009-01-01 6/16/25/35 (1,200만·4,600만·8,800만) — 제9270호 부칙 §1·§2② · MST 94271
  //   · 2010-01-01 6/15/24/35 — 제9897호 부칙 §1·§2② · MST 98343
  //   · 2012-01-01 8,800만~3억 35, 3억 초과 38 — 제11146호 부칙 §1·§2② · MST 131369(2013.1.1 시행본 본문 확인)
  //   · 2014-01-01 1.5억 초과 38 — 제12169호 부칙 §2②·§5 · MST 149361
  //   · 2017-01-01 1.5억~5억 38, 5억 초과 40 — 제14389호 부칙 §1·§2② · MST 188354
  {
    tax_type: "transfer",
    category: "progressive_rate",
    sub_category: "_default",
    effective_date: "2002-01-01",
    rate_table: {
      brackets: [
        { min: 0, max: 10000000, rate: 0.09, deduction: 0 },
        { min: 10000001, max: 40000000, rate: 0.18, deduction: 900000 },
        { min: 40000001, max: 80000000, rate: 0.27, deduction: 4500000 },
        { min: 80000001, rate: 0.36, deduction: 11700000 },
      ],
    },
    deduction_rules: null,
    special_rules: null,
    is_active: true,
  },
  {
    tax_type: "transfer",
    category: "progressive_rate",
    sub_category: "_default",
    effective_date: "2009-01-01",
    rate_table: {
      brackets: [
        { min: 0, max: 12000000, rate: 0.06, deduction: 0 },
        { min: 12000001, max: 46000000, rate: 0.16, deduction: 1200000 },
        { min: 46000001, max: 88000000, rate: 0.25, deduction: 5340000 },
        { min: 88000001, rate: 0.35, deduction: 14140000 },
      ],
    },
    deduction_rules: null,
    special_rules: null,
    is_active: true,
  },
  {
    tax_type: "transfer",
    category: "progressive_rate",
    sub_category: "_default",
    effective_date: "2010-01-01",
    rate_table: {
      brackets: [
        { min: 0, max: 12000000, rate: 0.06, deduction: 0 },
        { min: 12000001, max: 46000000, rate: 0.15, deduction: 1080000 },
        { min: 46000001, max: 88000000, rate: 0.24, deduction: 5220000 },
        { min: 88000001, rate: 0.35, deduction: 14900000 },
      ],
    },
    deduction_rules: null,
    special_rules: null,
    is_active: true,
  },
  {
    tax_type: "transfer",
    category: "progressive_rate",
    sub_category: "_default",
    effective_date: "2012-01-01",
    rate_table: {
      brackets: [
        { min: 0, max: 12000000, rate: 0.06, deduction: 0 },
        { min: 12000001, max: 46000000, rate: 0.15, deduction: 1080000 },
        { min: 46000001, max: 88000000, rate: 0.24, deduction: 5220000 },
        { min: 88000001, max: 300000000, rate: 0.35, deduction: 14900000 },
        { min: 300000001, rate: 0.38, deduction: 23900000 },
      ],
    },
    deduction_rules: null,
    special_rules: null,
    is_active: true,
  },
  {
    tax_type: "transfer",
    category: "progressive_rate",
    sub_category: "_default",
    effective_date: "2014-01-01",
    rate_table: {
      brackets: [
        { min: 0, max: 12000000, rate: 0.06, deduction: 0 },
        { min: 12000001, max: 46000000, rate: 0.15, deduction: 1080000 },
        { min: 46000001, max: 88000000, rate: 0.24, deduction: 5220000 },
        { min: 88000001, max: 150000000, rate: 0.35, deduction: 14900000 },
        { min: 150000001, rate: 0.38, deduction: 19400000 },
      ],
    },
    deduction_rules: null,
    special_rules: null,
    is_active: true,
  },
  {
    tax_type: "transfer",
    category: "progressive_rate",
    sub_category: "_default",
    effective_date: "2017-01-01",
    rate_table: {
      brackets: [
        ...brackets_common_1_to_5.slice(0, 4),
        { min: 150000001, max: 500000000, rate: 0.38, deduction: 19400000 },
        { min: 500000001, rate: 0.40, deduction: 29400000 },
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
  //   2022.5.10 이전 양도에는 다주택 중과 한시 유예 없음.
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

  // 4-A2. 중과세율 한시 유예 시작 (다주택 배제 2022.5.10 ~ 2026.5.9)
  //   근거: 소득세법 시행령 §167의3①12의2·§167의10①12의2 (KoreanLaw 실측 2026-07-19).
  //   effective_date=윈도우 하한 → 2022-05-10~2026-05-09 양도가 이 row에 매칭(most recent ≤).
  //   보유 2년 요건은 엔진(determineMultiHouseSurcharge)에서 별도 게이트(세율 row는 양도일 축만).
  {
    tax_type: "transfer",
    category: "surcharge",
    sub_category: "_default",
    effective_date: SURCHARGE_SUSPENSION_TRANSFER_DATE_WINDOW.start,
    rate_table: surchargeRateTable,
    deduction_rules: null,
    special_rules: {
      surcharge_suspended: true,
      suspended_types: ["multi_house_2", "multi_house_3plus"],
      suspended_until: SURCHARGE_SUSPENSION_TRANSFER_DATE_WINDOW.end,
      legal_basis: "소득세법 시행령 §167의3①12의2·§167의10①12의2",
    },
    is_active: true,
  },

  // 4-B. 중과세율 2024.1.10 시행 (다주택 한시 유예 2026.5.9까지 — 4-A2와 동일 종료일, 무해한 중복)
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
        // G-5: 기준금액은 `resolveHighValueHouseThreshold(양도일)`가 정한다(seed 주석 참조).
        minHoldingYears: 2,
        regulatedAreaMinResidenceYears: 2,
        prePolicyDate: "2017-08-03",
        prePolicyExemptResidence: true,
      },
      temporary_two_house: {
        disposalDeadlineYears: 3,
      },
    },
    is_active: true,
  },

  // ── special:house_count_exclusion ────────────────────────────

  // 6. 주택 수 산정 배제 규칙 (effective 2018-04-01 — E-14j)
  //   법 §104⑦(다주택 중과) 시행일 — 법률 제15225호 부칙 제1조1호 「… 같은 조 제7항ㆍ제8항 … 의 개정규정: 2018년 4월 1일」·
  //   제2조② 「이 법 중 양도소득에 관한 개정규정은 이 법 시행 이후 양도하는 자산으로부터 발생하는 소득분부터 적용한다」.
  //   종전에는 메인 seed의 2022-01-01 행뿐이라 2018.4.1.~2021.12.31. 양도분이 정밀 중과 판정(STEP 0.5)을 타지 않고
  //   원시 플래그(조정 + 세대 주택 수 ≥ 2)로 중과됐다 — 1호 지방 저가주택 불산입·배제 호 전부 미적용.
  //   값은 메인 seed와 **같은 객체**(`HOUSE_COUNT_EXCLUSION_RULES`) — 그 사이 개정 없음(상수 주석 참조).
  //   ⚠️ 2018-04-01 **전**으로 내리지 않는다 — 그 전 양도에는 §104⑦이 없다(세율 층 `MULTI_HOUSE_SURCHARGE_START_DATE`).
  {
    tax_type: "transfer",
    category: "special",
    sub_category: "house_count_exclusion",
    effective_date: "2018-04-01",
    rate_table: null,
    deduction_rules: null,
    special_rules: HOUSE_COUNT_EXCLUSION_RULES,
    is_active: true,
  },

  // ── deduction:self_farming (조특법 §69 — 8년 이상 자경농지) ──────────────────────────────────
  //
  // 현행 행(2023-01-01)은 메인 seed에 있고, 여기는 그 앞 시행본이다(계획서 `docs/00-pm/self-farming-history-rows.plan.md`).
  // 값 차이는 **§133① 종합한도의 시행본별 금액**뿐이다 — 감면율 100%·«8년 이상»은 2009-03-16~현행 불변(시행본별 §69① 본문 조회).
  // 한도는 **양도일 기준**이다(조특법 부칙 제13560호·제15227호 제2조③ «시행 이후 양도하는 경우부터 적용»).
  //
  //   양도일                     연(과세기간별)  5개 과세기간   근거
  //   2009-03-16 ~ 2015-12-31   2억            3억            §133①1호 나목 · 2호 다목 (MST 91272 ~ 165311)
  //   2016-01-01 ~ 2017-12-31   1억            3억            §133①1호(단일 열거) · 2호 다목 (MST 177204)
  //   2018-01-01 ~ 2022-12-31   1억            2억            §133①1호 · 2호(다목 삭제) (MST 199744)
  //
  // ⚠️ `maxAmount`는 **단건·이력 없음** 경로의 연 한도이고, 5개 과세기간 한도(`cumulativeMax`)와 이력 있음·다건 경로의 연 한도는
  //    `buildLimitGroups`(`aggregate-reduction-limits.ts`)가 정한다 — 두 곳을 같은 PR에서 같은 값으로 맞춘다.
  // ⚠️ `periodYears`·`cumulativeMax`·`requiresProof`·`maxResidenceDistance`는 엔진이 읽지 않는다(표시·문서용). 거리는 시행령 §66 기준:
  //    직선 20km(~2015-02-02) → 30km(2015-02-03~). 첫 행에 20을 적었지만 2015-02-03~2015-12-31 양도도 같은 행이다.
  // ⚠️ 2009-03-16 **전**으로 내리지 않는다 — 그 전 시행본은 조회하지 않았다(그 양도일은 «계산하지 못함» 고지가 계속 붙는다).
  // ⚠️ 공익사업 수용 경과특례(사업인정고시 2016.1.1. 전 → 연 2억 ~2017-12-31 양도, 5개 과세기간 3억 ~2019-12-31 양도 —
  //    부칙 제13560호 제63조·제15227호 제61조)는 구현하지 않았다(대통령령 요건 미조회).
  {
    tax_type: "transfer",
    category: "deduction",
    sub_category: "self_farming",
    effective_date: "2009-03-16",
    rate_table: null,
    deduction_rules: {
      type: "self_farming",
      maxRate: 1.0,
      maxAmount: 200000000, // 연 2억원
      periodYears: 5,
      cumulativeMax: 300000000, // 5개 과세기간 3억원
      conditions: { minFarmingYears: 8, requiresProof: true, maxResidenceDistance: 20 },
    },
    special_rules: null,
    is_active: true,
  },
  {
    tax_type: "transfer",
    category: "deduction",
    sub_category: "self_farming",
    effective_date: "2016-01-01",
    rate_table: null,
    deduction_rules: {
      type: "self_farming",
      maxRate: 1.0,
      maxAmount: 100000000, // 연 1억원
      periodYears: 5,
      cumulativeMax: 300000000, // 5개 과세기간 3억원
      conditions: { minFarmingYears: 8, requiresProof: true, maxResidenceDistance: 30 },
    },
    special_rules: null,
    is_active: true,
  },
  {
    tax_type: "transfer",
    category: "deduction",
    sub_category: "self_farming",
    effective_date: "2018-01-01",
    rate_table: null,
    deduction_rules: {
      type: "self_farming",
      maxRate: 1.0,
      maxAmount: 100000000, // 연 1억원
      periodYears: 5,
      cumulativeMax: 200000000, // 5개 과세기간 2억원
      conditions: { minFarmingYears: 8, requiresProof: true, maxResidenceDistance: 30 },
    },
    special_rules: null,
    is_active: true,
  },
] as const;
