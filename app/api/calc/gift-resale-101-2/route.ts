/**
 * POST /api/calc/gift-resale-101-2 — 소득세법 §101② 증여 후 우회양도 부당행위계산부인 **판정**
 *
 * 계획서: `docs/00-pm/transfer-101-2-gift-resale.plan.md` §5.2
 *
 * Rate Limiting → Zod 검증(⑫) → `toDate`(⑭) → `judgeGiftResale1012` → `finiteJson`
 * 세율을 로드하지 않는다 — 양도세는 사용자가 양도세 계산기로 이미 계산한 결정세액을 받는다(안 A).
 * 이력을 저장하지 않는다(화면도 마찬가지 — `NO_HISTORY_ROUTES`).
 */
import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit, getClientIp, shouldBypassRateLimit } from "@/lib/api/rate-limit";
import { finiteJson } from "@/lib/api/non-finite-guard";
import { toDate } from "@/lib/api/date-coerce";
import { giftResaleInputSchema } from "@/lib/validators/gift-resale-101-2-input";
import { judgeGiftResale1012 } from "@/lib/tax-engine/gift-resale-101-2";

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(`gift-resale-101-2:${ip}`, {
    limit: 30,
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

  const parsed = giftResaleInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "입력값이 올바르지 않습니다", details: parsed.error.issues } },
      { status: 400 },
    );
  }

  try {
    const v = parsed.data;
    const result = judgeGiftResale1012({
      ...v,
      giftRegistryDate: toDate(v.giftRegistryDate, "giftRegistryDate"),
      transferDate: toDate(v.transferDate, "transferDate"),
    });
    return finiteJson({ data: result }, { status: 200 });
  } catch (err) {
    console.error("[POST /api/calc/gift-resale-101-2]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "판정 중 오류가 발생했습니다." } },
      { status: 500 },
    );
  }
}
