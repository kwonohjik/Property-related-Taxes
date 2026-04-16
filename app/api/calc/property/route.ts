/**
 * 재산세 계산 API Route (P1-13)
 *
 * Layer 1 (Orchestrator):
 *   Rate Limit → Zod 검증 → preloadTaxRates → calculatePropertyTax → saveCalculation → 결과 반환
 *
 * POST /api/calc/property
 */

import { NextRequest, NextResponse } from "next/server";
import { TaxCalculationError } from "@/lib/tax-engine/tax-errors";
import { checkRateLimit, getClientIp } from "@/lib/api/rate-limit";
import { propertyTaxInputSchema } from "@/lib/validators/property-input";
import { calculatePropertyTax } from "@/lib/tax-engine/property-tax";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { saveCalculation } from "@/actions/calculations";
import type { PropertyTaxInput } from "@/lib/tax-engine/types/property.types";
import type { TaxRatesMap } from "@/lib/db/tax-rates";

export async function POST(req: NextRequest) {
  // ─────────────────────────────────────────────
  // 1. Rate Limiting (IP당 분당 30회)
  // ─────────────────────────────────────────────
  const ip = getClientIp(req);
  const rateLimitResult = await checkRateLimit(`property:${ip}`, {
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      {
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: "요청이 너무 많습니다. 잠시 후 다시 시도하세요.",
        },
      },
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
      {
        error: {
          code: "INVALID_JSON",
          message: "요청 본문이 올바른 JSON이 아닙니다.",
        },
      },
      { status: 400 },
    );
  }

  // ─────────────────────────────────────────────
  // 3. Zod 입력 검증
  // ─────────────────────────────────────────────
  const parsed = propertyTaxInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_INPUT",
          message: "입력값이 올바르지 않습니다.",
          details: parsed.error.flatten().fieldErrors,
        },
      },
      { status: 400 },
    );
  }

  const input = parsed.data as PropertyTaxInput;

  // ─────────────────────────────────────────────
  // 4. 세율 로드 (Supabase 미설정 시 graceful skip)
  //    재산세 과세기준일: 매년 6월 1일 (지방세법 §114)
  // ─────────────────────────────────────────────
  let rates: TaxRatesMap | undefined;
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    try {
      const taxBaseDate = input.targetDate
        ? new Date(input.targetDate)
        : new Date();
      rates = await preloadTaxRates(["property"], taxBaseDate);
    } catch (err) {
      // DB 연결 실패 시 엔진 내부 상수로 계산 진행
      console.warn("[POST /api/calc/property] preloadTaxRates 실패, 내부 상수 사용:", err);
    }
  }

  // ─────────────────────────────────────────────
  // 5. 순수 엔진 계산
  // ─────────────────────────────────────────────
  let result;
  try {
    result = calculatePropertyTax(input, rates);
  } catch (err) {
    if (err instanceof TaxCalculationError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status: 422 },
      );
    }
    console.error("[POST /api/calc/property]", err);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "재산세 계산 중 오류가 발생했습니다.",
        },
      },
      { status: 500 },
    );
  }

  // ─────────────────────────────────────────────
  // 6. 이력 저장 (로그인 사용자만, 비동기 non-blocking)
  //    실패해도 계산 결과 반환에 영향 없음
  // ─────────────────────────────────────────────
  saveCalculation({
    taxType: "property",
    inputData: input as unknown as Record<string, unknown>,
    resultData: result as unknown as Record<string, unknown>,
    taxLawVersion: "2024-01-01",
  }).catch((err) => {
    console.warn("[POST /api/calc/property] saveCalculation 실패:", err);
  });

  return NextResponse.json({ data: result });
}
