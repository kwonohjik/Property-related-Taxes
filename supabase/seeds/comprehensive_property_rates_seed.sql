-- ============================================================
-- 종합부동산세 세율 시딩 (Comprehensive Property Tax Rates)
-- 종합부동산세법 §8~§15 (2024년 기준 현행 세율)
-- effective_date: 2024-01-01
--
-- TaxRatesMap 키 형식: comprehensive_property:{category}:{sub_category}
--   주택분   → comprehensive_property:housing:{sub_category}
--   종합합산 → comprehensive_property:land_aggregate:{sub_category}
--   별도합산 → comprehensive_property:land_separate:{sub_category}
-- ============================================================

-- 기존 데이터 정리 (멱등성)
DELETE FROM tax_rates
WHERE tax_type = 'comprehensive_property'
  AND effective_date = '2024-01-01';

-- ============================================================
-- 1. 주택분 — 기본공제 (종합부동산세법 §8①)
-- ============================================================

-- 일반 기본공제 9억원
INSERT INTO tax_rates (tax_type, category, sub_category, effective_date, rate_data, is_active)
VALUES (
  'comprehensive_property',
  'housing',
  'basic_deduction_general',
  '2024-01-01',
  '{
    "amount": 900000000,
    "description": "주택분 일반 기본공제 (9억원)",
    "legalBasis": "종합부동산세법 §8①"
  }',
  true
);

-- 1세대1주택자 기본공제 12억원
INSERT INTO tax_rates (tax_type, category, sub_category, effective_date, rate_data, is_active)
VALUES (
  'comprehensive_property',
  'housing',
  'basic_deduction_one_house',
  '2024-01-01',
  '{
    "amount": 1200000000,
    "description": "1세대1주택자 기본공제 (12억원)",
    "legalBasis": "종합부동산세법 §8①1호"
  }',
  true
);

-- ============================================================
-- 2. 주택분 — 공정시장가액비율 (종합부동산세법 시행령 §2의4)
-- ============================================================

INSERT INTO tax_rates (tax_type, category, sub_category, effective_date, rate_data, is_active)
VALUES (
  'comprehensive_property',
  'housing',
  'fair_market_ratio',
  '2024-01-01',
  '{
    "ratio": 0.60,
    "description": "주택분 공정시장가액비율 60%",
    "legalBasis": "종합부동산세법 시행령 §2의4"
  }',
  true
);

-- ============================================================
-- 3. 주택분 — 누진세율 7단계 (종합부동산세법 §9①)
-- ============================================================

INSERT INTO tax_rates (tax_type, category, sub_category, effective_date, rate_data, is_active)
VALUES (
  'comprehensive_property',
  'housing',
  'rate_brackets',
  '2024-01-01',
  '{
    "brackets": [
      {
        "maxValue": 300000000,
        "rate": 0.005,
        "deduction": 0,
        "description": "3억원 이하 0.5%",
        "legalBasis": "종합부동산세법 §9①1호"
      },
      {
        "minValue": 300000001,
        "maxValue": 600000000,
        "rate": 0.007,
        "deduction": 600000,
        "description": "3억원 초과 6억원 이하 0.7%",
        "legalBasis": "종합부동산세법 §9①2호"
      },
      {
        "minValue": 600000001,
        "maxValue": 1200000000,
        "rate": 0.010,
        "deduction": 2400000,
        "description": "6억원 초과 12억원 이하 1.0%",
        "legalBasis": "종합부동산세법 §9①3호"
      },
      {
        "minValue": 1200000001,
        "maxValue": 2500000000,
        "rate": 0.013,
        "deduction": 6000000,
        "description": "12억원 초과 25억원 이하 1.3%",
        "legalBasis": "종합부동산세법 §9①4호"
      },
      {
        "minValue": 2500000001,
        "maxValue": 5000000000,
        "rate": 0.015,
        "deduction": 11000000,
        "description": "25억원 초과 50억원 이하 1.5%",
        "legalBasis": "종합부동산세법 §9①5호"
      },
      {
        "minValue": 5000000001,
        "maxValue": 9400000000,
        "rate": 0.020,
        "deduction": 36000000,
        "description": "50억원 초과 94억원 이하 2.0%",
        "legalBasis": "종합부동산세법 §9①6호"
      },
      {
        "minValue": 9400000001,
        "rate": 0.027,
        "deduction": 101800000,
        "description": "94억원 초과 2.7%",
        "legalBasis": "종합부동산세법 §9①7호"
      }
    ]
  }',
  true
);

