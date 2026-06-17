-- Migration: 조정대상지역 DB 테이블·세율키 폐기
--
-- 조정대상지역 이력은 lib/tax-engine/data/regulated-areas.ts 정적 단일 소스로 전환됨
-- (주택법 §63조의2 고시 + 법정동코드 기반 동·읍면 단위 정밀 판정).
-- DB 테이블/세율키는 더 이상 조회되지 않는다:
--   - lib/db/regulated-areas.ts (isRegulatedArea) 삭제 — 호출처 0
--   - tax_rates 의 transfer:special:regulated_areas 시드 제거 (엔진은 정적 데이터 사용)
--   - preload_tax_rates() RPC 도 이 키를 로드하지 않음

-- 이미 시드된 미사용 세율 row 정리 (테이블 미존재 환경에서도 안전)
DELETE FROM tax_rates
WHERE tax_type = 'transfer' AND category = 'special' AND sub_category = 'regulated_areas';

-- 테이블 제거 (RLS 정책은 테이블과 함께 삭제됨)
DROP TABLE IF EXISTS regulated_areas CASCADE;
