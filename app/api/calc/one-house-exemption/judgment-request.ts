/**
 * 판정 메뉴 route 공용 전처리 — 1세대1주택 비과세 판정(`/api/calc/one-house-exemption`)과
 * 다주택 중과 판정(`/api/calc/multi-house-surcharge-judgment`)이 **같은 배관**을 쓴다(계획서 T1).
 *
 * 「화면은 나누고 엔진은 하나」 — 두 route가 Zod·Date 변환·엔진 input 조립·주택 수 도출·세율 로드를 따로 가지면
 * 필드 하나가 어긋나는 순간 두 메뉴가 같은 폼으로 다른 답을 낸다. 여기 함수들은 종전 1주택 route 본문을 그대로 옮긴 것이다
 * (동작 불변 — 1주택 route anchor가 지킨다).
 */
import { NextRequest, NextResponse } from "next/server";
import type { z } from "zod";
import { preloadTaxRates, loadFallbackTransferRates, type TaxRatesMap } from "@/lib/db/tax-rates";
import { TaxErrorCode } from "@/lib/tax-engine/tax-errors";
import { toDate, toOptionalDate } from "@/lib/api/date-coerce";
import { checkRateLimit, getClientIp, shouldBypassRateLimit } from "@/lib/api/rate-limit";
import type { PropertySchemaInput } from "@/lib/api/transfer-tax-schema";
import { buildTransferEngineInput } from "../transfer/engine-input";
import { parseRatesFromMap, type ParsedRates } from "@/lib/tax-engine/transfer-tax-helpers";
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
import { withSameDayRightNotice } from "@/lib/tax-engine/one-house/same-day-right";
import { resolveRightSaleSpecialExclusion } from "@/lib/tax-engine/one-house/right-sale-special-act-exclusion";
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

/** 단계 0: Rate Limiting — 계산 route와 같은 분당 30회. 막히면 429 응답, 통과하면 null. */
export function judgmentRateLimitResponse(request: NextRequest, keyPrefix: string): NextResponse | null {
  const ip = getClientIp(request);
  const rl = checkRateLimit(`${keyPrefix}:${ip}`, {
    limit: 30,
    windowMs: 60_000,
    bypass: shouldBypassRateLimit(request),
  });
  if (rl.allowed) return null;
  return NextResponse.json(
    { error: { code: "RATE_LIMITED", message: "요청이 너무 많습니다. 잠시 후 다시 시도하세요" } },
    { status: 429 },
  );
}

/** 단계 1: JSON 파싱 — 실패하면 400 응답. */
export async function parseJudgmentJson(request: NextRequest): Promise<{ body: unknown } | { response: NextResponse }> {
  try {
    return { body: await request.json() };
  } catch {
    return {
      response: NextResponse.json(
        { error: { code: "INVALID_JSON", message: "요청 본문을 파싱할 수 없습니다" } },
        { status: 400 },
      ),
    };
  }
}

/** 단계 2 실패: Zod 오류 → 400(`fieldErrors`). */
export function judgmentZodErrorResponse(error: z.ZodError, logTag: string): NextResponse {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "_root";
    fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
  }
  console.error(`[${logTag}] zod validation failed`, {
    issueCount: error.issues.length,
    issues: error.issues.map((i) => ({ path: i.path, message: i.message, code: i.code })),
  });
  return NextResponse.json(
    { error: { code: TaxErrorCode.INVALID_INPUT, message: "입력값이 올바르지 않습니다", fieldErrors } },
    { status: 400 },
  );
}

/**
 * 단계 3~4: string → Date(⑭ `date-coerce`) · 엔진 input 조립 · **주택 수 명부 도출**(G-1 · D-3).
 *
 * 계산기는 사용자가 선언한 스칼라를 쓰지만 판정 메뉴에는 그 위젯이 없다. 본문에 실려 온 값을 그대로 쓰면
 * 「명부가 정본」이 무너지고, 조작된 본문으로 판정을 흔들 수도 있다.
 */
