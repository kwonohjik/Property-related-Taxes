/**
 * 다주택 중과 **판정** API Route (계획서 `docs/00-pm/multi-house-surcharge-judgment-menu.plan.md` §4.1 · P4)
 *
 * POST /api/calc/multi-house-surcharge-judgment  `{ property }`
 *
 * Layer 1 (Orchestrator): Rate limit → Zod(`propertySchema`) → Date 변환 · 엔진 input · 주택 수 명부 도출 → 세율 로드
 *   → 1세대1주택 비과세 요약(D3a) → 양도 예정 주택 정밀 판정 · 행별 판정 · 설명문 · 세율 영향.
 *
 * 1주택 판정 route와 **같은 전처리**(`../one-house-exemption/judgment-request.ts`)를 쓴다 — 화면은 나누고 엔진은 하나(T1).
 * 본문은 `{ property }`로 감싼다(시뮬레이션 입력이 같은 본문에 붙는다 — P8).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { TaxCalculationError } from "@/lib/tax-engine/tax-errors";
import { taxCalculationErrorResponse } from "@/lib/api/tax-error-response";
import { finiteJson } from "@/lib/api/non-finite-guard";
import { propertySchema } from "@/lib/api/transfer-tax-schema";
import { resolveJudgmentBaseDate } from "@/lib/api/judgment-base-date";
import {
  buildJudgmentEngineInput,
  buildOneHouseExemptionPayload,
  judgmentRateLimitResponse,
  judgmentZodErrorResponse,
  loadJudgmentRates,
  parseJudgmentJson,
} from "../one-house-exemption/judgment-request";
import { buildSurchargeJudgmentPayload } from "./surcharge-judgment-payload";

export type { MultiHouseSurchargeJudgmentResponse } from "./surcharge-judgment-payload";

const requestSchema = z.object({ property: propertySchema });

export async function POST(request: NextRequest) {
  const limited = judgmentRateLimitResponse(request, "multi-house-surcharge-judgment");
  if (limited) return limited;

  const json = await parseJudgmentJson(request);
  if ("response" in json) return json.response;

  const parsed = requestSchema.safeParse(json.body);
  if (!parsed.success) return judgmentZodErrorResponse(parsed.error, "multi-house-surcharge-judgment route");

  try {
    const { engineInput, transferDate, isRightSale } = buildJudgmentEngineInput(parsed.data.property);
    const parsedRates = await loadJudgmentRates(transferDate, "/api/calc/multi-house-surcharge-judgment");
    // 비과세 요약의 기한 기준일은 오늘, 중과 판정 기준일은 양도일 — 둘 다 응답에 싣는다.
    const judgmentBaseDate = resolveJudgmentBaseDate();
    const exemption = buildOneHouseExemptionPayload(engineInput, parsedRates, judgmentBaseDate, isRightSale);
    const payload = buildSurchargeJudgmentPayload(engineInput, parsedRates, judgmentBaseDate, exemption);
    return finiteJson({ data: payload }, { status: 200 });
  } catch (err) {
    console.error("[/api/calc/multi-house-surcharge-judgment] engine error:", err);
    if (err instanceof TaxCalculationError) return taxCalculationErrorResponse(err);
    const errMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: { code: "CALCULATION_FAILED", message: errMsg } }, { status: 500 });
  }
}
