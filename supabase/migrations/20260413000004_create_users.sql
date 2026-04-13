-- Migration: 사용자 프로필 테이블 생성 (Supabase Auth 확장)
-- auth.users와 1:1 관계. 회원가입 시 트리거로 자동 생성

CREATE TABLE users (
  id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE users IS 'Supabase Auth 사용자 프로필 확장. auth.users와 1:1 관계';
COMMENT ON COLUMN users.display_name IS '표시 이름. 소셜 로그인 시 full_name, 이메일 로그인 시 email 사용';

-- Auth trigger: 회원가입 시 자동 프로필 생성
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
