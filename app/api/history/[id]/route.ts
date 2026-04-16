/**
 * 계산 이력 단건 조회·삭제 API
 *
 * GET    /api/history/[id]  → 단건 조회
 * DELETE /api/history/[id]  → 삭제
 *
 * Auth: Required — 미인증 시 401, 타 사용자 이력 접근 시 404
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, getClientIp } from "@/lib/api/rate-limit";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;

  const ip = getClientIp(request);
  const rl = checkRateLimit(`history-get:${ip}`, { limit: 60, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "요청이 너무 많습니다." }, { status: 429 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("calculations")
    .select("id, tax_type, input_data, result_data, tax_law_version, created_at")
    .eq("id", id)
    .eq("user_id", user.id) // RLS 이중 보호: 타 사용자 이력 차단
    .single();

  if (error) {
    // PGRST116: row not found
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "이력을 찾을 수 없습니다." }, { status: 404 });
    }
    return NextResponse.json({ error: "이력 조회에 실패했습니다." }, { status: 500 });
  }

  return NextResponse.json({ record: data });
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;

  const ip = getClientIp(request);
  const rl = checkRateLimit(`history-delete:${ip}`, { limit: 30, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "요청이 너무 많습니다." }, { status: 429 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  // 먼저 존재 여부 확인 (user_id 조건으로 타 사용자 이력 삭제 방지)
  const { data: existing } = await supabase
    .from("calculations")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "이력을 찾을 수 없습니다." }, { status: 404 });
  }

  const { error } = await supabase
    .from("calculations")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: "삭제에 실패했습니다." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
