/**
 * 부담부증여(burdened gift) API 변환 헬퍼.
 *
 * AssetForm의 bg* 필드 + propertyType별 기준시가 필드 → 엔진 BurdenedGiftInfo로 변환.
 * 14개 동기화 지점 ⑬ — callTransferTaxAPI body spread (TypeScript 미감지 영역).
 *
 * Phase 2 (2026-05-12): assetKind 분기로 housing·land·building·general_building 4종 지원.
 * 근거: 디자인 문서 `transfer-tax-burdened-gift-phase2.engine.design.md` Step 2.5.
 */

// ⚠️ `transfer-tax-api-helpers`가 이 파일을 import하므로 **원 위치에서 직접** 가져온다
//    (helpers 경유 re-export를 쓰면 순환 import가 된다).
import { applyRatio } from "@/lib/tax-engine/tax-utils";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

export interface BurdenedGiftInfoPayload {
  valuationMode: "sangjeungbeop_standard" | "sangjeungbeop_market";
  lendingDepositTotal: number;
  mortgageDebtAmount: number;
  annualRentTotal: number;
  mortgageSetAmount?: number;
  marketValueAtTransfer?: number;
  marketValueAtAcquisition?: number;
  /** [신설] 취득가액 산정방식 (K-4/K-5, 시가 모드). */
  acquisitionMethod?: "actual" | "converted";
  /** [신설] K-4 실지취득가액 — 토지. */
  actualLandAcquisitionPrice?: number;
  /** [신설] K-4 실지취득가액 — 건물. */
  actualBuildingAcquisitionPrice?: number;
  /** [신설] K-4 실지취득가액 — 단일자산. */
  actualAcquisitionTotal?: number;
  /** 증여재산 평가용 양도시 건물 기준시가 (상증법 §61 — 층별 가감율 적용). */
  giftBuildingStdPriceAtTransfer?: number;
  // Phase 3: 증여세 통합 입력
  donorRelation?:
    | "spouse"
    | "lineal_ascendant_adult"
    | "lineal_ascendant_minor"
    | "lineal_descendant"
    | "other_relative";
  isMinorDonee?: boolean;
  isGenerationSkip?: boolean;
  isFiledOnTime?: boolean;
  priorGiftsWithin10Years?: Array<{
    giftDate: string;
    giftAmount: number;
    giftTaxPaid: number;
    computedTax?: number;
    giftTaxBase?: number;
  }>;
  /** 양도시 토지 기준시가 (housing·building 시 0, 합산은 land+building) */
  landStdPriceAtTransfer: number;
  /** 양도시 건물 기준시가. housing 시 주택 단일 공시가격 통째로. land 시 0. */
  buildingStdPriceAtTransfer: number;
  /** 취득시 토지 기준시가 (A 산정용 — §159①1호 괄호 단서 기준시가 모드) */
  landStdPriceAtAcquisition: number;
  /** 취득시 건물 기준시가. housing 시 주택 단일 공시가격 통째로. land 시 0. */
  buildingStdPriceAtAcquisition: number;
  /**
   * 이월과세(§97의2①1호) — **당초 증여자** 취득 당시 값 한 벌. 위 필드들은 **양도인** 기준이다.
   * 이월과세 취득원인이 아니면 undefined.
   */
  carryoverDonorBasis?: {
    landStdPriceAtAcquisition?: number;
    buildingStdPriceAtAcquisition?: number;
    actualLandAcquisitionPrice?: number;
    actualBuildingAcquisitionPrice?: number;
    actualAcquisitionTotal?: number;
    marketValueAtAcquisition?: number;
  };
}

