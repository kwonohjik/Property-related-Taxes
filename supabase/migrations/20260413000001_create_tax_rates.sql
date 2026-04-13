-- Migration: 통합 세율 테이블 생성
-- 6대 세금(양도소득세, 상속세, 증여세, 취득세, 재산세, 종합부동산세)의
-- 세율·공제·감면·중과세·특례를 하나의 테이블에서 관리

CREATE TABLE tax_rates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_type        text NOT NULL,
  -- 'transfer' | 'inheritance' | 'gift' | 'acquisition' | 'property' | 'comprehensive_property'

  category        text NOT NULL,
  -- 'progressive_rate' | 'deduction' | 'surcharge' | 'special' | 'fair_market_ratio'

  sub_category    text NOT NULL DEFAULT '_default',
  -- 동일 category 내 세부 규칙 구분 키
  -- deduction: 'long_term_holding', 'basic', 'self_farming', 'long_term_rental', 'new_housing', 'unsold_housing'
  -- surcharge: '_default'
  -- special: 'one_house_exemption', 'suspension'
  -- progressive_rate, fair_market_ratio: '_default'

  effective_date  date NOT NULL,
  -- 세율 시행일. 조회: effective_date <= targetDate 중 가장 최근 레코드

  rate_table      jsonb,
  -- 구간별 세율 데이터 (progressive_rate, surcharge, fair_market_ratio)
  -- 예: { "brackets": [{ "min": 0, "max": 14000000, "rate": 0.06, "deduction": 0 }, ...] }

  deduction_rules jsonb,
  -- 공제/감면 규칙 (deduction)
  -- 예: { "type": "long_term_holding", "general": { "ratePerYear": 0.02, ... }, ... }

  special_rules   jsonb,
  -- 중과세/특례/유예 규칙 (surcharge의 유예 정보, special)
  -- 예: { "surcharge_suspended": true, "suspended_until": "2026-05-09" }

  is_active       boolean NOT NULL DEFAULT true,
  -- 관리용 플래그. 조회 시 is_active = true 필터

  created_at      timestamptz NOT NULL DEFAULT now(),

  -- jsonb 최소 구조 검증 (주 검증은 Zod, 이것은 보조)
  CONSTRAINT chk_rate_table_structure
    CHECK (rate_table IS NULL OR jsonb_typeof(rate_table) = 'object'),
  CONSTRAINT chk_deduction_rules_structure
    CHECK (deduction_rules IS NULL OR jsonb_typeof(deduction_rules) = 'object'),
  CONSTRAINT chk_special_rules_structure
    CHECK (special_rules IS NULL OR jsonb_typeof(special_rules) = 'object'),

  -- tax_type 허용값 검증
  CONSTRAINT chk_tax_type
    CHECK (tax_type IN ('transfer', 'inheritance', 'gift', 'acquisition', 'property', 'comprehensive_property')),

  -- category 허용값 검증
  CONSTRAINT chk_category
    CHECK (category IN ('progressive_rate', 'deduction', 'surcharge', 'special', 'fair_market_ratio')),

  -- 복합 유니크 제약: 동일 세금 타입+카테고리+세부키+시행일에 중복 방지
  CONSTRAINT uq_tax_rates_type_category_sub_date
    UNIQUE (tax_type, category, sub_category, effective_date)
);

-- 조회 최적화 인덱스 (is_active = true 부분 인덱스)
CREATE INDEX idx_tax_rates_lookup
  ON tax_rates (tax_type, category, sub_category, effective_date DESC)
  WHERE is_active = true;

COMMENT ON TABLE tax_rates IS '6대 세금 통합 세율 테이블 — 세법 개정 시 행 추가로 대응';
COMMENT ON COLUMN tax_rates.effective_date IS '세율 시행일. 조회 시 effective_date <= targetDate 중 최신';
COMMENT ON COLUMN tax_rates.sub_category IS '동일 category 내 세부 규칙 구분 키. 단일 규칙만 존재하면 _default';
COMMENT ON COLUMN tax_rates.rate_table IS 'jsonb — 누진세율/중과세율/공정시장가액비율. Zod safeParse로 타입 검증 필수';
COMMENT ON COLUMN tax_rates.deduction_rules IS 'jsonb — 공제/감면 규칙. Zod safeParse로 타입 검증 필수';
COMMENT ON COLUMN tax_rates.special_rules IS 'jsonb — 특례/유예/경과규정. Zod safeParse로 타입 검증 필수';
