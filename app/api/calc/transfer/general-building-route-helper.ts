/**
 * 일반건물(토지+건물 일괄) 라우트 헬퍼 — **진입점 + 경로 A(환산취득가 모드)**.
 *
 * 두 경로 지원:
 * A. 환산취득가 모드: §166⑥(양도가 안분) + §176의2②(환산) + §163⑥(개산공제) + §102②(1차 통산)
 *    → 이 파일의 `calculateGeneralBuildingTransfer`
 * B. 실거래가/감정가 모드: §166⑥(비율 안분) + 실거래 취득가액 파트 배정 + NBL 중과
 *    → `general-building-route-actual.ts`
 *
 * ## 파일 구성 (800줄 정책 분리 — 2026-08-06, 833줄에서 3분할)
 *
 *   `general-building-route-helper.ts`  진입점 `dispatchGeneralBuilding` + 경로 A
 *   `general-building-route-actual.ts`  경로 B
 *   `general-building-route-cards.ts`   두 경로 공용 카드 변환(엔진 input·사이드바 표시)
 *
 * 아래 **재수출**은 하위 호환이다 — `route.ts`와 테스트 15파일이 이 경로에서 import한다
 * (메모리 `feedback_800line_split_export_preservation`).
 */

import { toOptionalDate } from "@/lib/api/date-coerce";
import { apportionGiftTax } from "@/lib/tax-engine/carryover-gift-tax-apportion";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import {
  buildGeneralBuildingAssetCards,
  type GeneralBuildingInput,
} from "@/lib/tax-engine/general-building-valuation";
import type { TaxRatesMap } from "@/lib/db/tax-rates";
import { resolveGeneralBuildingSwap } from "@/lib/tax-engine/general-building-swap";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import {
  buildProperties,
  buildApportionment,
  type GeneralBuildingRouteResult,
  type GbAssetLevelInputs,
} from "./general-building-route-cards";
import {
  calculateGeneralBuildingActualTransfer,
  type GeneralBuildingActualPricePayload,
} from "./general-building-route-actual";

// ── 분리 전 import 경로 유지용 재수출 (하위 호환) ──────────────────────
export { calculateGeneralBuildingActualTransfer };
export type { GeneralBuildingActualPricePayload, GeneralBuildingRouteResult, GbAssetLevelInputs };

/**
 * payload 정규화·카드 조립은 `lib/tax-engine/general-building-entry.ts`로 옮겼다 (2026-08-11).
 *
 * 이 파일은 `calculateTransferTaxAggregate`(→ `lib/db/tax-rates` → `next/headers`)를 함께
 * import하므로 **클라이언트에서 불러올 수 없다**. 사이드바 환산 프리뷰가 카드 조립을 재사용해야
 * 해서 순수 부분만 Layer 2로 내렸다. 기존 호출부·테스트를 위해 여기서 재수출한다.
 */
export {
  coerceGeneralBuildingPayload,
  buildEstimatedGeneralBuildingCards,
  type GeneralBuildingValuationPayload,
} from "@/lib/tax-engine/general-building-entry";
// 재수출은 로컬 바인딩을 만들지 않는다 — 이 파일 본문에서도 쓰므로 별도로 들여온다.
import {
  coerceGeneralBuildingPayload,
  buildEstimatedGeneralBuildingCards,
  type GeneralBuildingValuationPayload,
} from "@/lib/tax-engine/general-building-entry";


// ── 통합 진입점 (route.ts에서 호출) ─────────────────────────────────────

/**
 * generalBuildingValuation payload를 받아 actualPriceMode 플래그로 내부 분기.
 * route.ts 라인 수 절감 목적.
 */
