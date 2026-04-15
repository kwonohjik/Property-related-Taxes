-- Seed: 상속세·증여세 세율·공제 데이터
-- 시행일 2026-01-01 기준 (상증법·조특법)
-- 멱등성: ON CONFLICT (tax_type, category, sub_category, effective_date) DO UPDATE

-- ============================================================
-- 1) 상속세 — 누진세율·세대생략할증·신고세액공제 (상증법 §26·§27·§69)
-- ============================================================
INSERT INTO tax_rates (tax_type, category, sub_category, effective_date, rate_table, special_rules)
VALUES (
  'inheritance', 'progressive_rate', '_default', '2026-01-01',
  jsonb_build_object(
    'progressive', jsonb_build_object(
      'brackets', jsonb_build_array(
        jsonb_build_object('max', 100000000,  'rate', 0.10, 'deduction', 0),
        jsonb_build_object('min', 100000001, 'max', 500000000,  'rate', 0.20, 'deduction', 10000000),
        jsonb_build_object('min', 500000001, 'max', 1000000000, 'rate', 0.30, 'deduction', 60000000),
        jsonb_build_object('min', 1000000001,'max', 3000000000, 'rate', 0.40, 'deduction', 160000000),
        jsonb_build_object('min', 3000000001,                   'rate', 0.50, 'deduction', 460000000)
      )
    ),
    'generationSkip', jsonb_build_object('defaultRate', 0.30, 'minorOver2B', 0.40),
    'filingDeduction', jsonb_build_object('rate', 0.03, 'inheritanceMonths', 6, 'giftMonths', 3)
  ),
  NULL
)
ON CONFLICT (tax_type, category, sub_category, effective_date) DO UPDATE
SET rate_table = EXCLUDED.rate_table, special_rules = EXCLUDED.special_rules;

-- ============================================================
-- 2) 증여세 — 누진세율 (상속세와 동일·상증법 §56)
-- ============================================================
INSERT INTO tax_rates (tax_type, category, sub_category, effective_date, rate_table, special_rules)
VALUES (
  'gift', 'progressive_rate', '_default', '2026-01-01',
  jsonb_build_object(
    'progressive', jsonb_build_object(
      'brackets', jsonb_build_array(
        jsonb_build_object('max', 100000000,  'rate', 0.10, 'deduction', 0),
        jsonb_build_object('min', 100000001, 'max', 500000000,  'rate', 0.20, 'deduction', 10000000),
        jsonb_build_object('min', 500000001, 'max', 1000000000, 'rate', 0.30, 'deduction', 60000000),
        jsonb_build_object('min', 1000000001,'max', 3000000000, 'rate', 0.40, 'deduction', 160000000),
        jsonb_build_object('min', 3000000001,                   'rate', 0.50, 'deduction', 460000000)
      )
    ),
    'generationSkip', jsonb_build_object('defaultRate', 0.30, 'minorOver2B', 0.40),
    'filingDeduction', jsonb_build_object('rate', 0.03, 'inheritanceMonths', 6, 'giftMonths', 3)
  ),
  NULL
)
ON CONFLICT (tax_type, category, sub_category, effective_date) DO UPDATE
SET rate_table = EXCLUDED.rate_table, special_rules = EXCLUDED.special_rules;

