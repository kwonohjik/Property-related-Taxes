-- Migration: calculations.tax_type CHECK 제약에 'one_house_exemption' 추가
-- 1세대1주택 비과세 **판정** 메뉴(/calc/one-house-exemption) — 세액이 아니라 비과세 여부를 판정한다
-- (소득세법 §89①3호 · 시행령 §154·§155). 결과 이력 저장 지원.
--
-- ⚠️ 런타임 영향은 없다 — 이력은 IndexedDB로 일원화돼 있어 이 테이블을 읽고 쓰는 코드가 현재 없다.
--    `LocalTaxType` union과 이 CHECK를 같은 값으로 유지해 두는 선례(20260624000001)를 따른다.

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
      'stock_valuation',
      'one_house_exemption'
    ));

COMMENT ON COLUMN calculations.tax_type IS '세목 구분. stock_transfer = 주식 양도소득세 (§94①3·§94①4), stock_valuation = 주식 평가 도구 (§63·시행령 §54), one_house_exemption = 1세대1주택 비과세 판정 (§89①3호·시행령 §154·§155)';
