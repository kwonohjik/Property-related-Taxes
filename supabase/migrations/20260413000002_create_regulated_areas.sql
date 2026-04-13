-- Migration: 조정대상지역 이력 테이블 생성
-- 비과세 판정은 취득일 기준, 중과세 판정은 양도일 기준으로 조회

CREATE TABLE regulated_areas (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_code        text NOT NULL,
  -- 법정동코드 (10자리). 시군구 단위: 앞 5자리로 매칭 가능
  area_name        text NOT NULL,
  -- 지역명 (예: '서울특별시 강남구')
  designation_date date NOT NULL,
  -- 조정대상지역 지정일
  release_date     date,
  -- 해제일 (NULL = 현재 지정 중)
  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_regulated_areas_code_date
    UNIQUE (area_code, designation_date)
);

CREATE INDEX idx_regulated_areas_lookup
  ON regulated_areas (area_code, designation_date DESC);

COMMENT ON TABLE regulated_areas IS '조정대상지역 이력 — 비과세는 취득일, 중과세는 양도일 기준 조회';
COMMENT ON COLUMN regulated_areas.area_code IS '법정동코드 10자리. 시군구 단위(앞 5자리) 매칭 사용';
COMMENT ON COLUMN regulated_areas.designation_date IS '조정대상지역 지정일';
COMMENT ON COLUMN regulated_areas.release_date IS '지역 해제일. NULL이면 현재 지정 중';
