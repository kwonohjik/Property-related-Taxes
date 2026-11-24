/**
 * 비사업용 토지 **판정** API Route (판정 메뉴) — 계획서 `docs/01-plan/features/nbl-judgment-menu.engine.plan.md` §3~§4 · 「사용자 결정 2차」 Q-1 (c).
 *
 * POST /api/calc/non-business-land-judgment  `{ nonBusinessLandRaw, carryoverGiftRegistryDate? }`
 *
 * Layer 1 (Orchestrator): Rate limit → JSON → Zod(`nblJudgmentRequestSchema`) → 엔진 input(`buildNblEngineInput`) → 세율 로드(rules)
 *   → `judgeNonBusinessLand` → `inputEffects` echo → 응답.
 *
 * 🔑 계산기 route(⑫⑭)와 **같은 함수**만 부른다 — 매핑 로직을 새로 쓰지 않는다. 같은 raw → 같은 판정(parity anchor가 지킨다).
 * 세액·세율은 싣지 않는다(판정 메뉴 · D-E3). 양도일 의제·유예 등의 반영 여부는 `inputEffects`가 서버에서 한 번만 정한다.
 *
 * ## 이월과세(`carryover_gift`) — A·B 둘 다 판정한다 (Q-1 (c))
 * A = 원 raw(증여자 취득일 기산) · B = `buildNblEngineInputGiftBasis`(수증일 기산 — 계산기 `engine-input.ts`가 같은 함수를 부른다).
 * 어느 쪽이 적용되는지는 §97의2②(수용 2년 이전 증여·1세대1주택·세액 비교)·③이 정하므로 이 route는 단정하지 않는다 — 응답도 A/B 중 어느 것이 적용되는지 말하지 않는다.
 */
import { NextRequest, NextResponse } from "next/server";
import { TaxCalculationError } from "@/lib/tax-engine/tax-errors";
import { taxCalculationErrorResponse } from "@/lib/api/tax-error-response";
import { finiteJson } from "@/lib/api/non-finite-guard";
import { nblJudgmentRequestSchema } from "@/lib/api/non-business-land-judgment-schema";
import { buildNblEngineInput } from "@/lib/calc/non-business-land-request";
import { buildNblEngineInputGiftBasis } from "@/lib/calc/non-business-land-request";
import { toDate } from "@/lib/api/date-coerce";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import type { NonBusinessLandJudgment } from "@/lib/tax-engine/non-business-land/types";
import { buildNblInputEffects } from "@/lib/tax-engine/non-business-land-menu-effects";
import type { NblInputEffects } from "@/lib/tax-engine/non-business-land-menu-effects";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import {
  judgmentRateLimitResponse,
  judgmentZodErrorResponse,
  loadJudgmentRateMap,
  parseJudgmentJson,
} from "../one-house-exemption/judgment-request";

export type { NblInputEffect, NblInputEffects } from "@/lib/tax-engine/non-business-land-menu-effects";

export type NonBusinessLandJudgmentResponse = {
  /** 엔진 정본 — 계산기 `result.nonBusinessLandJudgmentDetail`(시나리오 A)과 JSON 기준 동일. Date는 JSON 경유 시 ISO 문자열 */
  judgment: NonBusinessLandJudgment;
  /** 입력했는데 이 판정에 쓰이지 않은 칸 — 서버가 못박는다(화면이 역산하지 않는다) */
  inputEffects: NblInputEffects;
  /** 이월과세(`carryover_gift`) + 증여 등기접수일일 때만 — 이월과세 배제 시(시나리오 B, 수증일 기산) 판정. 어느 쪽이 적용되는지는 말하지 않는다 */
  judgmentIfCarryoverExcluded?: NonBusinessLandJudgment;
  /** `judgmentIfCarryoverExcluded`와 짝 — 시나리오 B 입력 기준의 `inputEffects`(무조건 의제 성립 여부가 취득일 기산에 따라 갈릴 수 있다) */
  inputEffectsIfCarryoverExcluded?: NblInputEffects;
};

export async function POST(request: NextRequest) {
  const limited = judgmentRateLimitResponse(request, "non-business-land-judgment");
  if (limited) return limited;

  const json = await parseJudgmentJson(request);
  if ("response" in json) return json.response;

  const parsed = nblJudgmentRequestSchema.safeParse(json.body);
  if (!parsed.success) return judgmentZodErrorResponse(parsed.error, "non-business-land-judgment route");

  try {
    const { nonBusinessLandRaw: raw, carryoverGiftRegistryDate } = parsed.data;
    const input = buildNblEngineInput(raw);
    if (!input) {
      return NextResponse.json(
        { error: { code: "INVALID_INPUT", message: "비사업용 토지 판정에 필요한 입력(지목 또는 무조건 사업용 의제 선언)이 없습니다" } },
        { status: 400 },
      );
    }
    const rateMap = await loadJudgmentRateMap(toDate(raw.transferDate, "nonBusinessLandRaw.transferDate"), "/api/calc/non-business-land-judgment");
    const rules = parseRatesFromMap(rateMap).nonBusinessLandJudgmentRules;

    const judgment = judgeNonBusinessLand(input, rules);
    const payload: NonBusinessLandJudgmentResponse = { judgment, inputEffects: buildNblInputEffects(input, judgment) };

    // 이월과세 B — 계산기 `engine-input.ts`와 같은 함수(이월과세가 아니거나 수증일이 없으면 undefined)
    const giftBasisInput = buildNblEngineInputGiftBasis(raw, carryoverGiftRegistryDate);
    if (giftBasisInput) {
      const judgmentB = judgeNonBusinessLand(giftBasisInput, rules);
      payload.judgmentIfCarryoverExcluded = judgmentB;
      payload.inputEffectsIfCarryoverExcluded = buildNblInputEffects(giftBasisInput, judgmentB);
    }
    return finiteJson({ data: payload }, { status: 200 });
  } catch (err) {
    console.error("[/api/calc/non-business-land-judgment] engine error:", err);
    if (err instanceof TaxCalculationError) return taxCalculationErrorResponse(err);
    const errMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: { code: "CALCULATION_FAILED", message: errMsg } }, { status: 500 });
  }
}
