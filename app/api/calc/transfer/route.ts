/**
 * 양도소득세 계산 API Route
 *
 * Layer 1 (Orchestrator):
 *   Zod 입력 검증 → preloadTaxRates → calculateTransferTax → 결과 반환
 *
 * POST /api/calc/transfer
 */

import { rentalPhrpPriceFieldErrors } from "@/lib/api/rental-phrp-price-guard";
import { NextRequest, NextResponse } from "next/server";
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { mapReductionsToEngine } from "./route-reductions-mapper";
import { buildNblEngineInput } from "@/lib/calc/non-business-land-request";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import { buildMixedUseAssetInput } from "./mixed-use-asset-input";
import { pickArticle89Clause2Facts } from "@/lib/tax-engine/transfer-tax-89-2-consequences";
import { dispatchGeneralBuilding } from "./general-building-route-helper";
import { calculateGeneralBuildingFractional } from "./general-building-fractional";
import { calculateBundledTransfer } from "./bundled-route";
import { calculateCarryoverDebtTransfer } from "./carryover-debt-route";
import { TaxCalculationError, TaxErrorCode } from "@/lib/tax-engine/tax-errors";
import { taxCalculationErrorResponse } from "@/lib/api/tax-error-response";
import { toDate, toOptionalDate } from "@/lib/api/date-coerce";
import { checkRateLimit, getClientIp, shouldBypassRateLimit } from "@/lib/api/rate-limit";
import { assertFiniteResponse } from "@/lib/api/non-finite-guard";
import {
  propertySchema as inputSchema,
} from "@/lib/api/transfer-tax-schema";
import { buildTransferEngineInput } from "./engine-input";
import { resolveUnpaidTax } from "@/lib/tax-engine/transfer-tax-unpaid-tax";
import {
  mixedUseWithSameDayRightWarning,
  withSameDayRightWarning,
} from "@/lib/tax-engine/one-house/same-day-right";

/**
 * 성공 응답 — NaN·Infinity가 있으면 던져 아래 `catch`가 500으로 응답한다(E-14l).
 * `NextResponse.json`은 NaN을 `null`로 직렬화해 200으로 내보내므로, 여기서 끊지 않으면
 * 계산이 깨진 결과가 정상 응답으로 보인다(`lib/api/non-finite-guard.ts`).
 */
function okJson<T>(body: T) {
  assertFiniteResponse(body);
  return NextResponse.json(body, { status: 200 });
}

// ============================================================
// POST handler (⑫-2, ⑫-3)
// ============================================================

