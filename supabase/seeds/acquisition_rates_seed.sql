-- ============================================================
-- 취득세 세율 시딩 (Acquisition Tax Rates)
-- 지방세법 제11조·제13조·제13조의2 + 농어촌특별세법 §4 + 지방세법 §151
-- effective_date: 2023-01-01 (현행 세율 기준)
-- ============================================================

-- 기존 데이터 정리 (멱등성)
DELETE FROM tax_rates
WHERE tax_type = 'acquisition'
  AND effective_date = '2023-01-01';

-- ============================================================
-- 1. 기본세율 — 주택 유상취득 (선형보간 포함)
-- 지방세법 §11①1, §11①1의2
-- ============================================================
INSERT INTO tax_rates (tax_type, category, sub_category, effective_date, rate_data, is_active)
VALUES (
  'acquisition',
  'base_rate',
  'housing_purchase',
  '2023-01-01',
  '{
    "brackets": [
      {
        "type": "fixed",
        "maxValue": 600000000,
        "rate": 0.01,
        "description": "6억 이하 주택 유상취득",
        "legalBasis": "지방세법 §11①1"
      },
      {
        "type": "linear_interpolation",
        "minValue": 600000001,
        "maxValue": 899999999,
        "minRate": 0.01,
        "maxRate": 0.03,
        "formula": "(value * 2 / 300000000 - 3) / 100",
        "precision": 5,
        "description": "6억 초과 9억 미만 주택 유상취득 선형보간",
        "legalBasis": "지방세법 §11①1의2"
      },
      {
        "type": "fixed",
        "minValue": 900000000,
        "rate": 0.03,
        "description": "9억 이상 주택 유상취득",
        "legalBasis": "지방세법 §11①1"
      }
    ]
  }',
  true
);

-- ============================================================
-- 2. 기본세율 — 주택 상속 (2.8%)
-- 지방세법 §11①5
-- ============================================================
INSERT INTO tax_rates (tax_type, category, sub_category, effective_date, rate_data, is_active)
VALUES (
  'acquisition',
  'base_rate',
  'housing_inheritance',
  '2023-01-01',
  '{
    "rate": 0.028,
    "description": "주택 상속 취득",
    "legalBasis": "지방세법 §11①5"
  }',
  true
);

-- ============================================================
-- 3. 기본세율 — 농지 상속 (2.3%)
-- 지방세법 §11①5 단서
-- ============================================================
INSERT INTO tax_rates (tax_type, category, sub_category, effective_date, rate_data, is_active)
VALUES (
  'acquisition',
  'base_rate',
  'farmland_inheritance',
  '2023-01-01',
  '{
    "rate": 0.023,
    "description": "농지(전·답·과수원) 상속 취득 특례",
    "legalBasis": "지방세법 §11①5 단서"
  }',
  true
);

-- ============================================================
-- 4. 기본세율 — 주택 증여 (3.5%)
-- 지방세법 §11①7
-- ============================================================
INSERT INTO tax_rates (tax_type, category, sub_category, effective_date, rate_data, is_active)
VALUES (
  'acquisition',
  'base_rate',
  'housing_gift',
  '2023-01-01',
  '{
    "rate": 0.035,
    "description": "주택 증여 취득",
    "legalBasis": "지방세법 §11①7"
  }',
  true
);

-- ============================================================
-- 5. 기본세율 — 원시취득 (2.8%)
-- 지방세법 §11①3
-- ============================================================
INSERT INTO tax_rates (tax_type, category, sub_category, effective_date, rate_data, is_active)
VALUES (
  'acquisition',
  'base_rate',
  'original_construction',
  '2023-01-01',
  '{
    "rate": 0.028,
    "description": "주택 원시취득 (신축·증축·개축)",
    "legalBasis": "지방세법 §11①3"
  }',
  true
);

-- ============================================================
-- 6. 기본세율 — 농지 유상취득 (3%)
-- 지방세법 §11①1
-- ============================================================
INSERT INTO tax_rates (tax_type, category, sub_category, effective_date, rate_data, is_active)
VALUES (
  'acquisition',
  'base_rate',
  'farmland_purchase',
  '2023-01-01',
  '{
    "rate": 0.03,
    "description": "농지(전·답·과수원) 유상취득",
    "legalBasis": "지방세법 §11①1"
  }',
  true
);