export function dispatchGeneralBuilding(
  gbRaw: Record<string, unknown>,
  totalTransferPrice: number,
  transferDate: Date,
  acquisitionDate: Date,
  actualAcquisitionPrice: number,
  actualExpenses: number,
  taxYear: number,
  annualBasicDeductionUsed: number | undefined,
  priorReductionUsage: unknown[],
  rates: TaxRatesMap,
  /** 부담부증여 §159 정보 (옵션) — actualPriceMode 분기에서만 사용. */
  burdenedGiftInfo?: BurdenedGiftInfo,
  /**
   * §164⑨ 1호 공익수용 특례 — top-level 특례 필드 (토지 전용, 계획 D16-GB).
   * 환산 경로(calculateGeneralBuildingTransfer)에서만 적용. gbRaw가 아닌 data 최상위에서 옴.
   */
  expropriation?: {
    transferCause?: "general" | "public_expropriation";
    compensationPerSqm?: number;
    compensationBasisStdPrice?: number;
  },
  /**
   * ⑭ 공유지분율 — 개산공제(§163⑥) base 축소 전용. `data.ownershipRatio`(top-level)에서 온다.
   * `gbRaw`는 `generalBuildingValuation` 서브객체라 이 값을 담고 있지 않다 — 명시 전달이 필수.
   */
  ownershipRatio?: number,
  /**
   * ⑭ 자산-수준 감면·가산세 (F17) — 카드 조립 이후 단계가 소비한다.
   * 위치 인자가 이미 12개라 **묶음 객체**로 받는다(순서 착오 방지).
   */
  assetLevel?: GbAssetLevelInputs,
): GeneralBuildingRouteResult {
  const coercedGbRaw = coerceGeneralBuildingPayload(gbRaw);
  const buildingAcqDate = coercedGbRaw.buildingAcquisitionDate as Date | undefined;
  const landAcqDateCoerced = coercedGbRaw.landAcquisitionDate as Date | undefined;
  const buildingAcqCause = coercedGbRaw.buildingAcquisitionCause as
    | "purchase" | "inheritance" | "gift" | "carryover_gift" | "newConstruction";
  const coercedExtInfo = coercedGbRaw.extensionInfo as Record<string, unknown> | undefined;

  return dispatchCoercedGeneralBuilding(
    coercedGbRaw, buildingAcqDate, landAcqDateCoerced, buildingAcqCause, coercedExtInfo,
    totalTransferPrice, transferDate, acquisitionDate,
    actualAcquisitionPrice, actualExpenses,
    taxYear, annualBasicDeductionUsed, priorReductionUsage, rates,
    burdenedGiftInfo, expropriation, ownershipRatio, assetLevel,
  );
}