export async function POST(request: NextRequest) {
  // 단계 0: Rate Limiting — 분당 30회 (C6)
  const ip = getClientIp(request);
  const rl = checkRateLimit(`transfer:${ip}`, { limit: 30, windowMs: 60_000, bypass: shouldBypassRateLimit(request) });
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

  // 단계 2: Zod 검증
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      // path가 빈 배열인 경우(superRefine top-level issue 등) "_root" 키로 변환 — 빈 문자열 키는 console에서 `{}`로 표시되어 디버깅 어려움
      const key = issue.path.length > 0 ? issue.path.join(".") : "_root";
      fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
    }
    // 서버 측 전체 issue 로그 — 클라이언트 콘솔 외에 서버 로그도 남김 (Vercel 로그 추적용)
    console.error("[transfer-tax route] zod validation failed", {
      issueCount: parsed.error.issues.length,
      issues: parsed.error.issues.map((i) => ({
        path: i.path,
        message: i.message,
        code: i.code,
      })),
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

  // 단계 2b: §155⑳ B(임대 1호 이상) §161 기준시가 3개 필수 — 계산기 ⑧(full)과 같은 규칙. 판정 메뉴 route는 같은 스키마를 쓰지만 이 입력을 받지 않아
  //   스키마가 아니라 계산 route에서만 건다(결정 #19 X1-1 · Q-7).
  const phrpPriceErrors = rentalPhrpPriceFieldErrors(parsed.data.rentalHousingException);
  if (phrpPriceErrors) {
    return NextResponse.json(
      { error: { code: TaxErrorCode.INVALID_INPUT, message: "입력값이 올바르지 않습니다", fieldErrors: phrpPriceErrors } },
      { status: 400 },
    );
  }

  // 단계 3: string → Date 변환 (`lib/api/date-coerce.ts` 헬퍼 — invalid 시 명확한 에러 메시지)
  const data = parsed.data;
  const transferDate = toDate(data.transferDate, "transferDate");
  const acquisitionDate = toDate(data.acquisitionDate, "acquisitionDate");
  // Round 9 (2026-05-06): 자산-수준 매매계약일 string → Date 변환
  const assetContractDate = toOptionalDate(data.assetContractDate);

  const engineInput: TransferTaxInput = buildTransferEngineInput(
    data,
    transferDate,
    acquisitionDate,
    assetContractDate,
  );

  // 단계 4: 세율 로드 (Supabase 미도달 시 로컬 세율 fallback — 양도세 계산 지속)
  //   재산세·종부세 route와 동일한 graceful 정책. 양도세 엔진은 rates 필수(throw)이므로
  //   undefined 대신 항상 유효한 TaxRatesMap을 보장 (loadFallbackTransferRates).
  let rates;
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    try {
      rates = await preloadTaxRates(["transfer"], transferDate);
      // 테이블 존재하나 비어있는 경우(시딩 전)도 로컬 fallback
      if (rates.size === 0) rates = loadFallbackTransferRates(transferDate);
    } catch (err) {
      console.warn(
        "[POST /api/calc/transfer] preloadTaxRates 실패, 로컬 세율 fallback 사용:",
        err,
      );
      rates = loadFallbackTransferRates(transferDate);
    }
  } else {
    // 환경변수 미설정 — 로컬 개발/오프라인 (CLAUDE.md: graceful 통과)
    rates = loadFallbackTransferRates(transferDate);
  }

  // 단계 5: 계산 실행
  try {
    // ─── 5-0. 일반건물 × 지분(%) 분할 취득 — **5-a보다 앞** ─────────
    //
    // 같은 물건을 지분별로 나눠 취득(취득일·취득원인·취득방식 상이)한 뒤 100%를 일괄 양도하는 경우.
    // 지분마다 토지·건물 카드를 만들어 concat 후 aggregate를 1회만 한다.
    //
    // 🔴 **5-a보다 앞이어야 한다.** 뒤에 두면 companion 유무와 무관하게 일괄 분기가 먼저 잡아
    //    일반건물 계산이 통째로 사라진다(`transfer.route.bundled-swallows-special.test.ts`).
    //    조건에 `propertyType`을 함께 검사해 다른 특수 경로를 삼키지 않음을 명시한다
    //    (메모리 `feedback_route_if_chain_order_swallows_branches`).
    if (
      data.propertyType === "general_building" &&
      data.generalBuildingShares &&
      data.generalBuildingShares.length > 1
    ) {
      const { apportionment, aggregated, transferBurdenedGiftBreakdown } = calculateGeneralBuildingFractional(
        data.generalBuildingShares as never,
        // 물건 전체(100%) 양도가액. 지분 모드에서는 `totalPropertyTransferPrice`가 정본이다.
        data.totalPropertyTransferPrice ?? data.transferPrice,
        transferDate,
        transferDate.getFullYear(),
        data.annualBasicDeductionUsed,
        data.priorReductionUsage ?? [],
        rates,
        // ⑭ 신고서 단위 정정 — 세 GB 경로가 같은 규약이어야 한다(raw `data.amendment` 금지).
        engineInput.amendment,
        // 🔴 G-13 ⑭ 신고서 단위 가산세 — 형제 두 GB 경로와 같은 값을 넘긴다.
        engineInput.filingPenaltyDetails,
        engineInput.delayedPaymentDetails,
        // 첫 지분 감면 — 형제 두 GB 경로와 같은 값(둘째 지분부터는 지분 payload의 `reductions`).
        engineInput.reductions,
        // 부담부증여(소령 §159) — 지분별 info 는 지분 payload 안에 있다. 물건 단위 증여세·§159 명세는 `burdenedGiftWholeInfo`(④ 축 B 전용).
        //   🔴 이 조건 없이 info 를 안 넘기면 지분이 일반 양도로 계산된다(종전 결함 — 채무 전액이 양도차익).
        data.transferType === "burdened_gift" ? { wholeInfo: data.burdenedGiftWholeInfo, date: transferDate } : undefined,
      );
      return okJson(
        { data: { mode: "bundled" as const, apportionment, aggregated, ...(transferBurdenedGiftBreakdown ? { transferBurdenedGiftBreakdown } : {}) } },
      );
    }

    // ─── 5-a. 일괄양도 분기 (소득세법 시행령 §166 ⑥) — `bundled-route.ts` ─────────────
    const bundled = calculateBundledTransfer(data, engineInput, rates, transferDate, acquisitionDate);
    if (bundled) return okJson({ data: bundled });

    // ─── 5-a-2. 겸용주택 분리계산 경로 (sodt §160①단서, 2022.1.1 이후) ───
    if (data.propertyType === "mixed-use-house" && data.mixedUse) {
      /**
       * ⑭ 겸용 엔진 입력 — **조립은 `buildMixedUseAssetInput` leaf가 한다**(단일 소스).
       *
       * 🔑 25필드 대부분이 optional이라 손으로 옮기면 한 줄 누락이 조용히 세액을 바꾼다.
       *    컴패니언 겸용(`bundled-split-helpers.ts`)이 **같은 leaf**를 쓰므로 경로에 따라
       *    같은 물건이 다른 값이 되는 일이 없다 — GB의 `buildGbPartCards`와 같은 층위.
       *
       * ⚠️ 날짜를 갖는 값은 전부 `engineInput` 변환본이다(Zod 출력은 string).
       */
      // 세대 보유 권리(`presaleRights`)와 §89② 세대 사실이 `ei`에서 갈라진다 — 같은 날 권리 반사실(결정 #1)이 같은 조립을 다시 탄다.
      const mixedUseInput = data.mixedUse; // 클로저 안에서 좁힘이 풀리지 않게 고정
      const buildMixedAsset = (ei: TransferTaxInput) => buildMixedUseAssetInput({
        mixedUse: mixedUseInput,
        transferDate,
        ownershipRatio: data.ownershipRatio,
        isUnregistered: data.isUnregistered,
        totalPropertyTransferPrice: data.totalPropertyTransferPrice,
        reductions: engineInput.reductions,
        // §155의3 상생임대 (P5-c) — ⚠️ `engineInput`(Date 변환본). raw `data.*`는 계약일이 string이다.
        winWinRentalHouse: engineInput.winWinRentalHouse,
        giftHouseholdBasis: engineInput.giftHouseholdBasis, // ⑭ 결정 #38 후속 — 증여 세대 사실(Date 변환본) · 겸용 §154① 판정이 단건과 같은 leaf로 읽는다
        filingPenaltyDetails: engineInput.filingPenaltyDetails,
        delayedPaymentDetails: engineInput.delayedPaymentDetails,
        assetContractDate: engineInput.assetContractDate,
        decedentAcquisitionDate:
          engineInput.acquisitionCause === "inheritance" ? engineInput.decedentAcquisitionDate : undefined,
        nonHeirBequest: engineInput.acquisitionCause === "inheritance" ? engineInput.nonHeirBequest : undefined,
        wasRegulatedAtAcquisition: data.wasRegulatedAtAcquisition,
        regionCode: data.regionCode,
        regionInDesignatedDistrict: data.regionInDesignatedDistrict,
        oneHouseExemptionProviso: engineInput.oneHouseExemptionProviso,
        temporaryTwoHouse: engineInput.temporaryTwoHouse,
        householdHousingCount: data.householdHousingCount,
        // ⑭ §155②③ 상속주택 제외 (E-14d) — ⚠️ `engineInput`(증여일 Date 변환본).
        inheritedHouseExclusion: {
          generalHouseGiftedFromDecedentWithin2yr: engineInput.generalHouseGiftedFromDecedentWithin2yr,
          generalHouseGiftDate: engineInput.generalHouseGiftDate,
          generalHouseRightAtInheritance: engineInput.generalHouseRightAtInheritance,
        },
        specialHouseExclusions: engineInput.specialHouseExclusions,
        // ⑭ §155⑥1호·⑦·⑧ 특례 주택 선언 (S08-3) — ⚠️ `engineInput`(귀농주택 취득일·부득이 해소일 Date 변환본).
        article155SpecialHouses: {
          ruralHouse: engineInput.ruralHouse,
          culturalHeritageHouse: engineInput.culturalHeritageHouse,
          unavoidableOutsideCapitalHouse: engineInput.unavoidableOutsideCapitalHouse,
        },
        // ⑭ §89② 세대 사실 (E-7) — ⚠️ `engineInput`(권리 취득일·합가일 등 Date 변환본).
        article89Clause2Facts: pickArticle89Clause2Facts(ei),
        isOneHousehold: data.isOneHousehold,
        isRegulatedArea: data.isRegulatedArea,
        isSelfCultivatedExpropriatedLand: data.isSelfCultivatedExpropriatedLand,
        priorReductionUsage: data.priorReductionUsage ?? [],
        rawHouses: data.houses,
        houses: engineInput.houses,
        sellingHouseId: data.sellingHouseId,
        presaleRights: ei.presaleRights,
        marriageMerge: engineInput.marriageMerge,
        parentalCareMerge: engineInput.parentalCareMerge,
        isFirstTransferredInMerge: engineInput.isFirstTransferredInMerge,
        gracePeriod: engineInput.gracePeriod,
        unavoidableOutsideCapitalHouse: engineInput.unavoidableOutsideCapitalHouse,
        // ⑭ 겸용 × 부담부증여(소령 §159) — 양도 형태가 부담부증여일 때만 싣는다. 가드(MB-1~17)는 ⑫가 입구에서, 엔진이 다시 던진다.
        burdenedGift: data.transferType === "burdened_gift" ? data.burdenedGiftInfo : undefined,
        acquisitionCause: data.acquisitionCause,
      });

      const calcMixed = (ei: TransferTaxInput) =>
        calcMixedUseTransferTax(
          data.transferPrice,
          new Date(data.transferDate),
          buildMixedAsset(ei),
          rates,
          // 신고서 단위 수정신고·경정청구 — engineInput.amendment는 상단(:308~)에서 Date 변환 완료.
          // ⚠️ raw data.amendment 전달 금지: Zod 출력은 string이라 §48② 감면율 판정(isAfter)이 침묵 오작동.
          engineInput.amendment,
        );
      // 양도일과 같은 날 취득한 권리를 보유로 세면 주택분 비과세·총세액이 달라질 때만 확인 필요를 싣는다(코드 리뷰 결정 #1) — 단건과 같은 고지.
      const mixedResult = mixedUseWithSameDayRightWarning(engineInput, calcMixed(engineInput), calcMixed);
      return okJson(
        { data: { mode: "mixed-use" as const, result: mixedResult } },
      );
    }

    // ─── 5-a-3. 일반건물(토지+건물 일괄) — actualPriceMode 플래그로 내부 분기 ───
    if (data.propertyType === "general_building" && data.generalBuildingValuation) {
      const gbv = data.generalBuildingValuation as Record<string, unknown>;
      // 증축 케이스(bundledAcquisitionPrice 포함 시): 환산취득가 모드에서 acquisitionPrice=0이므로
      // generalBuildingValuation.bundledAcquisitionPrice를 실제 취득가·필요경비로 사용.
      // 비증축(사례 31·32): 환산취득가는 기준시가 비율로 엔진이 직접 계산하므로 0이어도 무방.
      const bundledAcq = (gbv.bundledAcquisitionPrice as number | undefined) ?? engineInput.acquisitionPrice ?? 0;
      // 부담부증여 K-4(실지취득가 안분)는 개산공제 미적용 — 자본적지출+양도비를 actualExpenses로 전달.
      // (general-building-route-helper가 buildBurdenedGiftBreakdown.capitalExpenditure로 넘겨 채무비율 안분.)
      //
      // 「소득세법」 제97조 제2항 제1호: 「취득가액을 **실지거래가액**에 의하는 경우의 필요경비는
      // 다음 각 목의 금액에 **제1항제2호 및 제3호의 금액을 더한 금액**으로 한다」 ⇒ K-4에서는
      // 자본적지출·양도비가 반드시 도달해야 한다(같은 항 제2호 「그 밖의 경우」의 개산공제와 대비).
      const isBurdenedGiftActualGb =
        data.transferType === "burdened_gift" &&
        data.burdenedGiftInfo?.acquisitionMethod === "actual";
      const legacyBundledExp = (gbv.bundledExpenses as number | undefined) ?? engineInput.expenses ?? 0;
      /**
       * 🔴 **legacy 후퇴**(2026-08-07 W-4). 종전에는 K-4에서 `capitalExpenditure + transferExpense`
       * **만** 보고 legacy `directExpenses`를 아예 보지 않았다 ⇒ legacy 칸만 채운 입력·기존 이력에서
       * 필요경비가 **0으로 소실**됐다(실측 결정세액 **6,049,763원 과대** — 비용 4,000만 기준).
       *
       * 후퇴 조건은 실가 경로 `effectiveExpenses`(general-building-route-actual.ts)와 **같은 축**이다:
       * 신규 두 칸이 **둘 다 0일 때만** legacy로 내려간다. 합산하면 이중계상이 된다.
       */
      const bundledExp = isBurdenedGiftActualGb
        ? ((engineInput.capitalExpenditure ?? 0) + (engineInput.transferExpense ?? 0)) || legacyBundledExp
        : legacyBundledExp;
      // 부담부증여 §159 — actualPriceMode 분기에서 §159①1호 환산 적용용 정보 전달.
      // BurdenedGiftInfo 타입은 string Date 허용이지만, 엔진 buildBurdenedGiftBreakdown은 필드 그대로 사용.
      const burdenedGiftInfoForGb =
        data.transferType === "burdened_gift" && data.burdenedGiftInfo
          ? data.burdenedGiftInfo
          : undefined;
      const { apportionment, aggregated, transferBurdenedGiftBreakdown } = dispatchGeneralBuilding(
        gbv,
        data.transferPrice, transferDate, acquisitionDate,
        bundledAcq, bundledExp,
        transferDate.getFullYear(), data.annualBasicDeductionUsed,
        data.priorReductionUsage ?? [], rates,
        burdenedGiftInfoForGb,
        // ⑭ §164⑨ 1호 공익수용 특례 (토지 전용 — D16-GB): top-level 특례 필드 전달.
        {
          transferCause: data.transferCause,
          compensationPerSqm: data.compensationPerSqm,
          compensationBasisStdPrice: data.compensationBasisStdPrice,
        },
        data.ownershipRatio,
        /**
         * ⑭ 자산-수준 감면·가산세 (F17, 2026-08-23).
         *
         * 종전에는 이 두 가지가 **여기서 버려졌다** — 클라이언트는 자산 종류와 무관하게
         * `reductions`·`filingPenaltyDetails`를 싣고 Zod도 받는데, GB 분기가 인자로 넘기지
         * 않아 세액이 1원도 안 움직였다(실측 Δ 0 · 같은 payload가 단건 경로에서는 움직인다).
         *
         * ⚠️ `data.reductions`(raw)가 아니라 **`engineInput.reductions`**를 쓴다 —
         *    Zod 출력은 일자가 string이라 §77①의 「소급 2년」 비교가 침묵 오작동한다
         *    (`mapReductionsToEngine`가 Date로 바꾼 값이 정본).
         */
        {
          reductions: engineInput.reductions,
          filingPenaltyDetails: engineInput.filingPenaltyDetails,
          delayedPaymentDetails: engineInput.delayedPaymentDetails,
          // 공유지분 — 계약 총액(100%). §100③을 계약서 금액으로 판정한다(`sale-split-100-3-share-scale-judgment.plan.md`).
          contractTotalPrice: data.totalPropertyTransferPrice,
          /**
           * ⑭ 배우자등 이월과세 (F27) — **부담부증여 §159 분기가 소비한다**.
           *
           * 종전에는 ⑧이 「당초 증여자」 기준시가 두 칸을 필수로 요구하면서 그 값이
           * 엔진에 닿지 않았다(실측 Δ 0). 여기서 넘겨야 §159 안분 앞에 §97의2①1호
           * 취득가액 치환·①3호 증여세 산입이 얹힌다.
           *
           * ⚠️ raw `data.carryoverTaxation` 금지 — Zod 출력은 일자가 string이라
           *    §97의2③ 기간 비교·§95④ 단서 기산이 침묵 오작동한다.
           */
          carryoverTaxation: engineInput.carryoverTaxation,
          /**
           * ⑭ 신고서 단위 수정신고·경정청구 (국세기본법 §45·§45의2).
           *
           * 🔴 종전에는 **여기서 버려졌다** — 클라이언트는 자산 종류와 무관하게 `amendment`를
           *    싣고(④) Zod도 받고(`transfer-tax-schema.ts:516`) ⑧ validate도 통과시키는데
           *    (`transfer-tax-validate.ts:499`는 `amendmentMode`만 본다), GB 분기가 인자로
           *    넘기지 않아 **세액이 1원도 안 움직였다**(실측 Δ 0 · `amendmentDetail` undefined).
           *    같은 payload가 §166⑥(`:305`)·겸용(`:416`)에서는 처음부터 동작한다.
           *
           * ⚠️ raw `data.amendment` 금지 — Zod 출력은 일자가 string이라 §45의2① 「5년」·
           *    §26의2 제척기간 비교가 침묵 오작동한다(`engine-input.ts:346-350`가 Date로 바꾼 값이 정본).
           *
           * 법령: §45①·§45의2① 요건은 「과세표준신고서를 법정신고기한까지 제출한 자」 + 기한이며
           *       자산 종류를 가르는 문언이 본문·각 호 어디에도 없다.
           */
          amendment: engineInput.amendment,
        },
      );
      return okJson(
        {
          data: {
            mode: "bundled" as const,
            apportionment,
            aggregated,
            // 부담부증여 §159·증여세 통합 명세 (부담부증여 모드에서만 포함, 사이드바·결과 카드 표시용)
            ...(transferBurdenedGiftBreakdown ? { transferBurdenedGiftBreakdown } : {}),
          },
        },
      );
    }

    // ─── 5-a-4. 이월과세 × 당초 증여 때 인수한 채무 부분(매입분) — 단건이 신고 단위 집계로 간다(`carryover-debt-route.ts`) ───
    //   채무가 없으면 null → 5-b 그대로. 🔴 5-b보다 앞이어야 한다 — 단건 엔진은 채무 키를 받으면 던진다(G1).
    const debtBundle = calculateCarryoverDebtTransfer(engineInput, rates, transferDate);
    if (debtBundle) return okJson({ data: debtBundle });

    // ─── 5-b. 기존 단건 경로 ───────────────────────────────────
    // 신고불성실가산세의 determinedTax + 지연납부의 unpaidTax는 실제 결정세액으로 주입 필요
    // → 먼저 가산세 없이 계산하여 결정세액 확보 후, 가산세 디테일에 주입
    if (engineInput.filingPenaltyDetails || engineInput.delayedPaymentDetails) {
      const baseResult = calculateTransferTax(
        { ...engineInput, filingPenaltyDetails: undefined, delayedPaymentDetails: undefined },
        rates,
      );
      if (engineInput.filingPenaltyDetails) {
        engineInput.filingPenaltyDetails.determinedTax = baseResult.determinedTax;
        engineInput.filingPenaltyDetails.reductionAmount = baseResult.reductionAmount;
      }
      // 자동(또는 모드 부재 + 0) = 결정세액 전액 미납 · 직접 입력은 그대로(0 = 완납) — PEN-C
      if (engineInput.delayedPaymentDetails) {
        engineInput.delayedPaymentDetails.unpaidTax = resolveUnpaidTax(
          engineInput.delayedPaymentDetails,
          baseResult.determinedTax,
        );
      }
    }
    // 양도일과 같은 날 취득한 권리를 보유로 세면 비과세·세액이 달라질 때만 확인 필요를 싣는다(코드 리뷰 결정 #1).
    const result = withSameDayRightWarning(engineInput, calculateTransferTax(engineInput, rates), (counterfactual) =>
      calculateTransferTax(counterfactual, rates),
    );
    return okJson({ data: { mode: "single" as const, result } });
  } catch (err) {
    // 서버 콘솔에 풀 스택 출력 — dev 터미널에서 즉시 원인 식별
    console.error("[/api/calc/transfer] engine error:", err);
    // INVALID_INPUT → 400 (+ details.path가 있으면 fieldErrors) — `lib/api/tax-error-response.ts`
    if (err instanceof TaxCalculationError) return taxCalculationErrorResponse(err);
    const errMsg = err instanceof Error ? err.message : String(err);
    const errStack = err instanceof Error ? err.stack : undefined;
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: errMsg || "계산 중 오류가 발생했습니다",
          // 스택은 비운영 환경에서만 노출 (운영 내부 경로·구현 정보 노출 차단)
          ...(process.env.NODE_ENV !== "production" ? { stack: errStack } : {}),
        },
      },
      { status: 500 },
    );
  }
}
