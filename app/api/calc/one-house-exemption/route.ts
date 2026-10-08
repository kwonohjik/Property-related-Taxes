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
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { TaxCalculationError, TaxErrorCode } from "@/lib/tax-engine/tax-errors";
import { taxCalculationErrorResponse } from "@/lib/api/tax-error-response";
import { toDate, toOptionalDate } from "@/lib/api/date-coerce";
import { checkRateLimit, getClientIp, shouldBypassRateLimit } from "@/lib/api/rate-limit";
import { finiteJson } from "@/lib/api/non-finite-guard";
import { propertySchema as inputSchema } from "@/lib/api/transfer-tax-schema";
import { buildTransferEngineInput } from "../transfer/engine-input";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import { resolveJudgmentBaseDate } from "@/lib/api/judgment-base-date";
import type { OneHouseRentalHousingVerdict } from "@/lib/tax-engine/one-house/rental-housing-verdict";
import {
  buildOneHouseCountBreakdown,
  deriveHouseholdHousingCount,
  deriveHouseholdRightCount,
  type OneHouseCountBreakdown,
} from "@/lib/tax-engine/one-house/house-count";
import type { OneHouseOneRightVerdict } from "@/lib/tax-engine/one-house/one-right-verdict";
import {
  buildContestedIssue,
  contestedVerdictOf,
  detectContestedIssues,
  type OneHouseContestedIssue,
} from "@/lib/tax-engine/one-house/contested-issues";
import { runOneHouseJudgmentPipeline } from "./judgment-pipeline";
import type { OneHouseJudgment } from "@/lib/tax-engine/one-house/types";
import {
  resolveExemptionHoldingStartDate,
  resolveExemptionResidenceMonths,
} from "@/lib/tax-engine/transfer-tax-exemption-requirements";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

/** 판정 메뉴 응답 — 화면(④ 결과)이 읽는 전부. */
export type OneHouseExemptionResponse = {
  judgment: OneHouseJudgment;
  /**
   * 판정 기준일(조회일, 한국 날짜 YYYY-MM-DD) — 이 날 전에 지난 「이 날까지 양도」 기한은 `pending`에서
   * 빠진다(2026-09-29). 이력 상세는 **저장 당시의 판정**이라 화면이 이 날짜를 함께 보여 준다.
   * 구 이력에는 없다.
   */
  judgmentBaseDate?: string;
  houseCount: OneHouseCountBreakdown;
  /**
   * §155⑳ 장기임대주택 특례 결론 (P4-3a) — 특례를 **선언한 경우에만** 실린다.
   * `undefined`는 「선언하지 않음」이고 `passed: false`는 「선언했으나 미충족」이다.
   */
  rentalHousingException?: OneHouseRentalHousingVerdict;
  /**
   * §89①4호 1세대1입주권 결론 (P4-3b) — 양도 대상이 **조합원입주권일 때만** 실린다.
   * `undefined`는 「주택 양도라 물을 일이 아님」이고 `clause: null`은 「물었으나 미성립」이다.
   */
  oneRightExemption?: OneHouseOneRightVerdict;
  /**
   * §154⑧3호 동일세대 상속 통산 (OH-18) — 동일세대 상속을 **선언한 경우에만** 실린다.
   * 값은 엔진 정본(`resolveExemptionHoldingStartDate`·`resolveExemptionResidenceMonths`)이 낸 것이다.
   * 화면이 역산하지 않도록 route가 싣는다(`feedback_aggregate_display_rederives_engine_value`).
   */
  inheritedPeriodConsolidation?: {
    /** §154① 보유기간 기산일(YYYY-MM-DD) — 통산이 성립하면 동일세대 거주·보유 개시일 */
    holdingStartDate: string;
    /** §154① 거주요건 판정에 쓰는 거주 개월 — 상속 후 실거주 + 상속개시 전 동일세대 거주 */
    residenceMonths: number;
  };
  /**
   * 해석이 갈리는 쟁점(P4) — 양론 사실 패턴이 있을 때만 실린다. 두 입장 각각의 결론을 담는다.
   * `judgment`는 그중 엔진 입장(`enginePosition`)의 판정이다. 구 이력에는 없다.
   */
  contestedIssues?: OneHouseContestedIssue[];
};

