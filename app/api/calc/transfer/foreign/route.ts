/**
 * 국외자산 부동산 양도소득세(소득세법 §118의2~§118의8) 계산 API Route
 *
 * POST /api/calc/transfer/foreign   (국내 `/api/calc/transfer`와 별도 — 국외는 §118의8 준용 목록 밖의 국내 기계를 쓰지 않는다)
 *
 * Layer 1 (Orchestrator):
 *   Rate limit(분당 30회) → Zod(⑨⑩⑫) → 엔진 input 매핑(⑭, 날짜 `toDate`) → preloadTaxRates(양도일 시점 §55① 표·기본공제 한도) → 순수 엔진 → `{ data: result }`
 *
 * 비로그인 허용. 이력 저장은 서버 미경유(클라이언트 IndexedDB).
 * 계획서: docs/02-design/features/transfer-foreign-realestate.engine.plan.md §4
 */
import { NextRequest, NextResponse } from "next/server";
import { preloadTaxRates, loadFallbackTransferRates, type TaxRatesMap } from "@/lib/db/tax-rates";
import { calculateForeignRealEstateTransferTax, foreignRealEstateRatesFrom } from "@/lib/tax-engine/foreign-realestate";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import { TaxCalculationError, TaxErrorCode } from "@/lib/tax-engine/tax-errors";
import { taxCalculationErrorResponse } from "@/lib/api/tax-error-response";
import { checkRateLimit, getClientIp, shouldBypassRateLimit } from "@/lib/api/rate-limit";
import { finiteJson } from "@/lib/api/non-finite-guard";
import { foreignRealEstateInputSchema } from "@/lib/api/transfer-foreign-schema";
import { toForeignRealEstateEngineInput } from "@/lib/api/transfer-foreign-engine-input";

/** 세율 로드 — Supabase 미도달·미설정 시 로컬 seed fallback(국내 route와 같은 graceful 정책). */
async function loadRates(date: Date): Promise<TaxRatesMap> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return loadFallbackTransferRates(date);
  try {
    const loaded = await preloadTaxRates(["transfer"], date);
    return loaded.size === 0 ? loadFallbackTransferRates(date) : loaded;
  } catch (err) {
    console.warn("[POST /api/calc/transfer/foreign] preloadTaxRates 실패, 로컬 세율 fallback 사용:", err);
    return loadFallbackTransferRates(date);
  }
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(`transfer-foreign:${ip}`, { limit: 30, windowMs: 60_000, bypass: shouldBypassRateLimit(request) });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." } },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit": String(rl.limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(rl.resetAt / 1000)),
          "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
        },
      },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { code: "INVALID_JSON", message: "요청 본문을 파싱할 수 없습니다" } }, { status: 400 });
  }

  const parsed = foreignRealEstateInputSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.length > 0 ? issue.path.join(".") : "_root";
      fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
    }
    return NextResponse.json(
      { error: { code: TaxErrorCode.INVALID_INPUT, message: "입력값이 올바르지 않습니다", fieldErrors } },
      { status: 400 },
    );
  }

  try {
    const input = toForeignRealEstateEngineInput(parsed.data);
    // 같은 과세기간(Zod가 보장) — 가장 늦은 양도일 시점 §55① 표·기본공제 한도 (세율 행은 1월 1일 단위로만 바뀐다)
    const rateDate = input.assets.reduce((m, a) => (a.transferDate > m ? a.transferDate : m), input.assets[0].transferDate);
    const rates = foreignRealEstateRatesFrom(parseRatesFromMap(await loadRates(rateDate)));
    const result = calculateForeignRealEstateTransferTax(input, rates);
    return finiteJson({ data: result });
  } catch (err) {
    console.error("[/api/calc/transfer/foreign] engine error:", err);
    if (err instanceof TaxCalculationError) return taxCalculationErrorResponse(err);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: err instanceof Error ? err.message || "계산 중 오류가 발생했습니다" : "계산 중 오류가 발생했습니다",
          ...(process.env.NODE_ENV !== "production" && err instanceof Error ? { stack: err.stack } : {}),
        },
      },
      { status: 500 },
    );
  }
}
