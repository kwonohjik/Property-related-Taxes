-- Migration: 기준시가 테이블 생성
-- 오피스텔·상업용 건물 기준시가 (공동주택/토지/단독주택은 공공 API 조회)

CREATE TABLE standard_prices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  price_type      text NOT NULL,
  -- 'officetel' | 'commercial' (공동주택/토지/단독주택은 외부 API 조회)
  address_code    text NOT NULL,
  -- 법정동코드
  detail_address  text NOT NULL,
  -- 동/호 상세
  reference_date  date NOT NULL,
  -- 기준일 (공시 기준년도)
  price           bigint NOT NULL,
  -- 기준시가 (원 단위 정수)
  area_sqm        numeric(10, 2),
  -- 면적 (㎡)
  source          text NOT NULL DEFAULT 'data_go_kr_file',
  -- 데이터 출처
  raw_data        jsonb,
  -- 원본 공시 데이터 (보존용)
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_standard_prices_address_date
    UNIQUE (address_code, detail_address, reference_date),

  CONSTRAINT chk_price_type
    CHECK (price_type IN ('officetel', 'commercial')),

  CONSTRAINT chk_price_positive
    CHECK (price > 0)
);

CREATE INDEX idx_standard_prices_lookup
  ON standard_prices (address_code, reference_date DESC);

COMMENT ON TABLE standard_prices IS '오피스텔·상업용 건물 기준시가. 공동주택/토지/단독은 외부 API 조회';
COMMENT ON COLUMN standard_prices.price IS '기준시가 (원 단위 정수). bigint 사용';
COMMENT ON COLUMN standard_prices.reference_date IS '공시 기준년도 기준일';
