/**
 * POST /api/calc/cross-104-5 — §104⑤ **크로스 합산**(부동산 ↔ 기타자산) 산출세액
 *
 * 계획서: `docs/00-pm/cross-104-5-c3-ui-design.plan.md` **C-3c**
 *
 * Rate Limiting → Zod 검증 → **preloadTaxRates(과세기간 말일)** → `computeCross1045` → 반환
 *
 * ── ⚠️ 왜 서버인가 (C-3c 착수 중 발견) ────────────────────────────────
 * 계획서 초판은 어댑터가 순수 함수라 **클라이언트에서** 계산할 수 있다고 봤다. 그런데 §55①
 * 누진표는 **과세연도별로 다르다** — `transfer:progressive_rate:_default`의 `effective_date`가
 * **1990·2018·2021·현행** 넷이다(`lib/tax-engine/data/transfer-rate-seed-historical.ts`).
 * 클라이언트가 주식 정적 상수(`BASIC_PROGRESSIVE_BRACKETS` — 현행)를 쓰면 **과거 연도가 조용히
 * 틀린다.** ⇒ 세율은 다른 라우트와 **같은 방식**으로 서버가 연도별로 로드한다.
 *
 * §104①8호·9호 표는 **기본표에서 `rate`만 +10%p**(deduction 동일 — 수학적 필연)이므로
 * DB 기본표에서 **파생**한다. 상수를 따로 두면 연도 드리프트가 생긴다.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { checkRateLimit, getClientIp, shouldBypassRateLimit } from "@/lib/api/rate-limit";
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax";
import { computeCross1045 } from "@/lib/tax-engine/comparative-104-5-cross";
import { buildCross1045Input, type CrossSide } from "@/lib/calc/cross-104-5-adapter";

const sideSchema = z.object({
  taxBase: z.number().int().min(0),
  clause1TaxBase: z.number().int().min(0),
  clause1Tax: z.number().int().min(0),
  nblClauseTaxBase: z.number().int().min(0),
  nblClauseTax: z.number().int().min(0),
  clause2Tax: z.number().int().min(0),
});

const bodySchema = z.object({
  /** 과세기간(YYYY) — 세율 로드 기준 */
  taxYear: z.number().int().min(1990).max(2100),
  realEstate: sideSchema,
  otherAsset: sideSchema,
});

/** §104①8호·9호 표 = 기본표 `rate` +10%p (deduction 동일). 부동소수 오염 회피로 정수 경유. */
function deriveNbl89Brackets(
  basic: readonly { max?: number | null; rate: number; deduction: number }[],
) {
  return basic.map((b) => ({
    max: b.max,
    rate: Math.round(b.rate * 100 + 10) / 100,
    deduction: b.deduction,
  }));
}

export async function POST(request: NextRequest) {
  // Rate Limiting — 분당 15회(다자산 라우트와 동일). 화면이 배분 2안으로 최대 4회를 부른다.
  const ip = getClientIp(request);
  const rl = checkRateLimit(`cross-104-5:${ip}`, {
    limit: 15,
    windowMs: 60_000,
    bypass: shouldBypassRateLimit(request),
  });
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
    return NextResponse.json(
      { error: { code: "INVALID_JSON", message: "요청 본문을 파싱할 수 없습니다" } },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "입력값이 올바르지 않습니다",
          details: parsed.error.issues,
        },
      },
      { status: 400 },
    );
  }

  const { taxYear, realEstate, otherAsset } = parsed.data;

  // 세율 로드 — 과세기간 말일 기준 1회 (다자산 라우트와 같은 패턴)
  const rateDate = new Date(taxYear, 11, 31);
  let rates;
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    try {
      rates = await preloadTaxRates(["transfer"], rateDate);
      if (rates.size === 0) rates = loadFallbackTransferRates(rateDate);
    } catch (err) {
      console.warn("[POST /api/calc/cross-104-5] preloadTaxRates 실패, 로컬 fallback:", err);
      rates = loadFallbackTransferRates(rateDate);
    }
  } else {
    rates = loadFallbackTransferRates(rateDate);
  }

  const basicBrackets = parseRatesFromMap(rates).brackets;
  const input = buildCross1045Input({
    realEstate: realEstate as CrossSide,
    otherAsset: otherAsset as CrossSide,
    basicBrackets,
    nbl89Brackets: deriveNbl89Brackets(basicBrackets),
  });

  const result = computeCross1045(input);

  // 「현행(교차 미적용)」 = 두 계산기가 각각 낸 §104⑤2호의 단순합.
  const currentSum = realEstate.clause2Tax + otherAsset.clause2Tax;

  return NextResponse.json(
    {
      data: {
        ...result,
        input: {
          totalTaxBase: input.totalTaxBase,
          realEstateClause1TaxBase: input.realEstateClause1TaxBase,
          otherAssetClause1TaxBase: input.otherAssetClause1TaxBase,
          clause8TaxBase: input.clause8TaxBase,
          clause9TaxBase: input.clause9TaxBase,
          otherClausesTax: input.otherClausesTax,
        },
        currentSum,
        /** 크로스 적용 시 늘어나는 산출세액 (음수면 0으로 보지 않고 그대로 노출) */
        difference: result.calculatedTax - currentSum,
      },
    },
    { status: 200 },
  );
}
