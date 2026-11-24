-- Migration: calculations.tax_type CHECK 제약에 'non_business_land_judgment' 추가
-- 비사업용 토지 판정 메뉴(/calc/non-business-land) — 세액이 아니라 사업용·비사업용 여부를 판정한다
-- (소득세법 §104의3·시행령 §168의6~§168의14). 결과 이력 저장 지원.
--
-- ⚠️ 런타임 영향은 없다 — 이력은 IndexedDB로 일원화돼 있어 이 테이블을 읽고 쓰는 코드가 현재 없다.
--    `LocalTaxType` union과 이 CHECK를 같은 값으로 유지해 두는 선례(20260921000001 · 20260928000001)를 따른다.
-- ⚠️ 이 파일은 작성만 했고 어느 DB에도 적용하지 않았다.

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
      'one_house_exemption',
      'gift_deemed',
      'non_business_land_judgment'
    ));

COMMENT ON COLUMN calculations.tax_type IS '세목 구분. stock_transfer = 주식 양도소득세 (§94①3·§94①4), stock_valuation = 주식 평가 도구 (§63·시행령 §54), one_house_exemption = 1세대1주택 비과세 판정 (§89①3호·시행령 §154·§155), gift_deemed = 증여이익 산정 (상증법 §33~§45의5), non_business_land_judgment = 비사업용 토지 판정 (소득세법 §104의3·시행령 §168의6~§168의14)';