export async function POST(request: NextRequest) {
  // 단계 0: Rate Limiting — 계산 route와 같은 분당 30회
  const ip = getClientIp(request);
  const rl = checkRateLimit(`one-house-exemption:${ip}`, {
    limit: 30,
    windowMs: 60_000,
    bypass: shouldBypassRateLimit(request),
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "요청이 너무 많습니다. 잠시 후 다시 시도하세요" } },
      { status: 429 },
    );
  }

  // 단계 1: JSON 파싱
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_JSON", message: "요청 본문을 파싱할 수 없습니다" } },
      { status: 400 },
    );
  }

  // 단계 2: Zod 검증 — 계산기와 **같은 스키마**
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.length > 0 ? issue.path.join(".") : "_root";
      fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
    }
    console.error("[one-house-exemption route] zod validation failed", {
      issueCount: parsed.error.issues.length,
      issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message, code: i.code })),
    });
    return NextResponse.json(
      {
        error: {
          code: TaxErrorCode.INVALID_INPUT,
          message: "입력값이 올바르지 않습니다",
          fieldErrors,
        },
      },
      { status: 400 },
    );
  }

  try {
    // 단계 3: string → Date (⑭ — `date-coerce` 경유 강제)
    const data = parsed.data;
    const transferDate = toDate(data.transferDate, "transferDate");
    const acquisitionDate = toDate(data.acquisitionDate, "acquisitionDate");
    const assetContractDate = toOptionalDate(data.assetContractDate);

    const baseInput = buildTransferEngineInput(
      data,
      transferDate,
      acquisitionDate,
      assetContractDate,
    );

    /**
     * 단계 4: **주택 수는 명부에서 도출한다**(G-1 · D-3).
     *
     * 계산기는 사용자가 선언한 스칼라를 쓰지만 판정 메뉴에는 그 위젯이 없다. 본문에 실려 온
     * 값을 그대로 쓰면 「명부가 정본」이 무너지고, 조작된 본문으로 판정을 흔들 수도 있다.
     */
    /**
     * 🔴 **양도 대상이 주택이 아니면 주택 수 축이 갈린다**(P4-3b).
     *
     * 조합원입주권 양도는 §89①**4호** 경로이고, 가목이 「다른 주택을 보유하지 **아니할** 것」
     * = 0채를 요구한다. `buildHousesPayload`가 붙인 `selling` 행을 주택으로 세면 명부가 비어도
     * 1채가 되어 가목이 **절대 성립하지 않는다**. 대신 그 양도 대상은 **입주권 수**에 들어간다.
     */
    const isRightSale = data.propertyType === "right_to_move_in";

    const engineInput: TransferTaxInput = {
      ...baseInput,
      householdHousingCount: deriveHouseholdHousingCount(baseInput.houses, !isRightSale),
      householdRightCount: deriveHouseholdRightCount(baseInput.presaleRights, isRightSale),
      /**
       * §89①4호 가·나목 분양권 게이트(`oneRightPresaleGate`) 전용 — **판정 메뉴는 예외**
       * (2026-10-06 사용자 결정, 계획서 §10 남은 별건 1 「입력 안 함과 없음을 구별할 필요가
       * 없어」). 이 화면에는 「세대 보유 분양권·입주권이 없습니다」확인 토글 자체가 없다 —
       * 목록이 비어 있으면 그 자체가 조사의 결론(「없음」)이고, 계산기 전용 확인 플래그가
       * 없다는 이유로 가·나목을 "undetermined"로 떨어뜨리면 판정을 다시 요구하는 것이 된다.
       * 목록에 항목이 있으면 이 값은 게이트가 아예 보지 않는다(`oneRightPresaleGate` 참조).
       */
      householdNoPresaleRightsConfirmed: true,
    };

    // 단계 5: 세율 로드 — 계산기와 동일한 graceful fallback 정책
    let rates;
    if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
      try {
        rates = await preloadTaxRates(["transfer"], transferDate);
        if (rates.size === 0) rates = loadFallbackTransferRates(transferDate);
      } catch (err) {
        console.warn("[POST /api/calc/one-house-exemption] preloadTaxRates 실패, 로컬 fallback:", err);
        rates = loadFallbackTransferRates(transferDate);
      }
    } else {
      rates = loadFallbackTransferRates(transferDate);
    }
    const parsedRates = parseRatesFromMap(rates);

    // 판정 기준일(오늘, 한국 날짜) — 이미 지난 「이 날까지 양도」 기한을 안내하지 않기 위해 넘긴다.
    //   계산기(`transfer-tax.ts`)는 넘기지 않는다 — 세액 경로 불변.
    const judgmentBaseDate = resolveJudgmentBaseDate();
    // 단계 6~6.7: 주택 수 제외 → 판정 → §155⑳ → §89①4호 → 비거주자(`judgment-pipeline.ts`)
    const { exclusion, rentalVerdict, oneRightVerdict, judgment } = runOneHouseJudgmentPipeline(
      engineInput,
      parsedRates,
      judgmentBaseDate,
      isRightSale,
    );

    /**
     * 단계 6.8: 해석이 갈리는 쟁점(P4) — 반대 입장 입력으로 **같은 파이프라인**을 한 번 더 돌려 두 결론을 싣는다.
     * 판정 메뉴 전용 — 계산기는 엔진 입장대로 세액을 낸다.
     */
    const engineVerdict = contestedVerdictOf(judgment);
    const contestedIssues = detectContestedIssues(engineInput).map((d) =>
      buildContestedIssue(
        d,
        engineVerdict,
        contestedVerdictOf(
          runOneHouseJudgmentPipeline(d.otherPositionInput, parsedRates, judgmentBaseDate, isRightSale).judgment,
        ),
      ),
    );

    const houseCount = buildOneHouseCountBreakdown({
      total: engineInput.householdHousingCount,
      houseCountExclusion: exclusion.houseCountExclusion,
      specialHouseExclusion: exclusion.specialHouseExclusionDetail,
      inheritedExclusion: exclusion.inheritedExclusion,
      houses: engineInput.houses,
    });

    const judgeInput = exclusion.exemptionJudgeInput;
    const inheritedPeriodConsolidation =
      judgeInput.acquisitionCause === "inheritance" &&
      judgeInput.decedentSameHouseholdBeforeInheritance === true
        ? {
            holdingStartDate: resolveExemptionHoldingStartDate(judgeInput).toISOString().slice(0, 10),
            residenceMonths: resolveExemptionResidenceMonths(judgeInput),
          }
        : undefined;

    const payload: OneHouseExemptionResponse = {
      judgment,
      judgmentBaseDate: judgmentBaseDate.toISOString().slice(0, 10),
      houseCount,
      ...(rentalVerdict ? { rentalHousingException: rentalVerdict } : {}),
      ...(oneRightVerdict ? { oneRightExemption: oneRightVerdict } : {}),
      ...(inheritedPeriodConsolidation ? { inheritedPeriodConsolidation } : {}),
      ...(contestedIssues.length > 0 ? { contestedIssues } : {}),
    };
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