-- ============================================================
-- 4. 주택분 — 세부담 상한율 (종합부동산세법 §10)
-- ============================================================

-- 일반 세부담 상한 (150%)
INSERT INTO tax_rates (tax_type, category, sub_category, effective_date, rate_data, is_active)
VALUES (
  'comprehensive_property',
  'housing',
  'tax_cap_rate_general',
  '2024-01-01',
  '{
    "rate": 1.50,
    "description": "주택분 일반 세부담 상한율 150%",
    "legalBasis": "종합부동산세법 §10①"
  }',
  true
);

-- 조정대상지역 다주택 세부담 상한 (300%)
INSERT INTO tax_rates (tax_type, category, sub_category, effective_date, rate_data, is_active)
VALUES (
  'comprehensive_property',
  'housing',
  'tax_cap_rate_multi_house',
  '2024-01-01',
  '{
    "rate": 3.00,
    "description": "조정대상지역 2주택 이상 세부담 상한율 300%",
    "legalBasis": "종합부동산세법 §10②"
  }',
  true
);

-- ============================================================
-- 5. 주택분 — 1세대1주택 세액공제율 (종합부동산세법 §9②, 시행령 §4의2·§4의3)
-- ============================================================

INSERT INTO tax_rates (tax_type, category, sub_category, effective_date, rate_data, is_active)
VALUES (
  'comprehensive_property',
  'housing',
  'one_house_deduction',
  '2024-01-01',
  '{
    "maxCombinedRate": 0.80,
    "seniorRates": [
      { "minAge": 60, "maxAge": 64, "rate": 0.20, "legalBasis": "시행령 §4의2①1호" },
      { "minAge": 65, "maxAge": 69, "rate": 0.30, "legalBasis": "시행령 §4의2①2호" },
      { "minAge": 70,               "rate": 0.40, "legalBasis": "시행령 §4의2①3호" }
    ],
    "longTermRates": [
      { "minYears": 5,  "maxYears": 9,  "rate": 0.20, "legalBasis": "시행령 §4의3①1호" },
      { "minYears": 10, "maxYears": 14, "rate": 0.40, "legalBasis": "시행령 §4의3①2호" },
      { "minYears": 15,               "rate": 0.50, "legalBasis": "시행령 §4의3①3호" }
    ],
    "description": "고령자·장기보유 세액공제 (합산 최대 80%)",
    "legalBasis": "종합부동산세법 §9②"
  }',
  true
);

-- ============================================================
-- 6. 주택분 — 농어촌특별세율 (농어촌특별세법 §5①5호)
-- ============================================================

INSERT INTO tax_rates (tax_type, category, sub_category, effective_date, rate_data, is_active)
VALUES (
  'comprehensive_property',
  'housing',
  'rural_special_tax_rate',
  '2024-01-01',
  '{
    "rate": 0.20,
    "base": "determined_tax",
    "description": "주택분 종부세 결정세액의 20%",
    "legalBasis": "농어촌특별세법 §5①5호"
  }',
  true
);

-- ============================================================
-- 7. 종합합산 토지분 (종합부동산세법 §11~§13, §15)
-- ============================================================

-- 종합합산 기본공제 + 공정시장가액비율
INSERT INTO tax_rates (tax_type, category, sub_category, effective_date, rate_data, is_active)
VALUES (
  'comprehensive_property',
  'land_aggregate',
  'base_info',
  '2024-01-01',
  '{
    "basicDeduction": 500000000,
    "fairMarketRatio": 1.00,
    "taxCapRate": 1.50,
    "description": "종합합산 토지 기본공제 5억, 공정시장가액비율 100%, 세부담상한 150%",
    "legalBasis": "종합부동산세법 §12①, §15"
  }',
  true
);

