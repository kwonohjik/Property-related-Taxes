/**
 * 양도소득세 계산 API Route
 *
 * Layer 1 (Orchestrator):
 *   Zod 입력 검증 → preloadTaxRates → calculateTransferTax → 결과 반환
 *
 * POST /api/calc/transfer
 */

import { NextRequest, NextResponse } from "next/server";
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { mapReductionsToEngine } from "./route-reductions-mapper";
import { buildNblEngineInput } from "@/lib/calc/non-business-land-request";
import {
  calculateTransferTaxAggregate,
  type TransferTaxItemInput,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import { calculateHoldingPeriod } from "@/lib/tax-engine/tax-utils";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import { dispatchGeneralBuilding } from "./general-building-route-helper";
import { calculateGeneralBuildingFractional } from "./general-building-fractional";
import {
  resolveHousingContextFromCompanion,
  buildCompanionEngineInputs,
  prepareBundledApportionment,
} from "./bundled-split-helpers";
import { TaxCalculationError, TaxErrorCode } from "@/lib/tax-engine/tax-errors";
import { toDate, toOptionalDate } from "@/lib/api/date-coerce";
import { checkRateLimit, getClientIp, shouldBypassRateLimit } from "@/lib/api/rate-limit";
import {
  propertySchema as inputSchema,
} from "@/lib/api/transfer-tax-schema";
import { buildTransferEngineInput } from "./engine-input";

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
      const { apportionment, aggregated } = calculateGeneralBuildingFractional(
        data.generalBuildingShares as never,
        // 물건 전체(100%) 양도가액. 지분 모드에서는 `totalPropertyTransferPrice`가 정본이다.
        data.totalPropertyTransferPrice ?? data.transferPrice,
        transferDate,
        transferDate.getFullYear(),
        data.annualBasicDeductionUsed,
        data.priorReductionUsage ?? [],
        rates,
      );
      return NextResponse.json(
        { data: { mode: "bundled" as const, apportionment, aggregated } },
        { status: 200 },
      );
    }

    // ─── 5-a. 일괄양도 분기 (소득세법 시행령 §166 ⑥) ─────────────
    // companionAssets 존재 시 안분 → 자산별 상속 취득가액 → 다건 엔진
    //
    // 양도가액 결정 모드 (data.bundledSaleMode, 계약서 단위 단일 결정):
    //   - "actual":      §166⑥ 본문. 계약서에 구분 기재된 fixedSalePrice 사용.
    //   - "apportioned": §166⑥ 단서. standardPriceAtTransferForApportion 비율 안분.
    const companions = data.companionAssets ?? [];
    const isActualMode = data.bundledSaleMode === "actual";
    // 지분 모드 식별: primary 또는 모든 companion이 totalPropertyTransferPrice를 가지면 ratio×total로 자동 안분.
    // 별도 안분 키(actual 가액 또는 양도시 기준시가)가 불필요하므로 bundled flow 진입 허용.
    const primaryIsFractional = data.totalPropertyTransferPrice !== undefined;
    const allCompanionsFractional =
      companions.length > 0 && companions.every((c) => c.totalPropertyTransferPrice !== undefined);
    const isFractionalBundle = primaryIsFractional || allCompanionsFractional;
    // 완전 지분 모드: primary·전 companion 모두 fractional (같은 물건 지분 분할).
    // 이때만 각 자산의 확정 양도가액(총계약가×ratio)을 fixedSalePrice로 주입한다.
    // 혼합(primary만 지분 등)은 비지분 자산의 fixedSalePrice가 미계산이므로 기존 경로 유지.
    const isFullFractionalBundle = primaryIsFractional && allCompanionsFractional;
    const bundledOk =
      companions.length > 0 &&
      data.totalSalePrice !== undefined &&
      (
        // 지분 모드: ratio×total 자동 안분 → 안분 키 불필요
        isFractionalBundle ||
        // actual 모드: primary 명시 가액 필요
        (isActualMode && data.primaryActualSalePrice !== undefined) ||
        // apportioned 모드: 안분 키 (양도시 기준시가) 필요
        (!isActualMode && data.standardPriceAtTransferForApportion !== undefined)
      );

    if (bundledOk) {
      // (1)~(4.5) 안분 준비·실행 — bundled-split-helpers.ts로 추출 (800줄 정책)
      const { apportionment, adjustedAcq } = prepareBundledApportionment(
        {
          propertyType: data.propertyType,
          totalSalePrice: data.totalSalePrice,
          standardPriceAtTransferForApportion: data.standardPriceAtTransferForApportion,
          expenses: data.expenses,
          acquisitionPrice: data.acquisitionPrice,
          primaryActualSalePrice: data.primaryActualSalePrice,
          primaryInheritanceValuation: data.primaryInheritanceValuation,
        },
        companions,
        { isActualMode, isFullFractionalBundle },
      );

      // (5) TransferTaxItemInput[] 조립 — 주 자산은 engineInput 파생, 컴패니언은 기본값 + override
      // G-2: companion이 한도 초과 split 대상이면 flatMap으로 두 자산([appurtenant, excess])을 생성.
      //      split 조건: newConstruction + land + areaM2 있음 + excessArea > 0 + 수동 오버라이드 없음
      const primaryHp = calculateHoldingPeriod(acquisitionDate, transferDate);

      // 사례 28 자동 분기 양방향 확장 + 폼-수준 사용자 모드 (헬퍼)
      const housingCtxFromCompanion =
        engineInput.propertyType !== "housing"
          ? resolveHousingContextFromCompanion(
              companions,
              transferDate,
              data.buildingFootprintArea,
              data.isUrbanArea,
              data.bundledSaleMode,
              data.appurtenantLandZone,
            )
          : undefined;

      const primaryCtxForSplit =
        engineInput.buildingFootprintArea !== undefined ||
        engineInput.manualHoldingPeriodOverride !== undefined
          ? {
              propertyType: engineInput.propertyType,
              holdingMonths: primaryHp.years * 12 + primaryHp.months,
              buildingFootprintArea: engineInput.buildingFootprintArea,
              isUrbanArea: engineInput.isUrbanArea,
              appurtenantLandZone: engineInput.appurtenantLandZone,
              bundledSaleMode: data.bundledSaleMode,
            }
          : housingCtxFromCompanion;

      // 사례 28 — primary가 land이고 housingCtxFromCompanion이 있으면 primaryCtx 주입 (양방향 자동 분기)
      // landNature는 개별 자산에 명시 입력되므로 폼-수준 userModeOverride 불필요.
      if (engineInput.propertyType === "land") {
        if (housingCtxFromCompanion && !engineInput.primaryContextForCompanionRate) {
          engineInput.primaryContextForCompanionRate = {
            propertyType: housingCtxFromCompanion.propertyType,
            holdingMonths: housingCtxFromCompanion.holdingMonths,
            buildingFootprintArea: housingCtxFromCompanion.buildingFootprintArea,
            isUrbanArea: housingCtxFromCompanion.isUrbanArea,
            appurtenantLandZone: housingCtxFromCompanion.appurtenantLandZone,
            bundledSaleMode: housingCtxFromCompanion.bundledSaleMode,
          };
        }
      }

      const items: TransferTaxItemInput[] = apportionment.apportioned.flatMap((a, idx) => {
        if (a.assetId === "primary") {
          // 주 자산: engineInput을 복제 + 안분 결과로 양도·취득·필요경비 덮어쓰기
          // 지분 모드: data.totalPropertyTransferPrice는 engineInput에서 이미 상속됨 (...engineInput).
          return [{
            ...engineInput,
            transferPrice: a.allocatedSalePrice,
            acquisitionPrice: a.allocatedAcquisitionPrice,
            expenses: a.allocatedExpenses,
            propertyId: "primary",
            propertyLabel: a.assetLabel,
          } satisfies TransferTaxItemInput];
        }
        // 컴패니언 자산 빌드 + 한도 초과 split — bundled-split-helpers.ts로 추출
        const c = companions[idx - 1];
        return buildCompanionEngineInputs(c, a, {
          primaryCtxForSplit,
          primaryAcquisitionDate: acquisitionDate,
          transferDate,
          primaryAcquisitionCause: data.acquisitionCause,
          primaryEngineInput: {
            householdHousingCount: engineInput.householdHousingCount,
            isRegulatedArea: engineInput.isRegulatedArea,
            wasRegulatedAtAcquisition: engineInput.wasRegulatedAtAcquisition,
            // 부수토지 컴패니언 전용 상속값 (F12) — 세대 단위 3값과 같은 층위.
            residencePeriodMonths: engineInput.residencePeriodMonths,
            propertyType: engineInput.propertyType,
            buildingFootprintArea: engineInput.buildingFootprintArea,
            isUrbanArea: engineInput.isUrbanArea,
            appurtenantLandZone: engineInput.appurtenantLandZone,
          },
          bundledSaleMode: data.bundledSaleMode,
          adjustedAcqPrice: adjustedAcq.get(c.assetId)?.price,
        });
      });

      // (6) 다건 엔진 호출
      const aggregated = calculateTransferTaxAggregate(
        {
          taxYear: transferDate.getFullYear(),
          properties: items,
          annualBasicDeductionUsed: data.annualBasicDeductionUsed,
          priorReductionUsage: data.priorReductionUsage ?? [],
          // [A1] 신고서 단위 수정신고·경정청구 — engineInput.amendment는 상단(:308~)에서 Date 변환 완료.
          amendment: engineInput.amendment,
        },
        rates,
      );

      return NextResponse.json(
        {
          data: {
            mode: "bundled" as const,
            apportionment,
            aggregated,
          },
        },
        { status: 200 },
      );
    }

    // ─── 5-a-2. 겸용주택 분리계산 경로 (sodt §160①단서, 2022.1.1 이후) ───
    if (data.propertyType === "mixed-use-house" && data.mixedUse) {
      const phdInput = data.mixedUse.preHousingDisclosure
        ? {
            ...data.mixedUse.preHousingDisclosure,
            firstDisclosureDate: new Date(
              data.mixedUse.preHousingDisclosure.firstDisclosureDate,
            ),
          }
        : undefined;
      const mixedAsset = {
        ...data.mixedUse,
        isMixedUseHouse: true as const,
        // ⑭ 개산공제(§163⑥) 지분 축소 — 자산-수준 `ownershipRatio`를 겸용 서브엔진에 주입.
        //    `data.mixedUse`에는 없는 top-level 필드라 여기서 명시 전달하지 않으면 조용히 누락된다.
        ownershipRatio: data.ownershipRatio,
        isUnregistered: data.isUnregistered,
        // ⑭ 영 §154① 요건 판정 — 셋 다 폼-전역(top-level) 값이라 `data.mixedUse`에 없다.
        //    여기서 명시 전달하지 않으면 조용히 누락되어 거주요건·단서 면제가 미판정된다.
        wasRegulatedAtAcquisition: data.wasRegulatedAtAcquisition,
        regionCode: data.regionCode,
        // ⚠️ raw `data.oneHouseExemptionProviso` 전달 금지 — Zod 출력은 날짜가 string이라
        //    §154① 단서의 `addYears`·`>=` 비교가 침묵 오작동한다. 상단(:205~)의 Date 변환본을 쓴다.
        oneHouseExemptionProviso: engineInput.oneHouseExemptionProviso,
        // ⑭ §155① 일시적 2주택 — 폼-전역 값이라 `data.mixedUse`에 없다. 겸용 서브엔진이
        //    이것으로 §155① 의제 성립을 선판정해 중과 배제(§167의10①15호)에 넘긴다.
        //    ⚠️ raw `data.temporaryTwoHouse` 금지 — Zod 출력은 날짜가 string이다(:163 변환본 사용).
        temporaryTwoHouse: engineInput.temporaryTwoHouse,
        // ⑭ 법 §104⑦ 다주택 중과 판정 입력 — 전부 폼-전역 값이라 `data.mixedUse`에 없다.
        //    `houses` 미전송(단독 주택)이면 undefined → 엔진이 중과 판정을 건너뛴다.
        //    ⚠️ 날짜를 갖는 3종은 `engineInput` 변환본을 쓴다 — 특히 `gracePeriod`는
        //       `mapGracePeriodToEngine`(:195)이 toDate 변환한 값이어야 한다.
        multiHouse:
          data.houses && data.houses.length > 0
            ? {
                // ⚠️ raw `data.houses` 금지 — Zod 출력은 `acquisitionDate`가 string이다.
                //    `engineInput.houses`는 상단(:192) `mapHousesToEngine`이 Date 변환한 값이다.
                houses: engineInput.houses ?? [],
                sellingHouseId: data.sellingHouseId ?? data.houses[0].id,
                presaleRights: engineInput.presaleRights ?? [],
                isOneHousehold: data.isOneHousehold,
                isRegulatedArea: data.isRegulatedArea,
                marriageMerge: engineInput.marriageMerge,
                parentalCareMerge: engineInput.parentalCareMerge,
                gracePeriod: engineInput.gracePeriod,
              }
            : undefined,
        landAcquisitionDate: new Date(data.mixedUse.landAcquisitionDate),
        buildingAcquisitionDate: new Date(data.mixedUse.buildingAcquisitionDate),
        preHousingDisclosure: phdInput,
        partialUsageChange: data.mixedUse.partialUsageChange
          ? {
              ...data.mixedUse.partialUsageChange,
              // date-coerce: 빈문자열·invalid → undefined 가드 (API 변환에서 new Date() 제거 후 route 단일 변환)
              usageChangeDate: toOptionalDate(data.mixedUse.partialUsageChange.usageChangeDate),
            }
          : undefined,
      };
      const mixedResult = calcMixedUseTransferTax(
        data.transferPrice,
        new Date(data.transferDate),
        mixedAsset,
        rates,
        // 신고서 단위 수정신고·경정청구 — engineInput.amendment는 상단(:308~)에서 Date 변환 완료.
        // ⚠️ raw data.amendment 전달 금지: Zod 출력은 string이라 §48② 감면율 판정(isAfter)이 침묵 오작동.
        engineInput.amendment,
      );
      return NextResponse.json(
        { data: { mode: "mixed-use" as const, result: mixedResult } },
        { status: 200 },
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
        },
      );
      return NextResponse.json(
        {
          data: {
            mode: "bundled" as const,
            apportionment,
            aggregated,
            // 부담부증여 §159·증여세 통합 명세 (부담부증여 모드에서만 포함, 사이드바·결과 카드 표시용)
            ...(transferBurdenedGiftBreakdown ? { transferBurdenedGiftBreakdown } : {}),
          },
        },
        { status: 200 },
      );
    }

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
      // unpaidTax === 0이면 결정세액 전액 미납으로 가정 (자동 가산세 적용 흐름)
      if (engineInput.delayedPaymentDetails && engineInput.delayedPaymentDetails.unpaidTax === 0) {
        engineInput.delayedPaymentDetails.unpaidTax = baseResult.determinedTax;
      }
    }
    const result = calculateTransferTax(engineInput, rates);
    return NextResponse.json({ data: { mode: "single" as const, result } }, { status: 200 });
  } catch (err) {
    // 서버 콘솔에 풀 스택 출력 — dev 터미널에서 즉시 원인 식별
    console.error("[/api/calc/transfer] engine error:", err);
    if (err instanceof TaxCalculationError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status: 500 },
      );
    }
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
