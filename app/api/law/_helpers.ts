/**
 * 법령 API Route 공통 헬퍼 (/api/law/*)
 *  - Rate limit 검사
 *  - LawApiError → HTTP 상태 매핑
 *  - Zod 검증 실패 → 400
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/api/rate-limit";
import { LawApiError } from "@/lib/korean-law/client";
import type { LawApiErrorEnvelope } from "@/lib/korean-law/types";

// 프로덕션: 분당 30회. 개발·테스트: 분당 200회 (E2E 포함 빠른 반복 지원)
const RATE_LIMIT = {
  limit: process.env.NODE_ENV === "production" ? 30 : 200,
  windowMs: 60_000,
};

export function ensureRateLimit(req: NextRequest): NextResponse<LawApiErrorEnvelope> | null {
  // E2E / 자동 테스트 환경에서 우회 (E2E_BYPASS_RATE_LIMIT=1)
  if (process.env.E2E_BYPASS_RATE_LIMIT === "1") return null;
  const ip = getClientIp(req);
  const { allowed, resetAt } = checkRateLimit(`law:${ip}`, RATE_LIMIT);
  if (!allowed) {
    return NextResponse.json<LawApiErrorEnvelope>(
      { error: "요청이 너무 많습니다. 잠시 후 다시 시도하세요.", code: "RATE_LIMIT" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((resetAt - Date.now()) / 1000)) } }
    );
  }
  return null;
}

export function mapErrorToResponse(err: unknown): NextResponse<LawApiErrorEnvelope> {
  if (err instanceof LawApiError) {
    const status =
      err.code === "API_KEY_MISSING" ? 503 :
      err.code === "NOT_FOUND" ? 404 :
      err.code === "BAD_REQUEST" ? 400 :
      err.code === "UPSTREAM" ? 502 :
      500;
    const envelopeCode =
      err.code === "API_KEY_MISSING" ? "API_KEY_MISSING" :
      err.code === "BAD_REQUEST" ? "VALIDATION" :
      "UPSTREAM";
    return NextResponse.json<LawApiErrorEnvelope>(
      { error: err.message, code: envelopeCode },
      { status }
    );
  }
  if (err instanceof z.ZodError) {
    return NextResponse.json<LawApiErrorEnvelope>(
      { error: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), code: "VALIDATION" },
      { status: 400 }
    );
  }
  console.error("[law-api] unexpected error", err);
  const message =
    err instanceof Error && err.message
      ? err.message
      : "서버 내부 오류가 발생했습니다.";
  return NextResponse.json<LawApiErrorEnvelope>(
    { error: message, code: "UPSTREAM" },
    { status: 500 }
  );
}

export function parseQuery<T extends z.ZodTypeAny>(req: NextRequest, schema: T): z.infer<T> {
  const url = new URL(req.url);
  const obj: Record<string, string> = {};
  url.searchParams.forEach((v, k) => {
    obj[k] = v;
  });
  return schema.parse(obj);
}
