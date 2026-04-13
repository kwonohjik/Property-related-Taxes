-- Migration: Row Level Security 정책 설정
-- 세율/지역/기준시가: 전체 SELECT 허용, 수정은 service_role만
-- 계산이력/사용자: 본인 데이터만 CRUD

-- tax_rates: 전체 읽기, 수정은 service_role만
ALTER TABLE tax_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tax_rates_select" ON tax_rates
  FOR SELECT USING (true);
-- INSERT/UPDATE/DELETE는 RLS로 차단 → service_role key로만 가능

-- regulated_areas: 전체 읽기, 수정은 service_role만
ALTER TABLE regulated_areas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "regulated_areas_select" ON regulated_areas
  FOR SELECT USING (true);

-- standard_prices: 전체 읽기, 수정은 service_role만
ALTER TABLE standard_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "standard_prices_select" ON standard_prices
  FOR SELECT USING (true);

-- calculations: 본인 데이터만 CRUD
ALTER TABLE calculations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "calculations_own" ON calculations
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- users: 본인 프로필만 읽기/수정
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own" ON users
  FOR ALL USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