-- ============================================================
-- 7. 기본세율 — 토지(농지 외) 유상취득 (4%)
-- 지방세법 §11①7
-- ============================================================
INSERT INTO tax_rates (tax_type, category, sub_category, effective_date, rate_data, is_active)
VALUES (
  'acquisition',
  'base_rate',
  'land_purchase',
  '2023-01-01',
  '{
    "rate": 0.04,
    "description": "일반 토지 유상취득",
    "legalBasis": "지방세법 §11①7"
  }',
  true
);

-- ============================================================
-- 8. 기본세율 — 비주거용 건물 유상취득 (4%)
-- 지방세법 §11①7
-- ============================================================
INSERT INTO tax_rates (tax_type, category, sub_category, effective_date, rate_data, is_active)
VALUES (
  'acquisition',
  'base_rate',
  'building_purchase',
  '2023-01-01',
  '{
    "rate": 0.04,
    "description": "비주거용 건물 유상취득",
    "legalBasis": "지방세법 §11①7"
  }',
  true
);

-- ============================================================
-- 9. 기본세율 — 회원권·기타 (4%)
-- 지방세법 §11①8
-- ============================================================
INSERT INTO tax_rates (tax_type, category, sub_category, effective_date, rate_data, is_active)
VALUES (
  'acquisition',
  'base_rate',
  'membership_other',
  '2023-01-01',
  '{
    "rate": 0.04,
    "description": "골프·승마·콘도·종합체육·요트 회원권, 기타 과세물건",
    "legalBasis": "지방세법 §11①8"
  }',
  true
);

-- ============================================================
-- 10. 중과세 — 조정대상지역 2주택 (8%)
-- 지방세법 §13②1
-- ============================================================
INSERT INTO tax_rates (tax_type, category, sub_category, effective_date, rate_data, is_active)
VALUES (
  'acquisition',
  'surcharge',
  'regulated_2house',
  '2023-01-01',
  '{
    "rate": 0.08,
    "condition": "조정대상지역 내 2번째 주택 취득 (기존 1주택 보유 상태)",
    "exceptions": [
      "시가표준액 1억 원 이하 주택",
      "인구감소지역 내 주택",
      "공시가격 1억 원 이하 주택"
    ],
    "suspendedUntil": null,
    "legalBasis": "지방세법 §13②1"
  }',
  true
);

-- ============================================================
-- 11. 중과세 — 조정대상지역 3주택 이상 (12%)
-- 지방세법 §13②2
-- ============================================================
INSERT INTO tax_rates (tax_type, category, sub_category, effective_date, rate_data, is_active)
VALUES (
  'acquisition',
  'surcharge',
  'regulated_3house_plus',
  '2023-01-01',
  '{
    "rate": 0.12,
    "condition": "조정대상지역 내 3번째 이상 주택 취득",
    "exceptions": [
      "시가표준액 1억 원 이하 주택",
      "인구감소지역 내 주택",
      "공시가격 1억 원 이하 주택"
    ],
    "suspendedUntil": null,
    "legalBasis": "지방세법 §13②2"
  }',
  true
);

-- ============================================================
-- 12. 중과세 — 법인 주택 취득 (12%)
-- 지방세법 §13의2
-- ============================================================
INSERT INTO tax_rates (tax_type, category, sub_category, effective_date, rate_data, is_active)
VALUES (
  'acquisition',
  'surcharge',
  'corporate_housing',
  '2023-01-01',
  '{
    "rate": 0.12,
    "condition": "법인의 주택 유상·원시취득 (조합원입주권 포함)",
    "exceptions": [
      "지방이전 공공기관의 주택 취득",
      "주택건설사업자가 취득 즉시 분양하는 주택",
      "공공주택사업자 취득 주택",
      "미분양주택 매입 (시행령 요건 충족)"
    ],
    "legalBasis": "지방세법 §13의2"
  }',
  true
);