/**
 * 「당초 증여자」 취득 당시 값 한 벌을 폼에서 뽑는다 (D-7b).
 *
 * 빈 문자열은 `undefined`로 떨어뜨린다 — **0과 미입력은 다르다**. 건물이 없는 토지 자산은
 * 사용자가 `0`을 명시해야 하고, 그때는 `parseAmount`가 0을 돌려주므로 `undefined`가 아니다.
 * (`?? undefined`가 아니라 빈 문자열 검사인 이유 — `parseAmount("") || undefined`로 쓰면
 *  사용자가 입력한 **0이 미입력으로 둔갑**한다.)
 */
function buildCarryoverDonorBasis(
  primary: AssetForm,
): BurdenedGiftInfoPayload["carryoverDonorBasis"] {
  const num = (v: string | undefined) =>
    v !== undefined && v !== "" ? parseAmount(v) : undefined;
  return {
    landStdPriceAtAcquisition: num(primary.bgCoDonorLandStdPriceAtAcq),
    buildingStdPriceAtAcquisition: num(primary.bgCoDonorBuildingStdPriceAtAcq),
    actualLandAcquisitionPrice: num(primary.bgCoDonorActualAcquisitionLand),
    actualBuildingAcquisitionPrice: num(primary.bgCoDonorActualAcquisitionBuilding),
    actualAcquisitionTotal: num(primary.bgCoDonorActualAcquisitionTotal),
    marketValueAtAcquisition: num(primary.bgCoDonorMarketValueAtAcquisition),
  };
}

/**
 * Phase 2: assetKind 분기로 propertyType별 기준시가 도출.
 * - general_building: gb* 필드 (토지/건물 분리)
 * - housing/building: standardPriceAtTransfer / standardPriceAtAcq (단일 공시가격)
 * - land: standardPriceAtTransfer / standardPriceAtAcq 또는 개별공시지가×면적
 *
 * 호출 조건: primary.transferType === "burdened_gift" (acquisitionCause === "burdened_gift" 레거시도 normalize에서 이전됨)
 */
/**
 * 🔴 **축 B 전용** 채무 안분 비율 — 축 A와 **반대**다.
 *
 * `scaleBurdenedGiftInfo`(엔진)는 §159의 A·C(평가액·기준시가)만 줄이고 **B(채무)는 그대로** 둔다.
 * 축 A(공유 소유)에서는 그것이 옳다 — 공유자마다 **별개 증여계약**이라 인수채무는 **사실**이고
 * 사용자가 지분 인수분을 직접 입력한다.
 *
 * 그런데 **축 B(같은 물건 지분 분할 취득)** 는 갑 한 사람의 **하나의 증여계약**이고 tranche는
 * 세법상 계산 단위일 뿐이다. §159①1호의 **B/C(채무비율)는 물건 단위 하나**여야 하는데,
 * A만 줄이면 담보평가 항이 **절대금액**이라 C가 채무로 clamp돼 B/C가 1을 넘는다:
 *
 * | 카드 | A | C = max(보충적, 담보) | B | B/C |
 * |---|---|---|---|---|
 * | 60% | 6억 | max(6억, **6억**) | **6억** | **1.0** 🔴 (정답 0.6) |
 * | 40% | 4억 | max(4억, **6억**) | **6억** | **1.5** 🔴 |
 *
 * 실측: 미안분 시 결정세액 **187,374,000원**(정답 64,600,360의 **2.9배**).
 *
 * ⇒ 축 B에서는 채무·보증금·임대료·저당설정액도 **×지분율**로 안분한다. 이는
 *   **자동 안분 fallback이 아니다** — 「미입력을 추정」하는 것이 아니라 「하나의 값을 §159 산식이
 *   요구하는 계산 단위로 나누는 것」이다(`feedback_no_silent_apportion_fallback`이 막는 것은 전자).
 *
 * ⚠️ 같은 필드가 축에 따라 반대로 처리된다(`feedback_rename_same_name_two_axes`) —
 *    공통 헬퍼로 통합하지 말 것. 축 판정은 **호출부**가 넘긴다.
 *
 * @param debtScaleRatio 축 B일 때 지분율(0<r<1). 미전달·1.0이면 축 A/단독 — 완전 무변경.
 */
