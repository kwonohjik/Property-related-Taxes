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
 * ## 이 route가 계산기와 다른 점은 셋뿐이다
 *
 *   1. 세액을 계산하지 않는다 — `judgeOneHouseExemptionFromInput`까지만 간다.
 *   2. **주택 수를 명부에서 도출**해 덮어쓴다(G-1 · D-3). 본문이 보낸
 *      `householdHousingCount`는 **믿지 않는다** — 판정 메뉴에는 그 입력 위젯 자체가 없다.
 *   3. 주택 수 산정 명세(`houseCount`)를 응답에 함께 싣는다.
 */

import { NextRequest, NextResponse } from "next/server";
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { TaxCalculationError, TaxErrorCode } from "@/lib/tax-engine/tax-errors";
import { toDate, toOptionalDate } from "@/lib/api/date-coerce";
import { checkRateLimit, getClientIp, shouldBypassRateLimit } from "@/lib/api/rate-limit";
import { propertySchema as inputSchema } from "@/lib/api/transfer-tax-schema";
import { buildTransferEngineInput } from "../transfer/engine-input";
import { parseRatesFromMap, presaleRightStartDate } from "@/lib/tax-engine/transfer-tax-helpers";
import { runHouseCountExclusionStep } from "@/lib/tax-engine/transfer-tax-house-exclusion-step";
import { judgeOneHouseExemptionFromInput } from "@/lib/tax-engine/one-house/judge";
import {
  buildRentalHousingVerdict,
  applyRentalHousingVerdict,
  type OneHouseRentalHousingVerdict,
} from "@/lib/tax-engine/one-house/rental-housing-verdict";
import {
  buildOneHouseCountBreakdown,
  deriveHouseholdHousingCount,
  deriveHouseholdRightCount,
  type OneHouseCountBreakdown,
} from "@/lib/tax-engine/one-house/house-count";
import {
  buildOneRightVerdict,
  applyOneRightVerdict,
  type OneHouseOneRightVerdict,
} from "@/lib/tax-engine/one-house/one-right-verdict";
import type { OneHouseJudgment } from "@/lib/tax-engine/one-house/types";
import type { CalculationStep, TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

/** 판정 메뉴 응답 — 화면(④ 결과)이 읽는 전부. */
export type OneHouseExemptionResponse = {
  judgment: OneHouseJudgment;
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

    /**
     * 단계 6: 주택 수 제외 → 판정.
     *
     * 계산기(`transfer-tax.ts` STEP 0.9 → STEP 1)와 **같은 순서·같은 함수**다.
     * `steps`는 계산기 표시용이라 여기서는 받아서 버린다 — 판정 메뉴는 세액 산식을 보여주지 않는다.
     */
    const steps: CalculationStep[] = [];
    const exclusion = runHouseCountExclusionStep(engineInput, steps);
    const coreJudgment = judgeOneHouseExemptionFromInput(
      exclusion.exemptionJudgeInput,
      parsedRates.oneHouseSpecialRules,
      presaleRightStartDate(parsedRates),
    );

    /**
     * 단계 6.5: §155⑳ 장기임대주택 특례 (P4-3a).
     *
     * 계산기는 이것을 **STEP 2.5**(`checkExemption` 이후)에서 본다. 판정 route는 거기까지
     * 가지 않으므로 여기서 **같은 leaf**를 부른다. 부르지 않으면 임대 요건을 하나도 보지 않은 채
     * 「1주택 → 비과세」가 나온다(over-exemption).
     */
    const rentalVerdict = buildRentalHousingVerdict(engineInput);
    const afterRental = applyRentalHousingVerdict(coreJudgment, rentalVerdict);

    /**
     * 단계 6.6: §89①4호 1세대1입주권 (P4-3b).
     *
     * 🔴 §155⑳과 **방향이 반대다** — 여기는 비과세를 **켠다**. `checkExemption`의 자산 게이트
     *    (`propertyType !== "housing"`)가 입주권을 항상 과세로 돌려보내기 때문에, 켜 주지 않으면
     *    판정 메뉴가 §89①4호 비과세를 영원히 말하지 못한다.
     */
    const oneRightVerdict = buildOneRightVerdict(engineInput, isRightSale);
    const judgment = applyOneRightVerdict(afterRental, oneRightVerdict);

    const houseCount = buildOneHouseCountBreakdown({
      total: engineInput.householdHousingCount,
      houseCountExclusion: exclusion.houseCountExclusion,
      specialHouseExclusion: exclusion.specialHouseExclusionDetail,
      inheritedExclusion: exclusion.inheritedExclusion,
    });

    const payload: OneHouseExemptionResponse = {
      judgment,
      houseCount,
      ...(rentalVerdict ? { rentalHousingException: rentalVerdict } : {}),
      ...(oneRightVerdict ? { oneRightExemption: oneRightVerdict } : {}),
    };
    return NextResponse.json({ data: payload }, { status: 200 });
  } catch (err) {
    console.error("[/api/calc/one-house-exemption] engine error:", err);
    if (err instanceof TaxCalculationError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status: 500 },
      );
    }
    const errMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: { code: "CALCULATION_FAILED", message: errMsg } },
      { status: 500 },
    );
  }
}
