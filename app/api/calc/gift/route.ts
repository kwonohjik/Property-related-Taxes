/**
 * 증여세 계산 API Route (#25)
 *
 * Layer 1 (Orchestrator):
 *   Rate Limit → Zod 검증 → calcGiftTax(단건) / calcSimultaneousGifts(다건) → 결과 반환
 *
 * POST /api/calc/gift
 *
 * 응답 형태:
 *   단건: { success: true, result: GiftTaxResult }
 *   다건: { success: true, result: GiftTaxResult, simultaneousResults: GiftTaxResult[] }
 *   (simultaneousResults 없음 = 단건, 하위 호환)
 */

import { NextRequest, NextResponse } from "next/server";
import { TaxCalculationError } from "@/lib/tax-engine/tax-errors";
import { checkRateLimit, getClientIp, shouldBypassRateLimit } from "@/lib/api/rate-limit";
import {
  giftSimultaneousRequestSchema,
} from "@/lib/validators/property-valuation-input";
import { calcGiftTaxWithDonorPaidTax } from "@/lib/tax-engine/gift-tax";
import { calcSimultaneousGifts } from "@/lib/tax-engine/gift-simultaneous";
import type { GiftTaxInput } from "@/lib/tax-engine/types/inheritance-gift.types";

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
  //   giftSimultaneousRequestSchema = giftTaxInputSchema + simultaneousGiftForms? optional.
  //   단건 호출 시 simultaneousGiftForms가 없어 하위 호환 유지.
  //   ⑭ Route handler 엔진 input 매핑 — TS 미감지 지점.
  // ─────────────────────────────────────────────
  const parsed = giftSimultaneousRequestSchema.safeParse(body);
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

  // ─────────────────────────────────────────────
  // 4. 순수 엔진 계산 — 단건 / 다건 분기
  // ─────────────────────────────────────────────
  try {
    const { simultaneousGiftForms, ...baseInputRaw } = parsed.data;
    const baseInput = baseInputRaw as unknown as GiftTaxInput;

    // 다건 경로: simultaneousGiftForms 있음 → calcSimultaneousGifts
    if (simultaneousGiftForms && simultaneousGiftForms.length > 0) {
      const additionalInputs = simultaneousGiftForms as unknown as GiftTaxInput[];
      const allInputs: GiftTaxInput[] = [baseInput, ...additionalInputs];
      const results = calcSimultaneousGifts(allInputs);

      // 건 0 = result, 건 1.. = simultaneousResults
      const [result, ...simultaneousResults] = results;
      return NextResponse.json({ success: true, result, simultaneousResults });
    }

    // 단건 경로 (하위 호환): calcGiftTaxWithDonorPaidTax
    const result = calcGiftTaxWithDonorPaidTax(baseInput);
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
