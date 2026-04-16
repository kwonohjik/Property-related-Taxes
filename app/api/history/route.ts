/**
 * 계산 이력 목록 조회 API
 *
 * GET /api/history
 *   Query: taxType?, limit? (1~100, default 20), offset? (default 0)
 *   Auth: Required — 미인증 시 401 반환 (미들웨어에서 페이지 리다이렉트도 처리)
 *
 * Response:
 *   { records: CalculationRecord[], total: number, limit: number, offset: number }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, getClientIp } from "@/lib/api/rate-limit";

const querySchema = z.object({
  taxType: z
    .enum(["transfer", "inheritance", "gift", "acquisition", "property", "comprehensive_property"])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function GET(request: NextRequest) {
  // Rate limiting: 인증된 사용자 대상이므로 여유 있게 60 req/min
  const ip = getClientIp(request);
  const rl = checkRateLimit(`history-list:${ip}`, { limit: 60, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "요청이 너무 많습니다. 잠시 후 다시 시도하세요." },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit": String(rl.limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(rl.resetAt),
          "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
        },
      },
    );
  }

  // 인증 확인 (미들웨어는 페이지 리다이렉트, API는 JSON 401 반환)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  // 쿼리 파라미터 파싱 및 검증
  const { searchParams } = request.nextUrl;
  const parseResult = querySchema.safeParse({
    taxType: searchParams.get("taxType") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
    offset: searchParams.get("offset") ?? undefined,
  });

  if (!parseResult.success) {
    return NextResponse.json(
      { error: "잘못된 요청 파라미터입니다.", details: parseResult.error.flatten() },
      { status: 400 },
    );
  }

  const { taxType, limit, offset } = parseResult.data;

  let query = supabase
    .from("calculations")
    .select("id, tax_type, input_data, result_data, tax_law_version, created_at", {
      count: "exact",
    })
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (taxType) {
    query = query.eq("tax_type", taxType);
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: "이력 조회에 실패했습니다." }, { status: 500 });
  }

  return NextResponse.json({
    records: data ?? [],
    total: count ?? 0,
    limit,
    offset,
  });
}
