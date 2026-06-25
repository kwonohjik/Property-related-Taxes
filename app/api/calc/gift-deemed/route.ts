/**
 * 증여로 보는 경우 계산 API Route (Phase 1)
 *
 * Layer 1 (Orchestrator):
 *   Rate Limit → Zod 검증 → calcDeemedGift → 결과 반환
 *
 * POST /api/calc/gift-deemed
 */

import { NextRequest, NextResponse } from "next/server";
import { TaxCalculationError } from "@/lib/tax-engine/tax-errors";
import { checkRateLimit, getClientIp, shouldBypassRateLimit } from "@/lib/api/rate-limit";
import { deemedGiftInputSchema } from "@/lib/validators/gift-deemed-input";
import { calcDeemedGift } from "@/lib/tax-engine/gift-deemed/router";
import { calcCapitalIncreaseAllocation } from "@/lib/tax-engine/gift-deemed/capital-increase-allocation";
import type { DeemedGiftInput } from "@/lib/tax-engine/gift-deemed/types";

export async function POST(req: NextRequest) {
  // 1. Rate Limiting
  const ip = getClientIp(req);
  const rateLimitResult = await checkRateLimit(ip, {
    bypass: shouldBypassRateLimit(req),
  });
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: "요청이 너무 많습니다. 잠시 후 다시 시도하세요." },
      { status: 429 },
    );
  }

  // 2. 입력 파싱
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "요청 본문이 올바른 JSON이 아닙니다." },
      { status: 400 },
    );
  }

  // 3. Zod 검증
  const parsed = deemedGiftInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "입력값이 올바르지 않습니다.",
        details: parsed.error.flatten().fieldErrors,
        issues: parsed.error.issues.map((iss) => ({
          path: iss.path.map((p) => String(p)),
          message: iss.message,
          code: iss.code,
        })),
      },
      { status: 400 },
    );
  }

  const input = parsed.data as unknown as DeemedGiftInput;

  // 4. 순수 엔진 계산 (cap-table 배분은 별도 오케스트레이터로 dispatch)
  try {
    const result =
      input.type === "capital_increase_allocation"
        ? calcCapitalIncreaseAllocation(input)
        : calcDeemedGift(input);
    return NextResponse.json({ success: true, result });
  } catch (err) {
    if (err instanceof TaxCalculationError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 422 },
      );
    }
    console.error("[POST /api/calc/gift-deemed]", err);
    return NextResponse.json(
      { error: "계산 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
