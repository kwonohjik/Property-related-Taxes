-- Migration: calculations.tax_type CHECK 제약에 'stock_valuation' 추가
-- 주식 평가 독립 도구(/tools/stock-valuation) — 상장·비상장주식 보충적 평가(§63·시행령 §54) 결과 이력 저장 지원

ALTER TABLE calculations
  DROP CONSTRAINT IF EXISTS chk_calculations_tax_type;

ALTER TABLE calculations
  ADD CONSTRAINT chk_calculations_tax_type
    CHECK (tax_type IN (
      'transfer',
      'inheritance',
      'gift',
      'acquisition',
      'property',
      'comprehensive_property',
      'stock_transfer',
      'stock_valuation'
    ));

COMMENT ON COLUMN calculations.tax_type IS '세목 구분. stock_transfer = 주식 양도소득세 (§94①3·§94①4), stock_valuation = 주식 평가 도구 (§63·시행령 §54)';