-- ============================================================
-- 3) 상속공제 — 인적공제·일괄공제·금융재산·동거주택·영농·가업 (상증법 §18~§23의2)
-- ============================================================
INSERT INTO tax_rates (tax_type, category, sub_category, effective_date, deduction_rules)
VALUES (
  'inheritance', 'deduction', 'personal_lump_financial', '2026-01-01',
  jsonb_build_object(
    'basic', 200000000,
    'personalDeductions', jsonb_build_object(
      'childPerPerson', 50000000,
      'minorFormula', '(20 - age) * 10000000',
      'seniorAge', 65,
      'seniorPerPerson', 50000000,
      'disabledFormula', 'lifeExpectancy * 10000000'
    ),
    'lumpSum', 500000000,
    'financial', jsonb_build_object(
      'fullExemptMax', 20000000,
      'midRangeMax', 100000000,
      'midRangeFixed', 20000000,
      'overRate', 0.20,
      'overMax', 200000000
    ),
    'cohabitation', jsonb_build_object(
      'maxDeduction', 600000000,
      'shareRate', 0.80,
      'requirements', jsonb_build_array('10year_cohabitation', 'one_house', 'heir_no_house', 'lineal_descendant', '5year_post_mgmt')
    ),
    'farming',  jsonb_build_object('maxDeduction', 2000000000,  'postMgmtYears', 5),
    'business', jsonb_build_object('maxDeduction', 60000000000, 'minMgmtYears', 10, 'postMgmtYears', jsonb_build_array(7, 10))
  )
)
ON CONFLICT (tax_type, category, sub_category, effective_date) DO UPDATE
SET deduction_rules = EXCLUDED.deduction_rules;

-- 배우자 상속공제 (§19) — 5억 ~ 30억, 법정상속분 한도
INSERT INTO tax_rates (tax_type, category, sub_category, effective_date, deduction_rules)
VALUES (
  'inheritance', 'deduction', 'spouse', '2026-01-01',
  jsonb_build_object(
    'minDeduction', 500000000,
    'maxDeduction', 3000000000,
    'requiresLegalShareLimit', true,
    'lawArticle', '상증법 §19'
  )
)
ON CONFLICT (tax_type, category, sub_category, effective_date) DO UPDATE
SET deduction_rules = EXCLUDED.deduction_rules;

-- §24 종합한도 표시용 메타
INSERT INTO tax_rates (tax_type, category, sub_category, effective_date, special_rules)
VALUES (
  'inheritance', 'special', 'deduction_limit', '2026-01-01',
  jsonb_build_object(
    'lawArticle', '상증법 §24',
    'description', '상속세 과세가액 - 사전증여재산가액(상속인) - 상속개시 전 처분재산 추정액 한도'
  )
)
ON CONFLICT (tax_type, category, sub_category, effective_date) DO UPDATE
SET special_rules = EXCLUDED.special_rules;

-- ============================================================
-- 4) 증여재산공제 — 관계별 한도 (상증법 §53·§53의2)
-- ============================================================
INSERT INTO tax_rates (tax_type, category, sub_category, effective_date, deduction_rules)
VALUES (
  'gift', 'deduction', 'relationship', '2026-01-01',
  jsonb_build_object(
    'deductions', jsonb_build_array(
      jsonb_build_object('relationship', 'spouse',                  'limit', 600000000, 'periodYears', 10),
      jsonb_build_object('relationship', 'lineal_ascendant_adult',  'limit',  50000000, 'periodYears', 10),
      jsonb_build_object('relationship', 'lineal_ascendant_minor',  'limit',  20000000, 'periodYears', 10),
      jsonb_build_object('relationship', 'lineal_descendant',       'limit',  50000000, 'periodYears', 10),
      jsonb_build_object('relationship', 'other_relative',          'limit',  10000000, 'periodYears', 10)
    ),
    'marriageBirth', jsonb_build_object(
      'limit', 100000000,
      'lawArticle', '상증법 §53의2',
      'periodMonths', jsonb_build_object('marriage', 24, 'birth', 24)
    )
  )
)
ON CONFLICT (tax_type, category, sub_category, effective_date) DO UPDATE
SET deduction_rules = EXCLUDED.deduction_rules;

