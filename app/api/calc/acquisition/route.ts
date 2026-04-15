/**
 * 취득세 계산 API Route
 *
 * Layer 1 (Orchestrator):
 *   Rate Limit → Zod 검증 → calcAcquisitionTax → 결과 반환
 *
 * POST /api/calc/acquisition
 */

import { NextRequest, NextResponse } from "next/server";
import { TaxCalculationError } from "@/lib/tax-engine/tax-errors";
import { checkRateLimit, getClientIp } from "@/lib/api/rate-limit";
import { acquisitionTaxInputSchema } from "@/lib/validators/acquisition-input";
import { calcAcquisitionTax } from "@/lib/tax-engine/acquisition-tax";
import type { AcquisitionTaxInput } from "@/lib/tax-engine/types/acquisition.types";

export async function POST(req: NextRequest) {
  // ─────────────────────────────────────────────
  // 1. Rate Limiting
  // ─────────────────────────────────────────────
  const ip = getClientIp(req);
  const rateLimitResult = await checkRateLimit(`acquisition:${ip}`, { limit: 30, windowMs: 60_000 });
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: "요청이 너무 많습니다. 잠시 후 다시 시도하세요." },
      { status: 429 },
    );
  }

  // ─────────────────────────────────────────────
  // 2. 입력 파싱
  // ─────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "요청 본문이 올바른 JSON이 아닙니다." },
      { status: 400 },
    );
  }

  // ─────────────────────────────────────────────
  // 3. Zod 입력 검증
  // ─────────────────────────────────────────────
  const parsed = acquisitionTaxInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "입력값이 올바르지 않습니다.",
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  const input = parsed.data as AcquisitionTaxInput;

  // ─────────────────────────────────────────────
  // 4. 순수 엔진 계산 (DB 쿼리 없음 — Pure Engine)
  // ─────────────────────────────────────────────
  try {
    const result = calcAcquisitionTax(input);
    return NextResponse.json({ data: result });
  } catch (err) {
    if (err instanceof TaxCalculationError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 422 },
      );
    }
    console.error("[POST /api/calc/acquisition]", err);
    return NextResponse.json(
      { error: "취득세 계산 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
