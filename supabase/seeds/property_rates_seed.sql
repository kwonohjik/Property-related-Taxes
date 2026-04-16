-- ============================================================
-- 재산세 세율 시딩 (Property Tax Rates)
-- 지방세법 §111(세율) §110(공정시장가액비율) §122(세부담상한)
--           §112(도시지역분) §146(지역자원시설세) §151(지방교육세)
-- effective_date: 2024-01-01 (현행 세율 기준)
-- ============================================================

-- 기존 데이터 정리 (멱등성)
DELETE FROM tax_rates
WHERE tax_type = 'property'
  AND effective_date = '2024-01-01';

-- ============================================================
-- 1. 주택 표준세율 — 일반 4구간 (지방세법 §111①1)
-- ============================================================
INSERT INTO tax_rates (tax_type, category, sub_category, effective_date, rate_data, is_active)
VALUES (
  'property',
  'housing_rate',
  'general',
  '2024-01-01',
  '{
    "brackets": [
      {
        "maxValue": 60000000,
        "rate": 0.001,
        "deduction": 0,
        "description": "6천만원 이하",
        "legalBasis": "지방세법 §111①1가"
      },
      {
        "minValue": 60000001,
        "maxValue": 150000000,
        "rate": 0.0015,
        "deduction": 30000,
        "description": "6천만원 초과 1억5천만원 이하",
        "legalBasis": "지방세법 §111①1나"
      },
      {
        "minValue": 150000001,
        "maxValue": 300000000,
        "rate": 0.0025,
        "deduction": 180000,
        "description": "1억5천만원 초과 3억원 이하",
        "legalBasis": "지방세법 §111①1다"
      },
      {
        "minValue": 300000001,
        "rate": 0.004,
        "deduction": 630000,
        "description": "3억원 초과",
        "legalBasis": "지방세법 §111①1라"
      }
    ]
  }',
  true
);

-- ============================================================
-- 2. 주택 1세대1주택 특례세율 — 4구간 (지방세법 §111③)
--    공시가격 9억원 이하 1세대 1주택에 한정 적용
-- ============================================================
INSERT INTO tax_rates (tax_type, category, sub_category, effective_date, rate_data, is_active)
VALUES (
  'property',
  'housing_rate',
  'one_household_special',
  '2024-01-01',
  '{
    "applicableThreshold": 900000000,
    "brackets": [
      {
        "maxValue": 60000000,
        "rate": 0.0005,
        "deduction": 0,
        "description": "6천만원 이하 — 1세대1주택 특례",
        "legalBasis": "지방세법 §111③"
      },
      {
        "minValue": 60000001,
        "maxValue": 150000000,
        "rate": 0.001,
        "deduction": 30000,
        "description": "6천만원 초과 1억5천만원 이하 — 1세대1주택 특례",
        "legalBasis": "지방세법 §111③"
      },
      {
        "minValue": 150000001,
        "maxValue": 300000000,
        "rate": 0.002,
        "deduction": 180000,
        "description": "1억5천만원 초과 3억원 이하 — 1세대1주택 특례",
        "legalBasis": "지방세법 §111③"
      },
      {
        "minValue": 300000001,
        "rate": 0.0035,
        "deduction": 630000,
        "description": "3억원 초과 — 1세대1주택 특례",
        "legalBasis": "지방세법 §111③"
      }
    ]
  }',
  true
);

-- ============================================================
-- 3. 공정시장가액비율 (지방세법 §110)
-- ============================================================
INSERT INTO tax_rates (tax_type, category, sub_category, effective_date, rate_data, is_active)
VALUES (
  'property',
  'fair_market_ratio',
  'housing',
  '2024-01-01',
  '{
    "ratio": 0.60,
    "description": "주택 공정시장가액비율 60%",
    "legalBasis": "지방세법 §110①"
  }',
  true
);

INSERT INTO tax_rates (tax_type, category, sub_category, effective_date, rate_data, is_active)
VALUES (
  'property',
  'fair_market_ratio',
  'land_building',
  '2024-01-01',
  '{
    "ratio": 0.70,
    "description": "토지·건축물 공정시장가액비율 70%",
    "legalBasis": "지방세법 §110②"
  }',
  true
);

-- ============================================================
-- 4. 건축물 세율 (지방세법 §111①2)
-- ============================================================
INSERT INTO tax_rates (tax_type, category, sub_category, effective_date, rate_data, is_active)
VALUES (
  'property',
  'building_rate',
  'general',
  '2024-01-01',
  '{
    "rate": 0.0025,
    "description": "건축물 일반세율 0.25%",
    "legalBasis": "지방세법 §111①2가"
  }',
  true
);

