/**
 * 일반건물 라우트 — **경로 B: 실거래가/감정가 모드**.
 *
 * §166⑥(양도가·취득가 비율 안분) + 실거래 취득가액 파트 배정 + NBL 중과 + 부담부증여 §159①1호.
 * `general-building-route-helper.ts` 800줄 정책 분리(2026-08-06).
 *
 * 환산 경로(A)는 `general-building-route-helper.ts`에 남고, 두 경로가 공유하는 카드 변환은
 * `general-building-route-cards.ts`에 있다.
 */
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { apportionLandByBusinessArea } from "@/lib/tax-engine/general-building-valuation";
import { judgeAppurtenantLandExcess } from "@/lib/tax-engine/appurtenant-land-excess";
import { TaxCalculationError, TaxErrorCode } from "@/lib/tax-engine/tax-errors";
import type { TaxRatesMap } from "@/lib/db/tax-rates";
import type {
  AssetCardForAggregate,
  GeneralBuildingOutput,
} from "@/lib/tax-engine/general-building-valuation";
import { buildBurdenedGiftBreakdown } from "@/lib/tax-engine/burdened-gift-apportionment";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import {
  buildProperties,
  buildApportionment,
  type GeneralBuildingRouteResult,
} from "./general-building-route-cards";

/** 실거래가/감정가 모드 NBL 전용 payload. */
export interface GeneralBuildingActualPricePayload {
  totalTransferPrice: number;
  transferDate: Date;
  acquisitionDate: Date;
  landArea: number;
  buildingFootprintArea: number;
  transferLandPricePerSqm: number;
  transferBuildingStdPrice: number;
  zoneType?: string;
  isMetropolitan?: boolean;
  isUnregistered?: boolean;
  actualAcquisitionPrice: number;
  actualExpenses: number;
  /** 부담부증여 §159①1호 산식용 — 취득시 토지 ㎡당 기준시가. 부담부증여 모드 시 필수. */
  acquisitionLandPricePerSqm?: number;
  /** 부담부증여 §159①1호 산식용 — 취득시 건물 기준시가 총액. 부담부증여 모드 시 필수. */
  acquisitionBuildingStdPrice?: number;
  /**
   * 부담부증여 정보 (소령 §159).
   * 제공 시 §159①1호 단서에 따라 사용자 입력 actualAcquisitionPrice를 무시하고
   * 취득시 기준시가 × 채무비율로 환산.
   */
  burdenedGiftInfo?: BurdenedGiftInfo;
  // ── 사례 35: 주택→상가 용도변경 (자산 공통 — actual 경로도 동일 분기) ──
  houseToCommercialConversion?: boolean;
  conversionDate?: Date;
  wasMultiHouseAtConversion?: boolean;
  // ── §163⑨ 상속 취득가액 직접 산정 (Phase 1 = C1) ──
  /** 토지 상속 게이트 (§163⑨). */
  acquisitionByInheritance?: boolean;
  /** 건물 상속 게이트. */
  buildingAcquisitionByInheritance?: boolean;
  /** 상속개시일 토지 평가액 (원) — 취득당시 실지거래가액 의제(§166⑥ 안분 아님). */
  inheritedLandValue?: number;
  /** 상속개시일 건물 평가액 (원). */
  inheritedBuildingValue?: number;
  // ── §95④ 단기보유 기산점 — actual 분기 기존 결측(회귀 동반 수정) ──
  /** 토지 취득원인 — 단기보유 기산점 분기(영 §95④). */
  landAcquisitionCause?: "purchase" | "inheritance" | "gift" | "carryover_gift";
  /**
   * M-1a 파트 취득일 — `acquisitionDate`(자산 단위)는 **건물** 취득일이고,
   * 토지 카드는 `landAcquisitionDate`로 보유기간·세율을 잡는다. 둘 다 미주입이면 분리 OFF.
   */
  landAcquisitionDate?: Date;
  buildingAcquisitionDate?: Date;
  /**
   * 파트별 자본적지출(§97①2호) — **직접 귀속** 금액이다.
   * 「소득세법」 제100조 제2항 후문은 "**공통되는** 취득가액과 양도비용"만 안분하라고 하므로,
   * 그 파트에 귀속되는 것이 분명하면 안분하지 않고 전액 그 파트에서 차감한다.
   * 미주입 파트는 종전대로 §166⑥ 비율 안분.
   */
  landDirectExpenses?: number;
  buildingDirectExpenses?: number;
  /**
   * 파트별 **실지거래가액**(§97①1호 가목) — 별개 취득이라 파트별로 실재하는 취득가액이다.
   *
   * 두 값이 모두 있으면 자산 총액 안분을 **쓰지 않는다**. 「소득세법」 제100조 제2항 전문은
   * 「토지와 건물 등을 함께 취득하거나 양도한 경우에는 이를 **각각 구분하여 기장**하되 …
   * 가액 **구분이 불분명할 때에는** … 안분계산한다」이므로, 구분이 분명하면 안분 대상이 아니다.
   */
  landAcquisitionPrice?: number;
  buildingAcquisitionPrice?: number;
  buildingAcquisitionCause?: "purchase" | "inheritance" | "gift" | "carryover_gift" | "newConstruction";
  /** 상속 시 피상속인 취득일 (영 §95④). */
  decedentAcquisitionDate?: Date;
  /** 증여 시 증여자 취득일 (영 §95④). */
  donorAcquisitionDate?: Date;
}
// ── 경로 B: 실거래가/감정가 모드 ─────────────────────────────────────