export function buildJudgmentEngineInput(data: PropertySchemaInput): {
  engineInput: TransferTaxInput;
  transferDate: Date;
  isRightSale: boolean;
} {
  const transferDate = toDate(data.transferDate, "transferDate");
  const acquisitionDate = toDate(data.acquisitionDate, "acquisitionDate");
  const assetContractDate = toOptionalDate(data.assetContractDate);
  const baseInput = buildTransferEngineInput(data, transferDate, acquisitionDate, assetContractDate);

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
  return { engineInput, transferDate, isRightSale };
}

/**
 * 단계 5: 세율 로드(원본 맵) — 계산기와 동일한 graceful fallback 정책.
 * 다주택 중과 판정의 세부담 시뮬레이션(`calculateTransferTax`)은 원본 맵을 받는다.
 */
export async function loadJudgmentRateMap(transferDate: Date, logTag: string): Promise<TaxRatesMap> {
  let rates: TaxRatesMap;
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    try {
      rates = await preloadTaxRates(["transfer"], transferDate);
      if (rates.size === 0) rates = loadFallbackTransferRates(transferDate);
    } catch (err) {
      console.warn(`[POST ${logTag}] preloadTaxRates 실패, 로컬 fallback:`, err);
      rates = loadFallbackTransferRates(transferDate);
    }
  } else {
    rates = loadFallbackTransferRates(transferDate);
  }
  return rates;
}

/** 단계 5: 세율 로드(판정용 파싱) */
export async function loadJudgmentRates(transferDate: Date, logTag: string): Promise<ParsedRates> {
  return parseRatesFromMap(await loadJudgmentRateMap(transferDate, logTag));
}

/**
 * 단계 6~: 1세대1주택 비과세 판정 응답 조립 — 1주택 route의 본문이고, 중과 판정 route가 D3a 요약으로 같은 것을 싣는다.
 */
export function buildOneHouseExemptionPayload(
  engineInput: TransferTaxInput,
  parsedRates: ParsedRates,
  judgmentBaseDate: Date,
  isRightSale: boolean,
): OneHouseExemptionResponse {
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

  // 입주권 양도 판정이 「다른 주택」에서 빼는 것은 해석례로 확인된 보유 감면주택 4개 조문과 명부 도출 §71의2①뿐이다(§99의4·§98의9·
  // 그 밖의 조문은 효과가 없다) — 명세도 판정과 같은 목록으로 만든다(`oneRightInputAfterSpecialActExclusionOf`와 같은 leaf · S03-6 · 결정 #42).
  const houseCount = buildOneHouseCountBreakdown({
    total: engineInput.householdHousingCount,
    houseCountExclusion: isRightSale ? { appliedList: [], details: [] } : exclusion.houseCountExclusion,
    specialHouseExclusion: isRightSale ? resolveRightSaleSpecialExclusion(engineInput) : exclusion.specialHouseExclusionDetail,
    inheritedExclusion: exclusion.inheritedExclusion,
    // 입주권 양도 판정은 §155②③ 상속주택을 「다른 주택」에서 빼지 않는다 — 명세도 같은 입장이어야 한다(S03-6).
    inheritedExclusionApplies: !isRightSale,
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

  // 양도일과 같은 날 취득한 권리를 보유로 세면 결론이 달라질 때만 확인 필요를 덧붙인다(코드 리뷰 결정 #1) — 같은 파이프라인 재실행.
  const judgmentWithSameDayNotice = withSameDayRightNotice(
    engineInput,
    judgment,
    (counterfactual) =>
      runOneHouseJudgmentPipeline(counterfactual, parsedRates, judgmentBaseDate, isRightSale).judgment,
  );

  return {
    judgment: judgmentWithSameDayNotice,
    judgmentBaseDate: judgmentBaseDate.toISOString().slice(0, 10),
    houseCount,
    ...(rentalVerdict ? { rentalHousingException: rentalVerdict } : {}),
    ...(oneRightVerdict ? { oneRightExemption: oneRightVerdict } : {}),
    ...(inheritedPeriodConsolidation ? { inheritedPeriodConsolidation } : {}),
    ...(contestedIssues.length > 0 ? { contestedIssues } : {}),
  };
}
