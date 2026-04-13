-- Migration: 계산 이력 테이블 생성
-- 로그인 사용자의 세금 계산 이력 저장. 사용자당 최대 200건

CREATE TABLE calculations (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tax_type                text NOT NULL,
  -- 'transfer' | 'inheritance' | 'gift' | 'acquisition' | 'property' | 'comprehensive_property'
  input_data              jsonb NOT NULL,
  -- 사용자 입력 조건 (Orchestrator에서 Zod 검증 후 저장)
  result_data             jsonb NOT NULL,
  -- 계산 결과 상세 (세액, 중간값, 적용 세율 등)
  tax_law_version         text NOT NULL,
  -- 적용된 세율의 effective_date (추적용). 예: '2023-01-01'
  linked_calculation_id   uuid REFERENCES calculations(id),
  -- 재산세↔종부세 연동 시 상호 참조 (nullable)
  created_at              timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_calculations_tax_type
    CHECK (tax_type IN ('transfer', 'inheritance', 'gift', 'acquisition', 'property', 'comprehensive_property')),

  CONSTRAINT chk_input_data_object
    CHECK (jsonb_typeof(input_data) = 'object'),

  CONSTRAINT chk_result_data_object
    CHECK (jsonb_typeof(result_data) = 'object')
);

CREATE INDEX idx_calculations_user
  ON calculations (user_id, created_at DESC);

COMMENT ON TABLE calculations IS '세금 계산 이력. 로그인 사용자만 저장 가능. 사용자당 200건 상한';
COMMENT ON COLUMN calculations.tax_law_version IS '적용된 세율 effective_date (세율 추적용)';
COMMENT ON COLUMN calculations.linked_calculation_id IS '재산세↔종부세 연동 계산 참조 (nullable)';