/**
 * 실거래가/감정가 모드 — §166⑥ 비율로 실거래가 안분 + NBL 중과.
 *
 * 취득가액·필요경비를 양도시 기준시가 비율로 토지·건물에 안분.
 * 환산취득가(③ 취득시 기준시가)는 사용하지 않으며 개산공제도 없음.
 */
export function calculateGeneralBuildingActualTransfer(
  payload: GeneralBuildingActualPricePayload,
  taxYear: number,
  annualBasicDeductionUsed: number | undefined,
  priorReductionUsage: unknown[],
  rates: TaxRatesMap,
): GeneralBuildingRouteResult {
  const {
    totalTransferPrice, transferDate, acquisitionDate,
    landArea, buildingFootprintArea,
    transferLandPricePerSqm, transferBuildingStdPrice,
    // isMetropolitan은 더 이상 구조분해하지 않는다 — 「지방세법 시행령」 제101조 제2항
    //   배율에 수도권 축이 없다(2026-07-30 정정). payload 필드 자체는 하위호환으로 잔존.
    zoneType, isUnregistered = false,
    actualAcquisitionPrice, actualExpenses,
    acquisitionLandPricePerSqm, acquisitionBuildingStdPrice,
    burdenedGiftInfo,
    houseToCommercialConversion, conversionDate, wasMultiHouseAtConversion,
    acquisitionByInheritance, buildingAcquisitionByInheritance,
    inheritedLandValue, inheritedBuildingValue,
    landAcquisitionCause, decedentAcquisitionDate, donorAcquisitionDate,
    landAcquisitionDate, buildingAcquisitionDate, buildingAcquisitionCause,
    landDirectExpenses, buildingDirectExpenses,
    landAcquisitionPrice, buildingAcquisitionPrice,
  } = payload;

  /**
   * 파트별 카드 취득일 — 「분리 OFF면 두 날짜가 같다」 불변식의 방어적 표현(계획서 §3.2(1)).
   * `acquisitionDate`(자산 단위)는 M-1a 이후 **건물** 취득일이다.
   */
  const landCardDate = landAcquisitionDate ?? acquisitionDate;
  const buildingCardDate = buildingAcquisitionDate ?? acquisitionDate;

  // §166⑥ 안분 비율
  const landStdAtTransfer = transferLandPricePerSqm * landArea;
  const totalStd = landStdAtTransfer + transferBuildingStdPrice;
  if (totalStd <= 0) throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT,
    "일반건물(실거래가): 양도시 기준시가 합계가 0이면 안분이 불가합니다.");

  const landRatioNum = landStdAtTransfer / totalStd; // 연속 부동소수 계산용

  // 부담부증여 §159①1호 분기 — 사용자 입력 actualAcquisitionPrice 무시,
  // 자산별 양도가/취득가/개산공제를 채무비율로 환산.
  // §159①1호 단서: "양도가액을 §99 기준시가로 산정한 경우 취득가액도 §99 기준시가로 산정".
  // 부담부증여는 채무액 자체가 양도가액이므로 기준시가 모드와 동치.
  let landTransfer: number;
  let buildingTransfer: number;
  let landAcq: number;
  let buildingAcq: number;
  let landExp: number;
  let buildingExp: number;
  let transferBurdenedGiftBreakdown:
    | import("@/lib/tax-engine/types/transfer-burdened-gift.types").TransferBurdenedGiftBreakdown
    | undefined;

  if (burdenedGiftInfo) {
    if (!acquisitionLandPricePerSqm || !acquisitionBuildingStdPrice) {
      throw new TaxCalculationError(
        TaxErrorCode.INVALID_INPUT,
        "일반건물 부담부증여(§159①1호): 취득시 토지·건물 기준시가가 필요합니다.",
      );
    }
    const breakdown = buildBurdenedGiftBreakdown({
      landStdPriceAtTransfer: landStdAtTransfer,
      buildingStdPriceAtTransfer: transferBuildingStdPrice,
      landStdPriceAtAcquisition: acquisitionLandPricePerSqm * landArea,
      buildingStdPriceAtAcquisition: acquisitionBuildingStdPrice,
      info: burdenedGiftInfo,
      giftDate: transferDate, // 증여일 = 양도일 (의제)
      // K-4(실지취득가) 실비: actualExpenses(자본적지출+양도비)를 채무비율 안분하여 estimatedDeduction에 반영.
      capitalExpenditure: actualExpenses,
      transferExpense: 0,
    });
    landTransfer = breakdown.perAsset.land.transferPrice;
    buildingTransfer = breakdown.perAsset.building.transferPrice;
    landAcq = breakdown.perAsset.land.acquisitionPrice;
    buildingAcq = breakdown.perAsset.building.acquisitionPrice;
    landExp = breakdown.perAsset.land.estimatedDeduction; // §163⑥ 개산공제 (3%)
    buildingExp = breakdown.perAsset.building.estimatedDeduction;
    transferBurdenedGiftBreakdown = breakdown; // 증여세 통합 결과 포함 — UI 노출용
  } else if (acquisitionByInheritance && buildingAcquisitionByInheritance) {
    // §163⑨ 상속 취득가액 직접 산정 (Phase 1 = C1): 토지·건물 각 상속개시일 평가액을
    // 취득당시 실지거래가액으로 직접 배정. §166⑥ 안분 아님 (KoreanLaw: 상속은 자산별 평가액 명확
    // → "구분 불분명" 요건 미충족). 양도가액만 §166⑥ 안분 유지.
    landTransfer = Math.floor(totalTransferPrice * landRatioNum);
    buildingTransfer = totalTransferPrice - landTransfer;
    landAcq = inheritedLandValue ?? 0;
    buildingAcq = inheritedBuildingValue ?? 0;
    // 필요경비(자본적지출·양도비)는 §166⑥ 비율 안분 유지. 개산공제 아님 —
    // actual 모드는 이미 전 카드 estimatedDeduction:0(§163⑥ 미적용, §163⑨ 정합).
    landExp = Math.floor(actualExpenses * landRatioNum);
    buildingExp = actualExpenses - landExp;
  } else {
    landTransfer = Math.floor(totalTransferPrice * landRatioNum);
    buildingTransfer = totalTransferPrice - landTransfer;
    /**
     * 🔴 파트별 실지거래가액이 **둘 다** 있으면 안분하지 않고 그대로 쓴다(2026-08-06).
     *
     * 종전에는 이 값을 destructure조차 하지 않아, 분리 ON + 두 파트 모두 실거래가에서
     * 파트 취득가액이 **엔진에 도달하지 못했다**. 분리 ON은 자산 단위 취득가액 칸을 숨기므로
     * (`hideAssetAcqAxis`) `actualAcquisitionPrice`가 0이 되어 **취득가액 0**으로 계산됐다
     * (실측 과대과세 139,033,991원 · validate는 통과시켰다).
     *
     * 근거는 「소득세법」 제100조 제2항 **전문**이다 — 안분은 「가액 구분이 **불분명할 때**」의
     * 규칙이고, 별개 취득으로 파트별 실지거래가액이 실재하면 구분이 분명하다.
     *
     * ⚠️ **한쪽만** 입력된 경우는 안분을 유지한다. 반쪽 값으로 총액을 대체하면 상대 파트가
     *    잔액으로 깎이는데, 그 총액은 두 파트의 합이 아니라 자산 전체 입력값이다
     *    (P5의 필요경비 규칙과 같은 판단).
     */
    const hasBothPartPrices =
      landAcquisitionPrice !== undefined &&
      landAcquisitionPrice > 0 &&
      buildingAcquisitionPrice !== undefined &&
      buildingAcquisitionPrice > 0;
    if (hasBothPartPrices) {
      landAcq = landAcquisitionPrice;
      buildingAcq = buildingAcquisitionPrice;
    } else {
      landAcq = Math.floor(actualAcquisitionPrice * landRatioNum);
      buildingAcq = actualAcquisitionPrice - landAcq;
    }
    /**
     * 필요경비 — **파트 직접 귀속이 있으면 안분하지 않는다**(2026-08-05 P5).
     * 근거는 「소득세법」 제100조 제2항 후문의 **유추**다: "이 경우 **공통되는** 취득가액과
     * 양도비용은 해당 자산의 가액에 비례하여 안분계산한다." — 문언은 취득가액·양도비용만 들고
     * **자본적지출을 열거하지 않으므로 직접 근거가 아니다**. 다만 「공통되는」이 요건인 구조는
     * 같아, 귀속이 분명한 지출을 안분하지 않는 것이 그 취지에 부합한다(`AssetSectionExpense.tsx:37`
     * 의 일부양도 유추와 같은 층위).
     * 한쪽만 입력되면 그 파트만 직접 귀속하고 나머지는 총액 안분분을 그대로 둔다
     * (잔액 도출로 상대 파트를 깎지 않는다 — 총액은 두 파트의 합이 아니라 자산 전체 입력값이다).
     */
    const landExpApportioned = Math.floor(actualExpenses * landRatioNum);
    landExp = landDirectExpenses ?? landExpApportioned;
    buildingExp = buildingDirectExpenses ?? actualExpenses - landExpApportioned;
  }

  // NBL 판정 — 본체는 공용 헬퍼(`appurtenant-land-excess.ts`). 환산·증축 경로와 공유.
  const {
    isWithinLimit: isWithinNblRatio,
    nonBusinessArea,
    nonBusinessRatio,
  } = judgeAppurtenantLandExcess({
    landArea,
    buildingFootprintArea,
    zoneType,
    isUnregistered,
    context: "일반건물(실거래가)",
  });

  // 토지 카드 생성 (초과 시 사업용·비사업용 분할 — 인정면적 직접 안분, round 의존 제거)
  const cards: AssetCardForAggregate[] = [];
  if (!isWithinNblRatio && nonBusinessRatio > 0) {
    const businessArea = landArea - nonBusinessArea; // 사업용 인정면적 (무허가=0)
    const landBizTransfer = apportionLandByBusinessArea(landTransfer, businessArea, landArea);
    const landBizAcq = apportionLandByBusinessArea(landAcq, businessArea, landArea);
    const landBizExp = apportionLandByBusinessArea(landExp, businessArea, landArea);
    cards.push({
      propertyId: "land_business", propertyLabel: "토지-사업용(1001)", propertyType: "land",
      transferPrice: landBizTransfer, acquisitionPrice: landBizAcq, expenses: landBizExp,
      usedEstimatedAcquisition: false, estimatedBase: 0, estimatedDeduction: 0,
      acquisitionDate: landCardDate, transferDate, isNonBusinessLand: false,
    } as unknown as AssetCardForAggregate);
    cards.push({
      propertyId: "land_nbl", propertyLabel: "토지-비사업용초과분(1002)", propertyType: "land",
      transferPrice: landTransfer - landBizTransfer,
      acquisitionPrice: landAcq - landBizAcq,
      expenses: landExp - landBizExp,
      usedEstimatedAcquisition: false, estimatedBase: 0, estimatedDeduction: 0,
      acquisitionDate: landCardDate, transferDate, isNonBusinessLand: true,
    } as unknown as AssetCardForAggregate);
  } else {
    cards.push({
      propertyId: "land", propertyLabel: "토지(1001)", propertyType: "land",
      transferPrice: landTransfer, acquisitionPrice: landAcq, expenses: landExp,
      usedEstimatedAcquisition: false, estimatedBase: 0, estimatedDeduction: 0,
      acquisitionDate: landCardDate, transferDate, isNonBusinessLand: false,
    } as unknown as AssetCardForAggregate);
  }
  cards.push({
    propertyId: "building", propertyLabel: "건물(3001)", propertyType: "general_building_unit",
    transferPrice: buildingTransfer, acquisitionPrice: buildingAcq, expenses: buildingExp,
    usedEstimatedAcquisition: false, estimatedBase: 0, estimatedDeduction: 0,
    acquisitionDate: buildingCardDate, transferDate, isNonBusinessLand: false,
  } as unknown as AssetCardForAggregate);

  // §95④ 단기보유 기산점 보강 (actual 분기 기존 결측 — 상속·증여 취득원인 + 피상속인/증여자 취득일).
  // 토지 카드는 landAcquisitionCause, 건물 카드는 buildingAcquisitionCause로 buildProperties가 판독.
  for (const c of cards) {
    if (c.propertyType === "land") {
      if (landAcquisitionCause) c.landAcquisitionCause = landAcquisitionCause;
      if (decedentAcquisitionDate) c.decedentAcquisitionDate = decedentAcquisitionDate;
      if (donorAcquisitionDate) c.donorAcquisitionDate = donorAcquisitionDate;
    } else {
      // 건물 카드 — 취득원인을 **항상** 싣는다(종전에는 상속만 실려 §104② 기산점 분기가 죽었다).
      // buildProperties(:158)가 `card.buildingAcquisitionCause`로 판독한다.
      if (buildingAcquisitionByInheritance) {
        // C1: 건물도 상속 — 피상속인 취득일(동일 피상속인 전제).
        c.buildingAcquisitionCause = "inheritance";
        if (decedentAcquisitionDate) c.decedentAcquisitionDate = decedentAcquisitionDate;
      } else if (buildingAcquisitionCause) {
        c.buildingAcquisitionCause = buildingAcquisitionCause;
      }
    }
  }

  // 사례 35: 주택→상가 용도변경 — 모든 자산 카드에 일괄 propagate
  if (houseToCommercialConversion) {
    for (const c of cards) {
      c.houseToCommercialConversion = true;
      c.conversionDate = conversionDate;
      c.wasMultiHouseAtConversion = wasMultiHouseAtConversion;
    }
  }

  const properties = buildProperties(cards, nonBusinessRatio);
  const aggregated = calculateTransferTaxAggregate(
    {
      taxYear,
      properties,
      annualBasicDeductionUsed: annualBasicDeductionUsed ?? 0,
      basicDeductionAllocation: "MAX_BENEFIT",
      priorReductionUsage: (priorReductionUsage ?? []) as never,
    },
    rates,
  );

  const apportionment = buildApportionment(
    cards, totalStd, nonBusinessRatio,
    landStdAtTransfer, null,
    transferBuildingStdPrice, null,
    false,
    "소득세법 시행령 §166⑥ · §104의3",
  );

  // UI 자산별 산식 인라인 표시용 — 실가 모드에서도 gbDetail 노출 (사례 35 등).
  // landStdTotal·buildingStdTotal로 §166⑥ 안분 산식 빌더 활성화.
  const acqLandStdTotalActual = acquisitionLandPricePerSqm
    ? Math.floor(acquisitionLandPricePerSqm * landArea)
    : undefined;
  aggregated.generalBuildingValuationDetail = {
    assetCards: cards,
    nonBusinessRatio,
    landStdTotal: landStdAtTransfer,
    buildingStdTotal: transferBuildingStdPrice,
    acqLandStdTotal: acqLandStdTotalActual,
    acqBuilding1StdTotal: acquisitionBuildingStdPrice ?? undefined,
    bundledActualAcquisitionPrice: actualAcquisitionPrice ?? undefined,
    bundledActualExpenses: actualExpenses ?? undefined,
    // §163⑨ 상속 취득가액 직접 산정 echo (결과 카드 라벨 분기용).
    ...(acquisitionByInheritance ? { acquisitionByInheritance } : {}),
    ...(buildingAcquisitionByInheritance ? { buildingAcquisitionByInheritance } : {}),
  } as GeneralBuildingOutput;

  return { apportionment, aggregated, transferBurdenedGiftBreakdown };
}
