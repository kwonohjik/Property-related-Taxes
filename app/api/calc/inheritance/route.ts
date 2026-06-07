/**
 * 상속세 계산 API Route (#24)
 *
 * Layer 1 (Orchestrator):
 *   Rate Limit → Zod 검증 → calcInheritanceTax → 결과 반환
 *
 * POST /api/calc/inheritance
 */

import { NextRequest, NextResponse } from "next/server";
import { TaxCalculationError } from "@/lib/tax-engine/tax-errors";
import { checkRateLimit, getClientIp, shouldBypassRateLimit } from "@/lib/api/rate-limit";
import {
  inheritanceTaxInputSchema,
} from "@/lib/validators/property-valuation-input";
import {
  calcInheritanceTax,
} from "@/lib/tax-engine/inheritance-tax";
import type { InheritanceTaxInput } from "@/lib/tax-engine/types/inheritance-gift.types";

export async function POST(req: NextRequest) {
  // ─────────────────────────────────────────────
  // 1. Rate Limiting
  // ─────────────────────────────────────────────
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
  const parsed = inheritanceTaxInputSchema.safeParse(body);
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

  // 14지점 ⑭: 명시적 엔진 input 매핑 — 신규 필드(presumedItems·debtItems·heirAllocations 등)
  // spread 누락 방지. Zod 스키마와 InheritanceTaxInput 타입 호환 보증.
  const parsedData = parsed.data;
  const input: InheritanceTaxInput = {
    decedentType: parsedData.decedentType,
    deathDate: parsedData.deathDate,
    estateItems: parsedData.estateItems as InheritanceTaxInput["estateItems"],
    funeralExpense: parsedData.funeralExpense ?? 0,
    funeralIncludesBongan: parsedData.funeralIncludesBongan ?? false,
    debts: parsedData.debts ?? 0,
    debtItems: parsedData.debtItems as InheritanceTaxInput["debtItems"],
    presumedItems: parsedData.presumedItems as InheritanceTaxInput["presumedItems"],
    exemptions: parsedData.exemptions,
    preGiftsWithin10Years:
      parsedData.preGiftsWithin10Years as InheritanceTaxInput["preGiftsWithin10Years"],
    heirs: parsedData.heirs as InheritanceTaxInput["heirs"],
    deductionInput:
      parsedData.deductionInput as InheritanceTaxInput["deductionInput"],
    creditInput:
      parsedData.creditInput as InheritanceTaxInput["creditInput"],
    valuationBaseDate: parsedData.valuationBaseDate,
    isGenerationSkip: parsedData.isGenerationSkip,
    isMinorHeir: parsedData.isMinorHeir,
    generationSkipAssetAmount: parsedData.generationSkipAssetAmount,
    // 감정평가수수료 공제 (§25①2호·§20의3) — ⑭ route 명시 매핑 (누락 시 Zod 통과해도 엔진 미도달)
    appraisalFee: parsedData.appraisalFee,
  };

  // ─────────────────────────────────────────────
  // 4. 순수 엔진 계산
  //    (DB 세율은 기본값 내장 — preloadTaxRates 필요 시 추가)
  // ─────────────────────────────────────────────
  try {
    const result = calcInheritanceTax(input);
    return NextResponse.json({ success: true, result });
  } catch (err) {
    if (err instanceof TaxCalculationError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 422 },
      );
    }
    console.error("[POST /api/calc/inheritance]", err);
    return NextResponse.json(
      { error: "계산 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
