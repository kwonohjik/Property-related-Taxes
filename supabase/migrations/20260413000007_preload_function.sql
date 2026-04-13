-- Migration: preload_tax_rates DB Function
-- DISTINCT ON은 Supabase JS 클라이언트로 사용 불가 → RPC(DB Function)로 구현
-- Orchestrator(Route Handler)에서 1회 호출로 필요한 모든 세율을 로드

CREATE OR REPLACE FUNCTION preload_tax_rates(
  p_tax_types text[],
  p_target_date date
)
RETURNS SETOF tax_rates
LANGUAGE sql STABLE
AS $$
  SELECT DISTINCT ON (tax_type, category, sub_category)
    *
  FROM tax_rates
  WHERE tax_type = ANY(p_tax_types)
    AND effective_date <= p_target_date
    AND is_active = true
  ORDER BY tax_type, category, sub_category, effective_date DESC;
$$;

COMMENT ON FUNCTION preload_tax_rates IS
  '복수 세금 타입의 세율을 1회 호출로 일괄 로드. '
  'tax_type+category+sub_category별 가장 최근 effective_date 레코드 반환. '
  'DISTINCT ON은 Supabase JS 미지원으로 DB Function으로 구현';