export function buildBurdenedGiftInfo(
  primary: AssetForm,
  debtScaleRatio?: number,
): BurdenedGiftInfoPayload {
  const scaleDebt =
    debtScaleRatio !== undefined && debtScaleRatio > 0 && debtScaleRatio < 1;
  /** 채무 성분 전용 — 평가액·기준시가에는 쓰지 않는다(엔진 `scaleBurdenedGiftInfo` 소관). */
  const d = (v: number): number => (scaleDebt ? applyRatio(v, debtScaleRatio!) : v);
  const common = {
    valuationMode: (primary.bgValuationMode || "sangjeungbeop_standard") as
      | "sangjeungbeop_standard"
      | "sangjeungbeop_market",
    lendingDepositTotal: d(parseAmount(primary.bgLendingDepositTotal) || 0),
    mortgageDebtAmount: d(parseAmount(primary.bgMortgageDebtAmount) || 0),
    annualRentTotal: d(parseAmount(primary.bgAnnualRentTotal) || 0),
    mortgageSetAmount: primary.bgMortgageSetAmount
      ? d(parseAmount(primary.bgMortgageSetAmount))
      : undefined,
    marketValueAtTransfer: primary.bgMarketValueAtTransfer
      ? parseAmount(primary.bgMarketValueAtTransfer)
      : undefined,
    marketValueAtAcquisition: primary.bgMarketValueAtAcquisition
      ? parseAmount(primary.bgMarketValueAtAcquisition)
      : undefined,
    // K-4/K-5 취득가액 산정방식 (시가 모드). 미선택 시 undefined → 엔진 backward-compat.
    acquisitionMethod: primary.bgAcquisitionMethod || undefined,
    actualLandAcquisitionPrice:
      primary.bgAcquisitionMethod === "actual" && primary.bgActualAcquisitionLand
        ? parseAmount(primary.bgActualAcquisitionLand) || undefined
        : undefined,
    actualBuildingAcquisitionPrice:
      primary.bgAcquisitionMethod === "actual" && primary.bgActualAcquisitionBuilding
        ? parseAmount(primary.bgActualAcquisitionBuilding) || undefined
        : undefined,
    actualAcquisitionTotal:
      primary.bgAcquisitionMethod === "actual" && primary.bgActualAcquisitionTotal
        ? parseAmount(primary.bgActualAcquisitionTotal) || undefined
        : undefined,
    // 증여재산 평가용 건물 기준시가 (층별 가감율 적용 — 미입력 시 양도세용 값 fallback)
    giftBuildingStdPriceAtTransfer: primary.bgGiftBuildingStdPriceAtTransfer
      ? parseAmount(primary.bgGiftBuildingStdPriceAtTransfer)
      : undefined,
    /**
     * 이월과세(§97의2①1호) — 「당초 증여자」 취득 당시 값 한 벌 (D-7b).
     *
     * 이월과세 취득원인일 때만 싣는다. ❌ 값이 없다고 **양도인 값으로 대신하지 않는다** —
     * 시나리오 A = B가 되어 §97의2가 조용히 무력화된다(엔진 `assertCarryoverDonorBasis`가
     * fail-fast로 막고, ⑧ validate가 그 앞에서 사용자에게 알린다).
     */
    carryoverDonorBasis:
      primary.acquisitionCause === "carryover_gift"
        ? buildCarryoverDonorBasis(primary)
        : undefined,
    // Phase 3: 증여세 통합 입력 (빈 문자열·미선택 시 undefined로 → 엔진 default 사용)
    donorRelation: primary.bgDonorRelation ? primary.bgDonorRelation : undefined,
    isMinorDonee: primary.bgIsMinorDonee || undefined,
    isGenerationSkip: primary.bgIsGenerationSkip || undefined,
    isFiledOnTime: primary.bgIsFiledOnTime === false ? false : undefined,
    // Phase 3 후속: 10년 이내 사전증여 (giftDate·giftAmount 필수, giftTaxPaid 0 허용)
    priorGiftsWithin10Years:
      primary.bgPriorGifts && primary.bgPriorGifts.length > 0
        ? primary.bgPriorGifts
            .filter((p) => p.giftDate && parseAmount(p.giftAmount) > 0)
            .map((p) => ({
              giftDate: p.giftDate,
              giftAmount: parseAmount(p.giftAmount) || 0,
              giftTaxPaid: parseAmount(p.giftTaxPaid) || 0,
              // §58 Phase A — 당시 산출세액·과세표준 (미입력 시 undefined → §58 미적용, validate에서 강제)
              computedTax: parseAmount(p.computedTax) || undefined,
              giftTaxBase: parseAmount(p.giftTaxBase) || undefined,
            }))
        : undefined,
  };

  // ── general_building: 사례 34 패턴 (Phase 1 그대로) ──
  if (primary.assetKind === "general_building") {
    const landArea = parseFloat(primary.gbLandArea) || 0;
    const landStdAtTransfer = (parseAmount(primary.gbTransferLandPricePerSqm) || 0) * landArea;
    const landStdAtAcquisition = (parseAmount(primary.gbAcqLandPricePerSqm) || 0) * landArea;
    return {
      ...common,
      landStdPriceAtTransfer: Math.floor(landStdAtTransfer),
      buildingStdPriceAtTransfer: parseAmount(primary.gbTransferBuildingValue) || 0,
      landStdPriceAtAcquisition: Math.floor(landStdAtAcquisition),
      buildingStdPriceAtAcquisition: parseAmount(primary.gbAcqBuildingValue) || 0,
    };
  }

  // ── land: 토지만 (개별공시지가 × 면적 또는 standardPriceAt*) ──
  if (primary.assetKind === "land") {
    // standardPriceAtTransfer 가 입력되어 있으면 우선 사용 (사용자 명시 입력)
    // 그 외 standardPricePerSqmAt* × 면적으로 자동 계산
    const transferArea = parseFloat(primary.transferArea) || 0;
    const acqArea = parseFloat(primary.acquisitionArea) || 0;
    const landStdAtTransfer =
      parseAmount(primary.standardPriceAtTransfer) ||
      (parseAmount(primary.standardPricePerSqmAtTransfer) || 0) * transferArea;
    const landStdAtAcquisition =
      parseAmount(primary.standardPriceAtAcq) ||
      (parseAmount(primary.standardPricePerSqmAtAcq) || 0) * acqArea;
    return {
      ...common,
      landStdPriceAtTransfer: Math.floor(landStdAtTransfer),
      buildingStdPriceAtTransfer: 0,
      landStdPriceAtAcquisition: Math.floor(landStdAtAcquisition),
      buildingStdPriceAtAcquisition: 0,
    };
  }

  // ── housing / building / commercial_building: 단일 공시가격(주택공시가격·건물기준시가·호별고시가 통합) ──
  // 토지·건물 분리 없이 buildingStdPrice 자리에 통째로 넣어 엔진 sum에서 그대로 사용.
  // F-3 (2026-05-12): commercial_building도 단일 기준시가 fallback 패턴 적용.
  //   cb*·호별고시가는 환산취득가(useEstimatedAcquisition) 전용 — 부담부증여 모드에서는 사용자가
  //   standardPriceAtTransfer / standardPriceAtAcq에 상증법 §61 평가액 직접 입력.
  return {
    ...common,
    landStdPriceAtTransfer: 0,
    buildingStdPriceAtTransfer: parseAmount(primary.standardPriceAtTransfer) || 0,
    landStdPriceAtAcquisition: 0,
    buildingStdPriceAtAcquisition: parseAmount(primary.standardPriceAtAcq) || 0,
  };
}