INSERT INTO tax_rates (tax_type, category, sub_category, effective_date, rate_data, is_active)
VALUES (
  'property',
  'building_rate',
  'luxury',
  '2024-01-01',
  '{
    "rate": 0.04,
    "description": "골프장·고급오락장 4%",
    "legalBasis": "지방세법 §111①2나"
  }',
  true
);

INSERT INTO tax_rates (tax_type, category, sub_category, effective_date, rate_data, is_active)
VALUES (
  'property',
  'building_rate',
  'factory',
  '2024-01-01',
  '{
    "rate": 0.005,
    "description": "도시지역 내 공장용 건축물 0.5%",
    "legalBasis": "지방세법 §111①2다"
  }',
  true
);

-- ============================================================
-- 5. 세부담상한 (지방세법 §122)
-- ============================================================
INSERT INTO tax_rates (tax_type, category, sub_category, effective_date, rate_data, is_active)
VALUES (
  'property',
  'tax_cap',
  'housing',
  '2024-01-01',
  '{
    "brackets": [
      {
        "maxPublishedPrice": 300000000,
        "capRate": 1.05,
        "description": "공시가격 3억 이하 105%",
        "legalBasis": "지방세법 §122①1"
      },
      {
        "minPublishedPrice": 300000001,
        "maxPublishedPrice": 600000000,
        "capRate": 1.10,
        "description": "공시가격 3억 초과 6억 이하 110%",
        "legalBasis": "지방세법 §122①2"
      },
      {
        "minPublishedPrice": 600000001,
        "capRate": 1.30,
        "description": "공시가격 6억 초과 130%",
        "legalBasis": "지방세법 §122①3"
      }
    ]
  }',
  true
);

INSERT INTO tax_rates (tax_type, category, sub_category, effective_date, rate_data, is_active)
VALUES (
  'property',
  'tax_cap',
  'land',
  '2024-01-01',
  '{
    "capRate": 1.50,
    "description": "토지 세부담상한 150%",
    "legalBasis": "지방세법 §122②"
  }',
  true
);

-- ============================================================
-- 6. 지역자원시설세 — 건축물 4구간 누진 (지방세법 §146②)
--    시가표준액 기준 과세 (공정시장가액비율 미적용)
-- ============================================================
INSERT INTO tax_rates (tax_type, category, sub_category, effective_date, rate_data, is_active)
VALUES (
  'property',
  'regional_resource_tax',
  'building',
  '2024-01-01',
  '{
    "brackets": [
      {
        "maxValue": 600000000,
        "rate": 0.00004,
        "deduction": 0,
        "description": "6억 이하 0.04‰",
        "legalBasis": "지방세법 §146②1"
      },
      {
        "minValue": 600000001,
        "maxValue": 1300000000,
        "rate": 0.00005,
        "deduction": 6000,
        "description": "6억 초과 13억 이하 0.05‰",
        "legalBasis": "지방세법 §146②2"
      },
      {
        "minValue": 1300000001,
        "maxValue": 2600000000,
        "rate": 0.00006,
        "deduction": 19000,
        "description": "13억 초과 26억 이하 0.06‰",
        "legalBasis": "지방세법 §146②3"
      },
      {
        "minValue": 2600000001,
        "rate": 0.00007,
        "deduction": 45000,
        "description": "26억 초과 0.07‰",
        "legalBasis": "지방세법 §146②4"
      }
    ]
  }',
  true
);

-- ============================================================
-- 7. 부가세율 (지방교육세·도시지역분)
-- ============================================================
INSERT INTO tax_rates (tax_type, category, sub_category, effective_date, rate_data, is_active)
VALUES (
  'property',
  'surtax',
  'local_education_tax',
  '2024-01-01',
  '{
    "rate": 0.20,
    "base": "property_tax",
    "description": "지방교육세 = 재산세 × 20%",
    "legalBasis": "지방세법 §151"
  }',
  true
);

INSERT INTO tax_rates (tax_type, category, sub_category, effective_date, rate_data, is_active)
VALUES (
  'property',
  'surtax',
  'urban_area_tax',
  '2024-01-01',
  '{
    "rate": 0.0014,
    "base": "tax_base",
    "description": "도시지역분 = 과세표준 × 0.14% (도시지역 한정)",
    "legalBasis": "지방세법 §112"
  }',
  true
);

-- ============================================================
-- 8. 분납 기준 (지방세법 §115)
-- ============================================================
INSERT INTO tax_rates (tax_type, category, sub_category, effective_date, rate_data, is_active)
VALUES (
  'property',
  'installment',
  'threshold',
  '2024-01-01',
  '{
    "threshold": 200000,
    "description": "재산세 산출세액 20만원 초과 시 분납 가능 (7월·9월 균등 분납)",
    "legalBasis": "지방세법 §115"
  }',
  true
);
