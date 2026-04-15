/**
 * 증여세 계산 API Route (#25)
 *
 * Layer 1 (Orchestrator):
 *   Rate Limit → Zod 검증 → calcGiftTax → 결과 반환
 *
 * POST /api/calc/gift
 */

import { NextRequest, NextResponse } from "next/server";
import { TaxCalculationError } from "@/lib/tax-engine/tax-errors";
import { checkRateLimit, getClientIp } from "@/lib/api/rate-limit";
import { giftTaxInputSchema } from "@/lib/validators/property-valuation-input";
import { calcGiftTax } from "@/lib/tax-engine/gift-tax";
import type { GiftTaxInput } from "@/lib/tax-engine/types/inheritance-gift.types";

export async function POST(req: NextRequest) {
  // ─────────────────────────────────────────────
  // 1. Rate Limiting
  // ─────────────────────────────────────────────
  const ip = getClientIp(req);
  const rateLimitResult = await checkRateLimit(ip);
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
  const parsed = giftTaxInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "입력값이 올바르지 않습니다.",
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  const input = parsed.data as unknown as GiftTaxInput;

  // ─────────────────────────────────────────────
  // 4. 순수 엔진 계산
  // ─────────────────────────────────────────────
  try {
    const result = calcGiftTax(input);
    return NextResponse.json({ success: true, result });
  } catch (err) {
    if (err instanceof TaxCalculationError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 422 },
      );
    }
    console.error("[POST /api/calc/gift]", err);
    return NextResponse.json(
      { error: "계산 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
