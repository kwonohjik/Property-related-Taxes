/**
 * 양도소득세 연간 합산 과세 계산 API Route
 *
 * POST /api/calc/transfer/multi
 *
 * Layer 1 (Orchestrator):
 *   Rate Limiting → Zod 검증 → preloadTaxRates (자산별 양도일 + 과세기간 말일) → calculateTransferTaxAggregate → 반환
 *
 * 가산세 2-pass:
 *   1차: filingPenalty·delayedPayment 없이 계산 → determinedTax 확보
 *   2차: determinedTax 주입 후 가산세 포함 재계산
 */

import { rentalPhrpPriceFieldErrors } from "@/lib/api/rental-phrp-price-guard";
import { rentalResidenceNoRosterFieldErrors } from "@/lib/api/rental-residence-roster-guard";
import { NextRequest, NextResponse } from "next/server";
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { rateDateKey, type RatesByTransferDate } from "@/lib/tax-engine/transfer-tax-item-rates";
import {
  calculateTransferTaxAggregate,
  type AggregateTransferInput,
  type TransferTaxItemInput,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import { TaxCalculationError, TaxErrorCode } from "@/lib/tax-engine/tax-errors";
import { taxCalculationErrorResponse } from "@/lib/api/tax-error-response";
import { checkRateLimit, getClientIp, shouldBypassRateLimit } from "@/lib/api/rate-limit";
import { assertFiniteResponse } from "@/lib/api/non-finite-guard";
import { toDate, toOptionalDate } from "@/lib/api/date-coerce";
import { multiInputSchema } from "@/lib/api/transfer-tax-schema";
import { toMultiEngineItem } from "./route-property-input";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { computePreliminaryFilingTaxes } from "@/lib/tax-engine/transfer-tax-preliminary-filing";
import { expandMultiGeneralBuildings } from "../multi-gb-expansion";
import { gbPreliminaryUnits } from "../multi-gb-expansion";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { resolveUnpaidTax } from "@/lib/tax-engine/transfer-tax-unpaid-tax";
import { ratesForTransferDate } from "@/lib/tax-engine/transfer-tax-item-rates";
import { anySameDayRightChangesConclusion, SAME_DAY_RIGHT_NOTICE } from "@/lib/tax-engine/one-house/same-day-right";

export async function POST(request: NextRequest) {
  // Rate Limiting — 분당 15회 (단건 30회의 절반)
  const ip = getClientIp(request);
  const rl = checkRateLimit(`transfer-multi:${ip}`, { limit: 15, windowMs: 60_000, bypass: shouldBypassRateLimit(request) });
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

  // JSON 파싱
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_JSON", message: "요청 본문을 파싱할 수 없습니다" } },
      { status: 400 },
    );
  }

  // Zod 검증
  const parsed = multiInputSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".");
      fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
    }
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

  const data = parsed.data;

  // §155⑳ B(임대 1호 이상) §161 기준시가 3개 필수 — 단건 route·계산기 ⑧(full)과 같은 규칙(결정 #19 X1-1)
  for (const [i, p] of data.properties.entries()) {
    // §155⑳ + 목록 없음 + 조특법 주택 수 제외 선언(건별 키 우선 — ⑭와 같은 fallback) — 단건 route와 같은 규칙(V-9)
    const phrpPriceErrors =
      rentalPhrpPriceFieldErrors(p.rentalHousingException, `properties.${i}.rentalHousingException`) ??
      rentalResidenceNoRosterFieldErrors(
        p.rentalHousingException,
        p.houses,
        p.specialHouseExclusions?.length ? p.specialHouseExclusions : data.specialHouseExclusions,
        `properties.${i}.specialHouseExclusions`,
      );
    if (phrpPriceErrors) {
      return NextResponse.json(
        { error: { code: TaxErrorCode.INVALID_INPUT, message: "입력값이 올바르지 않습니다", fieldErrors: phrpPriceErrors } },
        { status: 400 },
      );
    }
  }

  /**
   * 세율 로드 (Supabase 미도달 시 로컬 fallback) — **두 층**이다(E-14n).
   *   · 자산별: 그 자산의 **양도일**로 읽는다 — 단건 route(`route.ts` 단계 4)와 같은 기준. 연중에 시작하는
   *     행(`surcharge:_default` 2022-05-10 · `special:house_count_exclusion` 2018-04-01 ·
   *     `deduction:long_term_rental_v2` 2020-08-18 · `deduction:new_housing_matrix` 2001-05-23)이 있어
   *     과세기간 말일 하나로 읽으면 그 전 양도분이 다른 규정을 받는다.
   *   · 신고 단위: 과세기간 말일 — §103 기본공제 · §104⑤1호 §55① 누진표(제19196호 부칙 제14조 「과세기간」 기준).
   * RPC는 **양도일 중복 제거 + 1회**(최대 자산 20건 → 21회, 병렬).
   */
  const loadRates = async (date: Date) => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return loadFallbackTransferRates(date);
    try {
      const loaded = await preloadTaxRates(["transfer"], date);
      return loaded.size === 0 ? loadFallbackTransferRates(date) : loaded;
    } catch (err) {
      console.warn(
        "[POST /api/calc/transfer/multi] preloadTaxRates 실패, 로컬 세율 fallback 사용:",
        err,
      );
      return loadFallbackTransferRates(date);
    }
  };
  const rateDate = new Date(data.taxYear, 11, 31);
  const transferDates = new Map<string, Date>();
  for (const p of data.properties) {
    const d = toDate(p.transferDate, "transferDate");
    transferDates.set(rateDateKey(d), d);
  }
  transferDates.delete(rateDateKey(rateDate)); // 과세기간 말일 양도분은 신고 단위 세율과 같은 로드
  const [rates, ...itemRates] = await Promise.all([
    loadRates(rateDate),
    ...[...transferDates.values()].map(loadRates),
  ]);
  const ratesByTransferDate: RatesByTransferDate = new Map([
    [rateDateKey(rateDate), rates],
    ...[...transferDates.keys()].map((k, i) => [k, itemRates[i]] as const),
  ]);

  // string → Date 변환 (건별) — `route-property-input.ts`
  const properties: TransferTaxItemInput[] = data.properties.map((p) => toMultiEngineItem(p, data.specialHouseExclusions));

  // ⑭ 일반건물 — 단건 route처럼 토지·건물 카드로 펼친다(`multi-gb-expansion.ts` · 계획서 multi-building-valuation-support 트랙 G).
  //    지분 분할 취득(`generalBuildingShares`)은 단건 지분 경로와 같은 지분 조각으로 펼친다(트랙 GS — 단건 `route.ts`와 같은 진입 조건·같은 총양도가).
  const gbExpansion = expandMultiGeneralBuildings(properties, (i) => {
    const p = data.properties[i];
    if (p.propertyType === "general_building" && p.generalBuildingShares && p.generalBuildingShares.length > 1) {
      return {
        shares: {
          list: p.generalBuildingShares as never,
          // 물건 전체(100%) 양도가액 — 단건 지분 경로와 같은 정본(`totalPropertyTransferPrice ?? transferPrice`).
          totalTransferPrice: p.totalPropertyTransferPrice ?? p.transferPrice,
        },
      };
    }
    return p.propertyType === "general_building" && p.generalBuildingValuation
      ? {
          valuation: p.generalBuildingValuation as Record<string, unknown>,
          ownershipRatio: p.ownershipRatio,
          totalPropertyTransferPrice: p.totalPropertyTransferPrice,
        }
      : undefined;
  });

  // 엔진 입력 구성 (가산세 제외 1차)
  const engineInput: AggregateTransferInput = {
    taxYear: data.taxYear,
    properties: gbExpansion.properties,
    annualBasicDeductionUsed: data.annualBasicDeductionUsed,
    basicDeductionAllocation: data.basicDeductionAllocation,
    // 확정신고 기납부세액 정산 (§111③) — filing-level. finalInput 스프레드로 2-pass 모두 반영.
    priorPaidTax: data.priorPaidTax,
    priorPaidLocalTax: data.priorPaidLocalTax,
    // ⑭ §133 5년 누적 한도 — aggregate M-8(applyFiveYearLimits)에서 소비.
    // optional 필드라 TypeScript가 누락을 감지하지 못함 — 누락 시 5년 capping 상시 비활성.
    priorReductionUsage: data.priorReductionUsage ?? [],
    // ⑭ 크로스 §102② 외부 행 — optional 이라 TypeScript 가 누락을 감지하지 못한다.
    //    빠지면 통산이 **조용히 사라진다**(엔진은 자기 자산만으로 돌고 아무도 실패하지 않는다).
    crossLossOffsetExternal: data.crossLossOffsetExternal,
    // [B5] 신고서 단위 수정신고·경정청구 — 단건 route(:308~)와 동형 Date 변환.
    // amendment ⊥ 자산별 가산세라 2-pass에서 무해(§7.4). finalInput 스프레드로 2차 pass에 반영.
    amendment: data.amendment
      ? {
          originalDeterminedTax: data.amendment.originalDeterminedTax,
          // ⑭ NH-39 — 당초 농특세(단건 engine-input과 같은 키)
          originalRuralSurtax: data.amendment.originalRuralSurtax,
          applyUnderReportingPenalty: data.amendment.applyUnderReportingPenalty,
          underReportingReason: data.amendment.underReportingReason,
          underReductionMode: data.amendment.underReductionMode,
          statutoryFilingDeadline: toOptionalDate(data.amendment.statutoryFilingDeadline),
          amendedFilingDate: toOptionalDate(data.amendment.amendedFilingDate),
          priorAssessmentNotified: data.amendment.priorAssessmentNotified,
          applyLatePaymentPenalty: data.amendment.applyLatePaymentPenalty,
          amendedPaymentDate: toOptionalDate(data.amendment.amendedPaymentDate),
          correctionKind: data.amendment.correctionKind,
          claimReasonType: data.amendment.claimReasonType,
          posteriorEventDate: toOptionalDate(data.amendment.posteriorEventDate),
        }
      : undefined,
  };

  try {
    // 자산별 가산세 2-pass — 자산별 단건 엔진 호출 시 결정세액을 사전 계산해 주입.
    // 1차: 가산세 미주입 상태로 자산별 결정세액 산출.
    const baseResult = calculateTransferTaxAggregate(engineInput, rates, ratesByTransferDate);

    /**
     * 🔴 가산세 base는 **예정신고 세액**이다 — 집계 1차 pass의 자산별 standalone 값이 아니다(F03).
     *
     * 종전에는 `baseResult.properties[idx].determinedTax`를 그대로 넣었는데, 그 값은
     * `skipBasicDeduction: true`로 계산된다(집계가 §103 기본공제를 신고 단위로 따로 배분한다).
     * 그래서 **기본공제가 빠진 세액**이 base가 됐다 — 실측 200,000(0.85%) 과대.
     *
     * 「국세기본법」 §47의2①의 base는 「그 신고로 납부하여야 할 세액」이고 괄호가 **예정신고를
     * 포함**한다. 그 세액은 「소득세법」 §107①이 정한 (양도차익 − 장특 − **기본공제**) × 세율이다.
     * 기본공제 배분 순서는 §103②이 「먼저 양도한 자산부터 순서대로」로 **명문화**했다.
     */
    const preliminary = computePreliminaryFilingTaxes(
      engineInput.properties as unknown as TransferTaxInput[],
      rates,
      engineInput.annualBasicDeductionUsed,
      calculateTransferTax,
      ratesByTransferDate,
      // 일반건물 1건 = 예정신고 1건 — 카드 묶음을 한 번에 계산한다(`multi-gb-expansion.ts`).
      gbPreliminaryUnits(gbExpansion.cardUnits, data.taxYear, rates, ratesByTransferDate),
    );

    // 자산별 결정세액·미납세액 주입 후 2차 계산 (가산세 자산별 합산 반영).
    const enrichedProperties = engineInput.properties.map((p, idx) => {
      const pre = preliminary.get(idx);
      const breakdown = baseResult.properties[idx];
      const determinedTax = pre?.determinedTax ?? breakdown?.determinedTax ?? 0;
      const reductionAmount = pre?.reductionAmount ?? breakdown?.reductionAmount ?? 0;
      const enriched: TransferTaxItemInput = { ...p };
      if (p.filingPenaltyDetails) {
        enriched.filingPenaltyDetails = {
          ...p.filingPenaltyDetails,
          determinedTax,
          reductionAmount,
        };
      }
      if (p.delayedPaymentDetails) {
        enriched.delayedPaymentDetails = {
          ...p.delayedPaymentDetails,
          unpaidTax: resolveUnpaidTax(p.delayedPaymentDetails, determinedTax),
          // NH-38 — 농특세분 납부지연가산세 base도 예정신고 값(소득세분 F03과 같은 축)
          ...(pre ? { ruralSurtaxForPenalty: pre.ruralSurtax } : {}),
        };
      }
      return enriched;
    });

    const finalInput: AggregateTransferInput = { ...engineInput, properties: enrichedProperties };
    const result = calculateTransferTaxAggregate(finalInput, rates, ratesByTransferDate);
    // 양도일과 같은 날 취득한 권리를 보유로 세면 어느 자산의 결론이 달라질 때만 확인 필요를 싣는다(코드 리뷰 결정 #1) — 단건과 같은 고지.
    if (
      anySameDayRightChangesConclusion(finalInput.properties as unknown as TransferTaxInput[], (i) =>
        // 자산 하나만의 단독 계산 — 예정신고 세액 계산(`computePreliminaryFilingTaxes`)과 같은 모양으로 집계 컨텍스트를 뺀다.
        calculateTransferTax(
          {
            ...i,
            annualBasicDeductionUsed: finalInput.annualBasicDeductionUsed,
            skipBasicDeduction: false,
            amendment: undefined,
            filingPenaltyDetails: undefined,
            delayedPaymentDetails: undefined,
          },
          ratesForTransferDate(i.transferDate, rates, ratesByTransferDate),
        ),
      )
    ) {
      result.warnings = [...result.warnings, SAME_DAY_RIGHT_NOTICE];
    }
    if (Object.keys(gbExpansion.detailsByAsset).length > 0) result.generalBuildingDetailsByAsset = gbExpansion.detailsByAsset;
    // NaN·Infinity는 JSON에서 null이 되어 200으로 나간다 — 반환 전에 끊는다(E-14l).
    assertFiniteResponse(result);
    return NextResponse.json({ data: result }, { status: 200 });
  } catch (err) {
    // INVALID_INPUT → 400 (+ details.path가 있으면 fieldErrors) — `lib/api/tax-error-response.ts`
    if (err instanceof TaxCalculationError) return taxCalculationErrorResponse(err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "계산 중 오류가 발생했습니다" } },
      { status: 500 },
    );
  }
}