-- 종합합산 토지 누진세율 3단계
INSERT INTO tax_rates (tax_type, category, sub_category, effective_date, rate_data, is_active)
VALUES (
  'comprehensive_property',
  'land_aggregate',
  'rate_brackets',
  '2024-01-01',
  '{
    "brackets": [
      {
        "maxValue": 1500000000,
        "rate": 0.01,
        "deduction": 0,
        "description": "15억원 이하 1%",
        "legalBasis": "종합부동산세법 §13①1호"
      },
      {
        "minValue": 1500000001,
        "maxValue": 4500000000,
        "rate": 0.02,
        "deduction": 15000000,
        "description": "15억원 초과 45억원 이하 2%",
        "legalBasis": "종합부동산세법 §13①2호"
      },
      {
        "minValue": 4500000001,
        "rate": 0.03,
        "deduction": 60000000,
        "description": "45억원 초과 3%",
        "legalBasis": "종합부동산세법 §13①3호"
      }
    ]
  }',
  true
);

-- 종합합산 농어촌특별세율
INSERT INTO tax_rates (tax_type, category, sub_category, effective_date, rate_data, is_active)
VALUES (
  'comprehensive_property',
  'land_aggregate',
  'rural_special_tax_rate',
  '2024-01-01',
  '{
    "rate": 0.20,
    "base": "determined_tax",
    "description": "종합합산 토지분 종부세 결정세액의 20%",
    "legalBasis": "농어촌특별세법 §5①5호"
  }',
  true
);

-- ============================================================
-- 8. 별도합산 토지분 (종합부동산세법 §12, §14)
-- ============================================================

-- 별도합산 기본공제 + 공정시장가액비율
INSERT INTO tax_rates (tax_type, category, sub_category, effective_date, rate_data, is_active)
VALUES (
  'comprehensive_property',
  'land_separate',
  'base_info',
  '2024-01-01',
  '{
    "basicDeduction": 8000000000,
    "fairMarketRatio": 1.00,
    "hasTaxCap": false,
    "description": "별도합산 토지 기본공제 80억, 공정시장가액비율 100%, 세부담상한 없음",
    "legalBasis": "종합부동산세법 §14①"
  }',
  true
);

-- 별도합산 토지 누진세율 3단계
INSERT INTO tax_rates (tax_type, category, sub_category, effective_date, rate_data, is_active)
VALUES (
  'comprehensive_property',
  'land_separate',
  'rate_brackets',
  '2024-01-01',
  '{
    "brackets": [
      {
        "maxValue": 20000000000,
        "rate": 0.005,
        "deduction": 0,
        "description": "200억원 이하 0.5%",
        "legalBasis": "종합부동산세법 §14②1호"
      },
      {
        "minValue": 20000000001,
        "maxValue": 40000000000,
        "rate": 0.006,
        "deduction": 20000000,
        "description": "200억원 초과 400억원 이하 0.6%",
        "legalBasis": "종합부동산세법 §14②2호"
      },
      {
        "minValue": 40000000001,
        "rate": 0.007,
        "deduction": 60000000,
        "description": "400억원 초과 0.7%",
        "legalBasis": "종합부동산세법 §14②3호"
      }
    ]
  }',
  true
);

-- 별도합산 농어촌특별세율
INSERT INTO tax_rates (tax_type, category, sub_category, effective_date, rate_data, is_active)
VALUES (
  'comprehensive_property',
  'land_separate',
  'rural_special_tax_rate',
  '2024-01-01',
  '{
    "rate": 0.20,
    "base": "determined_tax",
    "description": "별도합산 토지분 종부세 결정세액의 20%",
    "legalBasis": "농어촌특별세법 §5①5호"
  }',
  true
);
