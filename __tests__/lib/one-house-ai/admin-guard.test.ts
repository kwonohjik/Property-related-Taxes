/** 관리자 게이트 — 허용 목록 · 설정 없음 · 비로그인 · 목록 밖. Supabase 세션은 모의한다. */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const getUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser } }) }));
const { checkOneHouseAiAdmin, oneHouseAiAdminEmails } = await import("@/lib/one-house-ai/admin-guard");

const ENV = ["ONE_HOUSE_AI_ADMIN_EMAILS", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const;
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
beforeEach(() => {
  process.env.ONE_HOUSE_AI_ADMIN_EMAILS = " Admin@Example.com , second@example.com ";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.test";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
});
afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.clearAllMocks();
});

describe("관리자 게이트", () => {
  it("허용 목록은 쉼표 구분 · 공백·대소문자 무시", () => {
    expect([...oneHouseAiAdminEmails(" A@x.com, ,b@Y.com ")]).toEqual(["a@x.com", "b@y.com"]);
  });
  it("목록 안 이메일이면 통과(대소문자 무시)", async () => {
    getUser.mockResolvedValue({ data: { user: { email: "admin@example.COM" } } });
    expect(await checkOneHouseAiAdmin()).toEqual({ ok: true, email: "admin@example.com" });
  });
  it("목록 밖이면 403 · 비로그인이면 401", async () => {
    getUser.mockResolvedValue({ data: { user: { email: "other@example.com" } } });
    expect(await checkOneHouseAiAdmin()).toMatchObject({ ok: false, status: 403 });
    getUser.mockResolvedValue({ data: { user: null } });
    expect(await checkOneHouseAiAdmin()).toMatchObject({ ok: false, status: 401 });
  });
  it("허용 목록이 비었거나 Supabase 설정이 없으면 세션을 보지 않고 403", async () => {
    delete process.env.ONE_HOUSE_AI_ADMIN_EMAILS;
    expect(await checkOneHouseAiAdmin()).toMatchObject({ ok: false, status: 403 });
    process.env.ONE_HOUSE_AI_ADMIN_EMAILS = "admin@example.com";
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    expect(await checkOneHouseAiAdmin()).toMatchObject({ ok: false, status: 403 });
    expect(getUser).not.toHaveBeenCalled();
  });
});