-- ============================================================
-- 13. 중과세 — 사치성재산 (별장·골프장·고급오락장·고급선박)
-- 지방세법 §13①
-- ============================================================
INSERT INTO tax_rates (tax_type, category, sub_category, effective_date, rate_data, is_active)
VALUES (
  'acquisition',
  'surcharge',
  'luxury_property',
  '2023-01-01',
  '{
    "surchargeAdditionalRate": 0.04,
    "luxuryTypes": {
      "villa": {
        "description": "별장 (주거용 건물로서 상시 거주 목적 아닌 것)",
        "additionalRate": 0.04,
        "legalBasis": "지방세법 §13①1"
      },
      "golf_course": {
        "description": "골프장 (회원제)",
        "additionalRate": 0.04,
        "legalBasis": "지방세법 §13①2"
      },
      "luxury_entertainment": {
        "description": "고급오락장 (카지노·도박장·유흥주점 등)",
        "additionalRate": 0.04,
        "legalBasis": "지방세법 §13①3"
      },
      "luxury_vessel": {
        "description": "고급선박",
        "additionalRate": 0.04,
        "legalBasis": "지방세법 §13①4"
      }
    },
    "legalBasis": "지방세법 §13①"
  }',
  true
);

-- ============================================================
-- 14. 부가세 설정 — 농어촌특별세 + 지방교육세
-- 농어촌특별세법 §4 + 지방세법 §151
-- ============================================================
INSERT INTO tax_rates (tax_type, category, sub_category, effective_date, rate_data, is_active)
VALUES (
  'acquisition',
  'additional',
  'additional_taxes',
  '2023-01-01',
  '{
    "ruralSpecialTax": {
      "standardRate": 0.02,
      "surchargeRate": 0.10,
      "areaExemptThresholdSqm": 85,
      "description": "취득세 표준세율(2%) 초과분 × 10%, 85㎡ 이하 주택 면제",
      "legalBasis": "농어촌특별세법 §4"
    },
    "localEducationTax": {
      "baseRate": 0.02,
      "rate": 0.20,
      "description": "취득세 표준세율(2%) 기준 세액 × 20% (중과세에도 표준세율 기준)",
      "legalBasis": "지방세법 §151"
    }
  }',
  true
);

-- ============================================================
-- 15. 생애최초 주택 취득 감면
-- 지방세특례제한법 §36의3
-- ============================================================
INSERT INTO tax_rates (tax_type, category, sub_category, effective_date, rate_data, is_active)
VALUES (
  'acquisition',
  'exemption',
  'first_home',
  '2023-01-01',
  '{
    "reductionRate": 1.0,
    "maxReductionAmount": 2000000,
    "metropolitanPriceLimit": 400000000,
    "nonMetropolitanPriceLimit": 300000000,
    "conditions": [
      "본인·배우자 모두 주택 미보유",
      "소득요건 충족 (부부합산 소득 기준)",
      "취득 후 3개월 이내 전입신고"
    ],
    "clawbackConditions": [
      "취득 후 3개월 이내 미전입",
      "3년 이내 매도·임대·임시사용",
      "3년 이내 타 용도 사용"
    ],
    "description": "생애최초 주택 구입자 취득세 감면",
    "legalBasis": "지방세특례제한법 §36의3"
  }',
  true
);

