/**
 * 1세대1주택 비과세 **판정** API Route (P4-2a)
 *
 * Layer 1 (Orchestrator):
 *   Rate limit → Zod → Date 변환 → 엔진 input 조립 → 주택 수 도출·제외 → 판정
 *
 * POST /api/calc/one-house-exemption
 *
 * ## 🔑 계산기와 **같은 배관을 재사용**한다 — 두 벌 만들지 않는다
 *
 * 판정 메뉴 폼은 `TransferFormData`의 **슈퍼셋**이므로(계획서 Q-8), 클라이언트는
 * `buildTransferApiBody`가 만든 것과 같은 모양의 본문을 보낸다. ⇒ Zod 스키마(`propertySchema`)와
 * 엔진 input 조립(`buildTransferEngineInput`)을 **그대로 쓴다**.
 * 별도 스키마를 새로 쓰면 필드가 하나 어긋나는 순간 판정 메뉴와 계산기가 다른 답을 낸다
 * (D-1 「화면은 나누고 엔진은 하나」의 배관 판).
 *
 * ## 이 route가 계산기와 다른 점은 넷뿐이다
 *
 *   1. 세액을 계산하지 않는다 — `judgeOneHouseExemptionFromInput`까지만 간다.
 *   2. **주택 수를 명부에서 도출**해 덮어쓴다(G-1 · D-3). 본문이 보낸
 *      `householdHousingCount`는 **믿지 않는다** — 판정 메뉴에는 그 입력 위젯 자체가 없다.
 *   3. 주택 수 산정 명세(`houseCount`)를 응답에 함께 싣는다.
 *   4. 해석이 갈리는 쟁점(P4)이 있으면 반대 입장으로 한 번 더 판정해 두 결론을 싣는다(`contestedIssues`).
 */

import { NextRequest, NextResponse } from "next/server";
import { TaxCalculationError } from "@/lib/tax-engine/tax-errors";
import { taxCalculationErrorResponse } from "@/lib/api/tax-error-response";
import { finiteJson } from "@/lib/api/non-finite-guard";
import { propertySchema as inputSchema } from "@/lib/api/transfer-tax-schema";
import { resolveJudgmentBaseDate } from "@/lib/api/judgment-base-date";
import {
  buildJudgmentEngineInput,
  buildOneHouseExemptionPayload,
  judgmentRateLimitResponse,
  judgmentZodErrorResponse,
  loadJudgmentRates,
  parseJudgmentJson,
} from "./judgment-request";

// 응답 타입은 공용 모듈로 옮겼다(중과 판정 route가 D3a 요약으로 같은 것을 싣는다) — 기존 import 경로 유지.
export type { OneHouseExemptionResponse } from "./judgment-request";

export async function POST(request: NextRequest) {
  // 단계 0: Rate Limiting — 계산 route와 같은 분당 30회
  const limited = judgmentRateLimitResponse(request, "one-house-exemption");
  if (limited) return limited;

  // 단계 1: JSON 파싱
  const json = await parseJudgmentJson(request);
  if ("response" in json) return json.response;

  // 단계 2: Zod 검증 — 계산기와 **같은 스키마**
  const parsed = inputSchema.safeParse(json.body);
  if (!parsed.success) return judgmentZodErrorResponse(parsed.error, "one-house-exemption route");

  try {
    // 단계 3~4: Date 변환 · 엔진 input 조립 · 주택 수 명부 도출(`judgment-request.ts`)
    const { engineInput, transferDate, isRightSale } = buildJudgmentEngineInput(parsed.data);
    // 단계 5: 세율 로드 — 계산기와 동일한 graceful fallback 정책
    const parsedRates = await loadJudgmentRates(transferDate, "/api/calc/one-house-exemption");

    // 판정 기준일(오늘, 한국 날짜) — 이미 지난 「이 날까지 양도」 기한을 안내하지 않기 위해 넘긴다.
    //   계산기(`transfer-tax.ts`)는 넘기지 않는다 — 세액 경로 불변.
    const judgmentBaseDate = resolveJudgmentBaseDate();
    // 단계 6~: 판정 · 쟁점 · 주택 수 명세 · 동일세대 통산 · 같은 날 권리(`buildOneHouseExemptionPayload`)
    const payload = buildOneHouseExemptionPayload(engineInput, parsedRates, judgmentBaseDate, isRightSale);
    return finiteJson({ data: payload }, { status: 200 });
  } catch (err) {
    console.error("[/api/calc/one-house-exemption] engine error:", err);
    // INVALID_INPUT → 400 (+ details.path가 있으면 fieldErrors) — `lib/api/tax-error-response.ts`
    if (err instanceof TaxCalculationError) return taxCalculationErrorResponse(err);
    const errMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: { code: "CALCULATION_FAILED", message: errMsg } },
      { status: 500 },
    );
  }
}