/** `coerceGeneralBuildingPayload` 이후의 단건 분기 — 종전 `dispatchGeneralBuilding` 본문. */
function dispatchCoercedGeneralBuilding(
  coercedGbRaw: Record<string, unknown>,
  buildingAcqDate: Date | undefined,
  landAcqDateCoerced: Date | undefined,
  buildingAcqCause:
    | "purchase" | "inheritance" | "gift" | "carryover_gift" | "newConstruction",
  coercedExtInfo: Record<string, unknown> | undefined,
  totalTransferPrice: number,
  transferDate: Date,
  acquisitionDate: Date,
  actualAcquisitionPrice: number,
  actualExpenses: number,
  taxYear: number,
  annualBasicDeductionUsed: number | undefined,
  priorReductionUsage: unknown[],
  rates: TaxRatesMap,
  burdenedGiftInfo?: BurdenedGiftInfo,
  expropriation?: {
    transferCause?: "general" | "public_expropriation";
    compensationPerSqm?: number;
    compensationBasisStdPrice?: number;
  },
  ownershipRatio?: number,
  assetLevel?: GbAssetLevelInputs,
): GeneralBuildingRouteResult {
  if (coercedGbRaw.actualPriceMode === true) {
    /**
     * 🔴 payload는 **스프레드로 통째 전달**한다 — 필드를 나열하지 않는다(2026-08-06).
     *
     * 종전에는 필드를 하나씩 열거했다. 그래서 새 필드를 추가할 때 그 목록에 넣는 것을 잊으면
     * Zod·타입·테스트 어디에도 걸리지 않고 **조용히 사라졌다**
     * (메모리 `feedback_explicit_prop_mapping_strip`). 실제로 **두 번** 났고 둘 다 과대과세였다:
     *   · 파트 취득가액 2필드 누락 → 분리 ON + 두 파트 실가에서 **취득가액 0**(139,033,991원)
     *   · 파트 자본적지출 2필드 누락 → P5의 직접 귀속이 **한 번도 적용되지 않음**
     *
     * 스프레드는 그 실수 자체를 불가능하게 만든다. 실가 경로가 읽지 않는 여분 필드는 destructure
     * 단계에서 무시되므로 무해하다(환산 경로도 같은 방식이다 — `gbPayload` 조립부).
     *
     * ⚠️ **스프레드 뒤에 오는 것만** 덮어쓴다: 함수 파라미터에서 오는 값과 Date로 변환한 값이다.
     *    순서를 바꾸면 raw 문자열 날짜가 살아남아 `Date < string` 침묵 false 함정에 빠진다
     *    (`lib/api/date-coerce.ts`).
     * 구조 가드: `__tests__/api/gb-route-actual-payload-forwarding.anchor.test.ts`
     */
    return calculateGeneralBuildingActualTransfer(
      {
        ...(coercedGbRaw as unknown as GeneralBuildingActualPricePayload),
        totalTransferPrice,
        transferDate,
        acquisitionDate,
        actualAcquisitionPrice,
        actualExpenses,
        burdenedGiftInfo,
        // M-1a 파트 취득일 — 토지 카드/건물 카드가 각자 자기 날짜로 보유기간을 잡는다.
        landAcquisitionDate: landAcqDateCoerced,
        buildingAcquisitionDate: buildingAcqDate,
        buildingAcquisitionCause: buildingAcqCause,
      },
      taxYear, annualBasicDeductionUsed, priorReductionUsage, rates, assetLevel,
    );
  }
  // ⑭ 사례 33: 증축 경로에서 actualBundledAcquisitionPrice/Expenses 주입
  // extensionInfo.actualBundledAcquisitionPrice: 토지+건물1 일괄 취득가 (route handler actualAcquisitionPrice)
  // extensionInfo.actualBundledExpenses: 토지+건물1 일괄 필요경비 (route handler actualExpenses)
  // GeneralBuildingInput.extensionInfo 타입에 필수 필드 — 미주입 시 landAcq/landExp가 NaN.
  // unknown 경유 캐스팅: coercedExtInfo 합성 타입이 GeneralBuildingInput["extensionInfo"] 서브타입과 충돌.
  const gbPayload: GeneralBuildingValuationPayload = {
    ...(coercedGbRaw as unknown as GeneralBuildingValuationPayload),
    totalTransferPrice,
    transferDate,
    acquisitionDate,
    ownershipRatio,
    // §164⑨ 1호 공익수용 특례 (토지 전용 — D16-GB): top-level 특례 필드 주입.
    // 환산 경로 엔진이 게이트(수용·환산·2009.02.04·보상 후보) 판정. undefined이면 무영향(회귀 0).
    ...(expropriation?.transferCause ? { transferCause: expropriation.transferCause } : {}),
    ...(expropriation?.compensationPerSqm !== undefined
      ? { compensationPerSqm: expropriation.compensationPerSqm }
      : {}),
    ...(expropriation?.compensationBasisStdPrice !== undefined
      ? { compensationBasisStdPrice: expropriation.compensationBasisStdPrice }
      : {}),
    ...(coercedExtInfo ? {
      extensionInfo: {
        ...(coercedExtInfo as unknown as NonNullable<GeneralBuildingInput["extensionInfo"]>),
        actualBundledAcquisitionPrice: actualAcquisitionPrice,
        actualBundledExpenses: actualExpenses,
        // W-1a — 그 값이 어느 성질에서 왔는지. 엔진이 안분 **시점**을 이것으로 고른다.
        ...(coercedGbRaw.bundledExpenseNature !== undefined
          ? { bundledExpenseNature: coercedGbRaw.bundledExpenseNature as "capital" | "transfer" | "mixed" }
          : {}),
      },
    } : {}),
  };

  return calculateGeneralBuildingTransfer(
    gbPayload,
    taxYear, annualBasicDeductionUsed, priorReductionUsage, rates, assetLevel,
  );
}

// ── 경로 A: 환산취득가 모드 ────────────────────────────────────────────

/**
 * 환산취득가 모드 — 토지·건물 2자산 aggregate.
 * @param gbv  Zod 검증·Date 변환 완료 payload
 *
 * buildingAcquisitionCause === "newConstruction" 시 isSelfBuilt=true 도출
 * (dispatchGeneralBuilding과 동일 로직 — 단위 테스트 직접 호출 경로 보호).
 */