-- ============================================================
-- 16. 시가표준액 — 건물 경과연수별 잔가율
-- 지방세법 시행령 §4의2
-- ============================================================
INSERT INTO tax_rates (tax_type, category, sub_category, effective_date, rate_data, is_active)
VALUES (
  'acquisition',
  'standard_price',
  'depreciation_table',
  '2023-01-01',
  '{
    "depreciationTable": [
      { "yearsMax": 1,  "rate": 1.000 },
      { "yearsMax": 2,  "rate": 0.968 },
      { "yearsMax": 3,  "rate": 0.935 },
      { "yearsMax": 4,  "rate": 0.903 },
      { "yearsMax": 5,  "rate": 0.870 },
      { "yearsMax": 6,  "rate": 0.846 },
      { "yearsMax": 7,  "rate": 0.822 },
      { "yearsMax": 8,  "rate": 0.798 },
      { "yearsMax": 9,  "rate": 0.774 },
      { "yearsMax": 10, "rate": 0.750 },
      { "yearsMax": 11, "rate": 0.728 },
      { "yearsMax": 12, "rate": 0.706 },
      { "yearsMax": 13, "rate": 0.684 },
      { "yearsMax": 14, "rate": 0.662 },
      { "yearsMax": 15, "rate": 0.640 },
      { "yearsMax": 16, "rate": 0.620 },
      { "yearsMax": 17, "rate": 0.600 },
      { "yearsMax": 18, "rate": 0.580 },
      { "yearsMax": 19, "rate": 0.560 },
      { "yearsMax": 20, "rate": 0.540 },
      { "yearsMax": 21, "rate": 0.520 },
      { "yearsMax": 22, "rate": 0.500 },
      { "yearsMax": 23, "rate": 0.480 },
      { "yearsMax": 24, "rate": 0.460 },
      { "yearsMax": 25, "rate": 0.440 },
      { "yearsMax": 26, "rate": 0.422 },
      { "yearsMax": 27, "rate": 0.404 },
      { "yearsMax": 28, "rate": 0.386 },
      { "yearsMax": 29, "rate": 0.368 },
      { "yearsMax": 30, "rate": 0.350 },
      { "yearsMax": null, "rate": 0.350, "note": "30년 초과 최저 잔가율" }
    ],
    "description": "건물 경과연수별 잔가율 테이블",
    "legalBasis": "지방세법 시행령 §4의2"
  }',
  true
);

-- ============================================================
-- 17. 시가표준액 — 구조지수
-- 행정안전부 고시 기준
-- ============================================================
INSERT INTO tax_rates (tax_type, category, sub_category, effective_date, rate_data, is_active)
VALUES (
  'acquisition',
  'standard_price',
  'structure_index',
  '2023-01-01',
  '{
    "structureIndex": {
      "RC":     1.00,
      "SRC":    1.10,
      "steel":  0.90,
      "wood":   0.65,
      "light_steel": 0.80,
      "masonry": 0.70,
      "other":  0.75
    },
    "description": "건물 시가표준액 구조지수 (행안부 고시)",
    "legalBasis": "지방세법 §4①3호, 행정안전부 고시"
  }',
  true
);

-- ============================================================
-- 18. 시가표준액 — 용도지수
-- 행정안전부 고시 기준
-- ============================================================
INSERT INTO tax_rates (tax_type, category, sub_category, effective_date, rate_data, is_active)
VALUES (
  'acquisition',
  'standard_price',
  'usage_index',
  '2023-01-01',
  '{
    "usageIndex": {
      "residential":  1.00,
      "office":       1.05,
      "retail":       1.00,
      "factory":      0.70,
      "warehouse":    0.60,
      "lodging":      0.90,
      "medical":      1.05,
      "education":    0.90,
      "culture":      0.85,
      "religious":    0.80,
      "other":        0.80
    },
    "description": "건물 시가표준액 용도지수 (행안부 고시)",
    "legalBasis": "지방세법 §4①3호, 행정안전부 고시"
  }',
  true
);

-- ============================================================
-- 19. 과세표준 결정 규칙 (특수관계인 정상가격 범위)
-- 지방세법 §10의2, 시행령 §18의2
-- ============================================================
INSERT INTO tax_rates (tax_type, category, sub_category, effective_date, rate_data, is_active)
VALUES (
  'acquisition',
  'tax_base',
  'related_party_criteria',
  '2023-01-01',
  '{
    "normalPriceMinRatio": 0.70,
    "normalPriceMaxRatio": 1.30,
    "appraisalValidMonthsInheritance": 6,
    "appraisalValidMonthsGift": 3,
    "truncationUnit": 1000,
    "description": "특수관계인 간 거래 정상가격 범위 (시가의 70%~130%), 절사 단위",
    "legalBasis": "지방세법 §10의2, 시행령 §18의2"
  }',
  true
);
