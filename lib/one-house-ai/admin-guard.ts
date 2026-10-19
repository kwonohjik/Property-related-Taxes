/**
 * 1세대1주택 AI 사실 추출 — 개발 중 **관리자 전용** 게이트(사용자 결정 2026-10-19).
 *
 * 추출 1회마다 Anthropic API 비용이 든다. 로그인 세션(Supabase)의 이메일이 `ONE_HOUSE_AI_ADMIN_EMAILS`
 * (쉼표 구분) 안에 있어야 통과한다. 목록이 비었거나 Supabase 설정이 없으면 아무도 통과하지 못한다.
 */
import { createClient } from "@/lib/supabase/server";

export type AdminGateResult =
  | { ok: true; email: string }
  | { ok: false; status: 401 | 403; code: "UNAUTHENTICATED" | "FORBIDDEN"; message: string };

export function oneHouseAiAdminEmails(raw = process.env.ONE_HOUSE_AI_ADMIN_EMAILS): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function checkOneHouseAiAdmin(): Promise<AdminGateResult> {
  const admins = oneHouseAiAdminEmails();
  if (admins.size === 0 || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return { ok: false, status: 403, code: "FORBIDDEN", message: "AI 사실 추출은 관리자 전용입니다." };
  }
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email?.toLowerCase();
  if (!email) return { ok: false, status: 401, code: "UNAUTHENTICATED", message: "로그인이 필요합니다." };
  if (!admins.has(email)) return { ok: false, status: 403, code: "FORBIDDEN", message: "AI 사실 추출은 관리자 전용입니다." };
  return { ok: true, email };
}