export function calculateGeneralBuildingTransfer(
  gbv: GeneralBuildingValuationPayload,
  taxYear: number,
  annualBasicDeductionUsed: number | undefined,
  priorReductionUsage: unknown[],
  rates: TaxRatesMap,
  assetLevel?: GbAssetLevelInputs,
): GeneralBuildingRouteResult {
  const { gbOut, swap } = buildEstimatedGeneralBuildingCards(gbv);
  // §104③ 미등기 — 토지·건물 축을 카드별로 싣는다(엔진 input에서 그대로 전달).
  const properties = buildProperties(gbOut.assetCards, gbOut.nonBusinessRatio, swap, {
    land: gbv.unregisteredLand,
    building: gbv.unregisteredBuilding,
  }, assetLevel?.reductions);

  const aggregated = calculateTransferTaxAggregate(
    {
      taxYear,
      properties,
      annualBasicDeductionUsed: annualBasicDeductionUsed ?? 0,
      basicDeductionAllocation: "MAX_BENEFIT",
      priorReductionUsage: (priorReductionUsage ?? []) as never,
      // 신고서 단위 가산세 — 카드마다 실으면 같은 신고의 가산세가 카드 수만큼 배가된다.
      filingPenaltyDetails: assetLevel?.filingPenaltyDetails,
      delayedPaymentDetails: assetLevel?.delayedPaymentDetails,
    },
    rates,
  );
  // UI 자산별 산식 인라인 표시용 — gbOut의 분모/분자 변수를 결과에 노출.
  // 사례 31(2-way)·33(3-way) 모두 generalBuildingValuationDetail 통해 UI 가공.
  aggregated.generalBuildingValuationDetail = gbOut;
  /**
   * §97②2호 단서 발동 시 결과뷰 표시용(F10).
   *
   * 자산총액 판정은 top-level 1개로 충분하지만, **파트 단위 판정에서는 발동한 파트만 합산**한다.
   * 미발동 파트의 가목·나목까지 더하면 「이 금액을 나목으로 채택했다」는 표시가 실제 채택액과
   * 어긋난다(메모리 `feedback_engine_result_display_drift`).
   */
  if (swap.swapApplied) {
    const applied = swap.perPart
      ? Object.values(swap.perPart).filter((p) => p.swapApplied)
      : undefined;
    aggregated.swapApplied = true;
    aggregated.swapComparison = {
      estimatedSide: applied
        ? applied.reduce((s, p) => s + p.estimatedSide, 0)
        : swap.estimatedSideTotal,
      directSide: applied
        ? applied.reduce((s, p) => s + p.directSide, 0)
        : swap.directSide,
      chosen: "direct",
    };
  }

  const landStdAtTransfer = gbv.transferLandPricePerSqm * gbv.landArea;
  const landStdAtAcq = gbv.acquisitionLandPricePerSqm * gbv.landArea;
  /**
   * 🔴 **증축분(건물2)을 분모에 포함한다** (2026-08-12 사용자 지적).
   * 엔진의 §166⑥ 안분 분모는 `토지 + 건물1 + 건물2`인데(`general-building-extension.ts`),
   * 표시용 `totalStd`만 건물2를 빠뜨려 **비율 합이 100%를 넘었다**(실측 102.29%).
   */
  const extStdAtTransfer = gbv.extensionInfo?.transferExtensionBuildingStdPrice ?? 0;
  const extStdAtAcq = gbv.extensionInfo?.acquisitionExtensionBuildingStdPrice ?? 0;
  const totalStd = landStdAtTransfer + gbv.transferBuildingStdPrice + extStdAtTransfer;

  const apportionment = buildApportionment(
    gbOut.assetCards, totalStd, gbOut.nonBusinessRatio,
    landStdAtTransfer, landStdAtAcq,
    gbv.transferBuildingStdPrice, gbv.acquisitionBuildingStdPrice,
    true,
    "소득세법 시행령 §166⑥ · §176의2② · §163⑥",
    swap, // §97②2호 swap 발동 시 사이드바 표시 정합 (환산 경로 전용)
    extStdAtTransfer, extStdAtAcq,
  );

  return { apportionment, aggregated };
}