-- ============================================================
-- 5) 단기재상속세액공제 — §30 (1~10년 100%→10% 차등)
-- ============================================================
INSERT INTO tax_rates (tax_type, category, sub_category, effective_date, special_rules)
VALUES (
  'inheritance', 'special', 'short_term_reinheritance', '2026-01-01',
  jsonb_build_object(
    'lawArticle', '상증법 §30',
    'creditRates', jsonb_build_array(
      jsonb_build_object('withinYears', 1,  'rate', 1.00),
      jsonb_build_object('withinYears', 2,  'rate', 0.90),
      jsonb_build_object('withinYears', 3,  'rate', 0.80),
      jsonb_build_object('withinYears', 4,  'rate', 0.70),
      jsonb_build_object('withinYears', 5,  'rate', 0.60),
      jsonb_build_object('withinYears', 6,  'rate', 0.50),
      jsonb_build_object('withinYears', 7,  'rate', 0.40),
      jsonb_build_object('withinYears', 8,  'rate', 0.30),
      jsonb_build_object('withinYears', 9,  'rate', 0.20),
      jsonb_build_object('withinYears', 10, 'rate', 0.10)
    )
  )
)
ON CONFLICT (tax_type, category, sub_category, effective_date) DO UPDATE
SET special_rules = EXCLUDED.special_rules;

-- ============================================================
-- 6) 조특법 과세특례 — 창업자금(§30의5)·가업승계(§30의6)
-- ============================================================
INSERT INTO tax_rates (tax_type, category, sub_category, effective_date, special_rules)
VALUES (
  'gift', 'special', 'startup_fund', '2026-01-01',
  jsonb_build_object(
    'lawArticle', '조특법 §30의5',
    'baseDeduction', 500000000,
    'rateBracket1', jsonb_build_object('upTo', 5000000000,  'rate', 0.10),
    'rateBracket2', jsonb_build_object('over', 5000000000,  'rate', 0.20),
    'maxAmount', 5000000000,
    'maxAmountWithJobs', 10000000000,
    'requirements', jsonb_build_array('age_under_60_donor', 'age_18_plus_donee', 'cash_or_listed_stock', 'startup_within_2years')
  )
)
ON CONFLICT (tax_type, category, sub_category, effective_date) DO UPDATE
SET special_rules = EXCLUDED.special_rules;

INSERT INTO tax_rates (tax_type, category, sub_category, effective_date, special_rules)
VALUES (
  'gift', 'special', 'family_business_succession', '2026-01-01',
  jsonb_build_object(
    'lawArticle', '조특법 §30의6',
    'baseDeduction', 1000000000,
    'rateBracket1', jsonb_build_object('upTo', 6000000000,  'rate', 0.10),
    'rateBracket2', jsonb_build_object('over', 6000000000,  'rate', 0.20),
    'maxAmount', 60000000000,
    'requirements', jsonb_build_array('family_business_10years', 'donee_age_18_plus', 'donor_age_60_plus', 'donee_management_within_5years', '7year_post_management')
  )
)
ON CONFLICT (tax_type, category, sub_category, effective_date) DO UPDATE
SET special_rules = EXCLUDED.special_rules;

-- ============================================================
-- 7) 신고세액공제 (§69) — progressive_rate 내 filingDeduction 으로 이미 포함됨
--    별도 행으로도 등록하여 단일 조회 가능
-- ============================================================
INSERT INTO tax_rates (tax_type, category, sub_category, effective_date, special_rules)
VALUES (
  'inheritance', 'special', 'filing_credit', '2026-01-01',
  jsonb_build_object(
    'lawArticle', '상증법 §69',
    'rate', 0.03,
    'deadlineMonths', 6,
    'description', '법정신고기한 내 신고 시 산출세액(외국납부·단기재상속·증여세액공제 차감 후)의 3% 공제'
  )
)
ON CONFLICT (tax_type, category, sub_category, effective_date) DO UPDATE
SET special_rules = EXCLUDED.special_rules;

INSERT INTO tax_rates (tax_type, category, sub_category, effective_date, special_rules)
VALUES (
  'gift', 'special', 'filing_credit', '2026-01-01',
  jsonb_build_object(
    'lawArticle', '상증법 §69',
    'rate', 0.03,
    'deadlineMonths', 3,
    'description', '증여일이 속하는 달의 말일부터 3개월 이내 신고 시 3% 공제'
  )
)
ON CONFLICT (tax_type, category, sub_category, effective_date) DO UPDATE
SET special_rules = EXCLUDED.special_rules;
