/**
 * 일괄양도 companion 자산 한도 초과 split 헬퍼 (G-2, 영 §154⑦)
 *
 * 신축주택 + 부수토지 일체과세 케이스에서
 * companion 토지가 부수토지 인정 한도를 초과하면
 * 한도 내 자산(부수토지) + 한도 초과 자산(나대지)으로 split한다.
 *
 * split 진입 조건:
 *   1. primary.acquisitionCause === "newConstruction"
 *   2. companion.assetKind === "land"
 *   3. companion.areaM2 > 0 (면적 확인 가능)
 *   4. excessArea > 0  (resolveCompanionLandRate 결과)
 *   5. companion.manualHoldingPeriodOverride === undefined (수동 지정 없음)
 *
 * 금액 안분 원칙 (정수 보존):
 *   - 각 금액을 Math.floor(금액 × 비율)로 excess 몫 계산
 *   - appurtenant 몫 = 전체 - excess 몫 (나머지 귀속, 절사 오차 흡수)
 *
 * 법령 근거:
 *   §89①3호 (1세대1주택·부수토지 일체과세)
 *   영 §154⑦ (부수토지 인정 면적 한도: 도시지역 5배, 도시지역 외 10배)
 *   기재부 재산-53(2015.1.15) / 재산-1354(2022.10.27)
 */

import type { TransferTaxItemInput } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { TransferReduction } from "@/lib/tax-engine/types/transfer.types";
import { resolveCompanionLandRate } from "@/lib/tax-engine/appurtenant-land-rate";
import {
  calculateHoldingPeriod,
  calculateEstimatedAcquisitionPrice,
} from "@/lib/tax-engine/tax-utils";
import {
  apportionBundledSale,
  type BundledAssetInput,
  type BundledApportionmentResult,
} from "@/lib/tax-engine/bundled-sale-apportionment";
import { calculateInheritanceAcquisitionPrice } from "@/lib/tax-engine/inheritance-acquisition-price";
import type { InheritanceAssetKind } from "@/lib/tax-engine/inheritance-acquisition-price";

// ─── 사례 28 자동 분기 양방향 확장 ───────────────────────────────
// 자산 순서와 무관하게(primary가 land여도) companion에서 housing을 검색하여
// land 자산에 housing 컨텍스트(부수토지 한도·보유기간)를 주입하기 위한 헬퍼.

interface CompanionForHousingCtx {
  assetKind: string;
  acquisitionDate?: string;
  buildingFootprintArea?: number;
  isUrbanArea?: boolean;
  appurtenantLandZone?: "metropolitan_residential" | "non_metropolitan_or_green" | "non_urban";
}

interface PrimaryCtxResult {
  propertyType: "housing";
  holdingMonths: number;
  buildingFootprintArea?: number;
  isUrbanArea?: boolean;
  appurtenantLandZone?: "metropolitan_residential" | "non_metropolitan_or_green" | "non_urban";
  bundledSaleMode?: "actual" | "apportioned";
}

/**
 * primary가 housing이 아닌 경우 companion 배열에서 housing 자산을 검색하여
 * 부수토지 자동 분기에 필요한 housing 컨텍스트를 도출한다.
 * housing이 없거나 acquisitionDate가 없으면 undefined.
 */
export function resolveHousingContextFromCompanion(
  companions: CompanionForHousingCtx[],
  transferDate: Date,
  fallbackBuildingFootprintArea: number | undefined,
  fallbackIsUrbanArea: boolean | undefined,
  bundledSaleMode: "actual" | "apportioned" | undefined,
  fallbackAppurtenantLandZone?:
    | "metropolitan_residential"
    | "non_metropolitan_or_green"
    | "non_urban",
): PrimaryCtxResult | undefined {
  const housing = companions.find((c) => c.assetKind === "housing");
  if (!housing || !housing.acquisitionDate) return undefined;
  const hp = calculateHoldingPeriod(new Date(housing.acquisitionDate), transferDate);
  return {
    propertyType: "housing",
    holdingMonths: hp.years * 12 + hp.months,
    buildingFootprintArea: housing.buildingFootprintArea ?? fallbackBuildingFootprintArea,
    isUrbanArea: housing.isUrbanArea ?? fallbackIsUrbanArea,
    appurtenantLandZone: housing.appurtenantLandZone ?? fallbackAppurtenantLandZone,
    bundledSaleMode,
  };
}

// resolveUserModeOverride 제거됨 (2026-05-07): 자산별 landNature 명시 입력으로 대체.
// 폼-수준 appurtenantLandRateMode → companion manualHoldingPeriodOverride 매핑 불필요.

// ─── companion engineInput 빌드 + split 분기 통합 헬퍼 ────────────
// route.ts의 인라인 60줄을 헬퍼로 추출 (800줄 정책 준수).

interface CompanionRawAsset {
  assetId: string;
  assetLabel?: string;
  assetKind: "housing" | "land" | "building";
  acquisitionDate?: string;
  acquisitionCause: TransferTaxItemInput["acquisitionCause"];
  decedentAcquisitionDate?: string;
  donorAcquisitionDate?: string;
  assetContractDate?: string;
  capitalExpenditure?: number;
  transferExpense?: number;
  useEstimatedAcquisition?: boolean;
  standardPriceAtAcquisition?: number;
  standardPriceAtTransfer?: number;
  // 공익수용 §164⑨ 1호 환산 min[] 특례 (계획 Q5 — 컴패니언 지원).
  // ⑫ `transfer-tax-schema-sub.ts` 컴패니언 스키마와 1:1이어야 한다(누락 시 침묵 strip).
  transferCause?: "general" | "public_expropriation";
  standardPricePerSqmAtTransfer?: number;
  transferArea?: number;
  compensationPerSqm?: number;
  compensationBasisStdPrice?: number;
  // §164⑨2호 공매·경락 특례 (P4 — 컴패니언 지원, 1호와 대칭)
  isAuctionTransfer?: boolean;
  auctionPrice?: number;
  // §164⑨1호 주택 총액 트랙 (P5 — 컴패니언 주택 지원)
  housingCompensationTotal?: number;
  housingCompensationBasisTotal?: number;
  residencePeriodMonths?: number;
  isUnregistered?: boolean;
  isNonBusinessLand?: boolean;
  isOneHousehold?: boolean;
  reductions?: Array<{
    type: string;
    businessApprovalDate?: string;
    incorporationDate?: string;
    [key: string]: unknown;
  }>;
  manualHoldingPeriodOverride?: "shortTermHousing70" | "shortTerm60" | "progressive";
  /**
   * 토지 성질 명시 입력 (assetKind === "land" 전용).
   * Zod companion schema의 landNature enum에서 도출됨.
   * - "appurtenant_to_housing": 주택 부수토지 (§89①3호·영§154⑦ 일체과세 대상)
   * - "non_appurtenant": 독립 나대지
   */
  landNature?: "appurtenant_to_housing" | "non_appurtenant";
  areaM2?: number;
  totalPropertyTransferPrice?: number;
}

interface CompanionApportioned {
  assetLabel?: string;
  allocatedSalePrice: number;
  allocatedAcquisitionPrice: number;
  allocatedExpenses: number;
}

interface CompanionBuildContext {
  primaryCtxForSplit?: {
    propertyType: TransferTaxItemInput["propertyType"];
    holdingMonths: number;
    buildingFootprintArea?: number;
    isUrbanArea?: boolean;
    appurtenantLandZone?:
      | "metropolitan_residential"
      | "non_metropolitan_or_green"
      | "non_urban";
    bundledSaleMode?: "actual" | "apportioned";
  };
  // userModeOverride 제거됨 (2026-05-07): 자산별 landNature 기반으로 대체
  primaryAcquisitionDate: Date;
  transferDate: Date;
  primaryAcquisitionCause: TransferTaxItemInput["acquisitionCause"];
  primaryEngineInput: {
    householdHousingCount: number;
    isRegulatedArea: boolean;
    wasRegulatedAtAcquisition: boolean;
    propertyType: TransferTaxItemInput["propertyType"];
    buildingFootprintArea?: number;
    isUrbanArea?: boolean;
    appurtenantLandZone?:
      | "metropolitan_residential"
      | "non_metropolitan_or_green"
      | "non_urban";
  };
  bundledSaleMode?: "actual" | "apportioned";
  adjustedAcqPrice?: number;
}

/**
 * companion 자산 1개 → engineInput 1~2개 (한도 초과 split 시 2개) 빌드.
 * 사용자 폼-수준 모드(userModeOverride)와 companion 자체 manualHoldingPeriodOverride를 합성.
 */
export function buildCompanionEngineInputs(
  c: CompanionRawAsset,
  a: CompanionApportioned,
  ctx: CompanionBuildContext,
): TransferTaxItemInput[] {
  const acqPrice = ctx.adjustedAcqPrice ?? a.allocatedAcquisitionPrice;
  const acqDate = c.acquisitionDate ? new Date(c.acquisitionDate) : ctx.primaryAcquisitionDate;
  const decedent =
    c.acquisitionCause === "inheritance" && c.decedentAcquisitionDate
      ? new Date(c.decedentAcquisitionDate)
      : undefined;
  const donor =
    c.acquisitionCause === "gift" && c.donorAcquisitionDate
      ? new Date(c.donorAcquisitionDate)
      : undefined;
  // companion 자체 수동 override 사용 (폼-수준 userModeOverride 제거됨).
  const effectiveOverride = c.manualHoldingPeriodOverride;

  const propertyType: TransferTaxItemInput["propertyType"] =
    c.assetKind === "housing" ? "housing" : c.assetKind === "building" ? "building" : "land";

  const companionEngine: TransferTaxItemInput = {
    propertyType,
    transferPrice: a.allocatedSalePrice,
    totalPropertyTransferPrice: c.totalPropertyTransferPrice,
    transferDate: ctx.transferDate,
    acquisitionPrice: acqPrice,
    acquisitionDate: acqDate,
    assetContractDate: c.assetContractDate ? new Date(c.assetContractDate) : undefined,
    expenses: a.allocatedExpenses,
    capitalExpenditure: c.capitalExpenditure,
    transferExpense: c.transferExpense,
    useEstimatedAcquisition:
      c.acquisitionCause === "purchase" && (c.useEstimatedAcquisition ?? false),
    standardPriceAtAcquisition: c.standardPriceAtAcquisition,
    standardPriceAtTransfer: c.standardPriceAtTransfer,
    // 공익수용 §164⑨ 1호 환산 min[] 특례 — 컴패니언 자산 지원(계획 Q5).
    // 엔진이 게이트 판정(적격 자산·환산·수용·2009.02.04·후보>0) — 여기선 원값만 전달.
    // ⚠️ 이 매핑이 없으면 ⑫ Zod를 통과한 값이 엔진에 **도달하지 못한다**(명시 매핑 = 침묵 strip 지점).
    transferCause: c.transferCause,
    standardPricePerSqmAtTransfer: c.standardPricePerSqmAtTransfer,
    transferArea: c.transferArea,
    compensationPerSqm: c.compensationPerSqm,
    compensationBasisStdPrice: c.compensationBasisStdPrice,
    // §164⑨2호 공매·경락 (P4 — 컴패니언). 엔진이 게이트 판정 — 여기선 원값 전달(침묵 strip 방지).
    isAuctionTransfer: c.isAuctionTransfer,
    auctionPrice: c.auctionPrice,
    // §164⑨1호 주택 총액 트랙 (P5 — 컴패니언 주택)
    housingCompensationTotal: c.housingCompensationTotal,
    housingCompensationBasisTotal: c.housingCompensationBasisTotal,
    householdHousingCount: ctx.primaryEngineInput.householdHousingCount,
    residencePeriodMonths: c.residencePeriodMonths ?? 0,
    isRegulatedArea: ctx.primaryEngineInput.isRegulatedArea,
    wasRegulatedAtAcquisition: ctx.primaryEngineInput.wasRegulatedAtAcquisition,
    isUnregistered: c.isUnregistered ?? false,
    isNonBusinessLand: c.isNonBusinessLand ?? false,
    isOneHousehold: c.isOneHousehold ?? false,
    acquisitionCause: c.acquisitionCause,
    decedentAcquisitionDate: decedent,
    donorAcquisitionDate: donor,
    reductions: mapCompanionReductions(c.reductions ?? []),
    propertyId: c.assetId,
    propertyLabel: c.assetLabel ?? "",
    manualHoldingPeriodOverride: effectiveOverride,
    landNature: c.landNature,
    primaryContextForCompanionRate: ctx.primaryCtxForSplit,
    acquisitionArea: c.areaM2,
  };

  // G-2 한도 초과 split (영 §154⑦)
  if (ctx.primaryCtxForSplit) {
    const splitResult = resolveCompanionSplit(
      {
        assetId: c.assetId,
        assetLabel: c.assetLabel ?? "",
        assetKind: c.assetKind,
        areaM2: c.areaM2,
        manualHoldingPeriodOverride: effectiveOverride,
        landNature: c.landNature,
      },
      {
        acquisitionCause: ctx.primaryAcquisitionCause,
        buildingFootprintArea: ctx.primaryEngineInput.buildingFootprintArea,
        isUrbanArea: ctx.primaryEngineInput.isUrbanArea,
        appurtenantLandZone: ctx.primaryEngineInput.appurtenantLandZone,
        holdingMonths: ctx.primaryCtxForSplit.holdingMonths,
        propertyType: ctx.primaryEngineInput.propertyType,
        bundledSaleMode: ctx.bundledSaleMode,
      },
      ctx.transferDate,
    );
    if (splitResult.applied) {
      return splitCompanionIntoTwo(companionEngine, splitResult, ctx.primaryCtxForSplit);
    }
  }

  return [companionEngine];
}

// ─── 타입 ───────────────────────────────────────────────────────

/** split 판정에 필요한 companion 정보 요약 */
export interface CompanionSplitContext {
  assetId: string;
  assetLabel: string;
  assetKind: "housing" | "land" | "building";
  areaM2?: number;
  manualHoldingPeriodOverride?: "shortTermHousing70" | "shortTerm60" | "progressive";
  /** 토지 성질 명시 입력 — "appurtenant_to_housing"일 때만 split 진입 */
  landNature?: "appurtenant_to_housing" | "non_appurtenant";
}

/** split 판정에 필요한 primary 컨텍스트 */
export interface PrimarySplitContext {
  acquisitionCause?: string;
  buildingFootprintArea?: number;
  isUrbanArea?: boolean;
  appurtenantLandZone?:
    | "metropolitan_residential"
    | "non_metropolitan_or_green"
    | "non_urban";
  holdingMonths: number;
  propertyType: TransferTaxItemInput["propertyType"];
  bundledSaleMode?: "actual" | "apportioned";
}

/** split 불필요 */
export type CompanionSplitNotApplied = { applied: false };

/** split 필요 — 비율 포함 */
export type CompanionSplitApplied = {
  applied: true;
  limitArea: number;
  excessArea: number;
  /** 한도 내(부수토지) 비율 (0~1) */
  appurtenantRatio: number;
  /** 한도 초과 비율 (0~1) */
  excessRatio: number;
};

/** split 결과 — applied=false면 split 불필요 */
export type CompanionSplitResult = CompanionSplitNotApplied | CompanionSplitApplied;

// ─── 함수 ───────────────────────────────────────────────────────

/**
 * companion을 한도 내/초과로 분리할지 판정하고 비율을 반환.
 */
export function resolveCompanionSplit(
  companion: CompanionSplitContext,
  primary: PrimarySplitContext,
  /** 양도일 — 영 §167의5 배율 경과조치(2022.1.1., 부칙 §39) 판정용. */
  transferDate?: Date,
): CompanionSplitResult {
  // split 진입 조건:
  //   1. companion이 토지이고 landNature === "appurtenant_to_housing" (명시적 부수토지 선언)
  //   2. 면적 확인 가능 (areaM2 > 0)
  //   3. 수동 오버라이드 없음 (manualHoldingPeriodOverride === undefined)
  // 이전 조건 "acquisitionCause === newConstruction"은 landNature 명시 입력으로 대체됨.
  if (
    companion.assetKind !== "land" ||
    companion.landNature !== "appurtenant_to_housing" ||
    !companion.areaM2 ||
    companion.areaM2 <= 0 ||
    companion.manualHoldingPeriodOverride !== undefined
  ) {
    return { applied: false };
  }

  const resolution = resolveCompanionLandRate(
    { assetKind: "land", area: companion.areaM2 },
    {
      propertyType: primary.propertyType,
      holdingMonths: primary.holdingMonths,
      buildingFootprintArea: primary.buildingFootprintArea,
      isUrbanArea: primary.isUrbanArea,
      appurtenantLandZone: primary.appurtenantLandZone,
      bundledSaleMode: primary.bundledSaleMode,
    },
    transferDate,
  );

  if (!resolution.applied || !resolution.excessArea || resolution.excessArea <= 0) {
    return { applied: false };
  }

  const limitArea = resolution.limitArea!;
  const excessArea = resolution.excessArea;
  const totalArea = companion.areaM2;

  // 비율은 정밀 부동소수로 유지, 금액 안분 시에만 floor 적용
  const excessRatio = excessArea / totalArea;
  const appurtenantRatio = limitArea / totalArea;

  return { applied: true, limitArea, excessArea, appurtenantRatio, excessRatio };
}

/**
 * companion 엔진 입력 기반(base)과 split 결과를 받아
 * [appurtenant, excess] 두 TransferTaxItemInput을 반환.
 *
 * 금액 안분 (Math.floor — 정수 보존, Math.round 금지):
 *   excess 몫 = Math.floor(전체 × excessRatio)
 *   appurtenant 몫 = 전체 - excess 몫 (나머지 귀속)
 */
export function splitCompanionIntoTwo(
  base: TransferTaxItemInput,
  split: CompanionSplitApplied,
  primaryCtx: NonNullable<TransferTaxItemInput["primaryContextForCompanionRate"]>,
): [TransferTaxItemInput, TransferTaxItemInput] {
  const { appurtenantRatio, excessRatio, limitArea } = split;

  // 금액 안분 헬퍼 — floor 적용, 나머지는 appurtenant에 귀속
  function splitAmount(total: number): { appurtenant: number; excess: number } {
    const excess = Math.floor(total * excessRatio);
    return { appurtenant: total - excess, excess };
  }

  const xferSplit = splitAmount(base.transferPrice);
  const acqSplit = splitAmount(base.acquisitionPrice);
  const expSplit = splitAmount(base.expenses ?? 0);
  const capexSplit = splitAmount(base.capitalExpenditure ?? 0);
  const texpSplit = splitAmount(base.transferExpense ?? 0);

  // 자산 A: 부수토지 한도 내 — primaryContextForCompanionRate 유지 (70% 적용)
  const appurtenant: TransferTaxItemInput = {
    ...base,
    propertyId: `${base.propertyId}__appurtenant`,
    propertyLabel: `${base.propertyLabel}(부수토지 한도 내)`,
    transferPrice: xferSplit.appurtenant,
    acquisitionPrice: acqSplit.appurtenant,
    expenses: expSplit.appurtenant,
    capitalExpenditure: capexSplit.appurtenant > 0 ? capexSplit.appurtenant : undefined,
    transferExpense: texpSplit.appurtenant > 0 ? texpSplit.appurtenant : undefined,
    acquisitionArea: limitArea,
    // 부수토지 → 주택 세율(70%) 자동 적용을 위해 primaryCtx 그대로 유지
    primaryContextForCompanionRate: primaryCtx,
  };

  // 자산 B: 한도 초과 — primaryContextForCompanionRate 제거 (토지 본래 보유기간 적용)
  //   영 §154⑦ 초과분은 일반 나대지 → 보유기간 기준 §104①3호 세율(토지 본래 보유기간)
  const excess: TransferTaxItemInput = {
    ...base,
    propertyId: `${base.propertyId}__excess`,
    propertyLabel: `${base.propertyLabel}(한도 초과)`,
    transferPrice: xferSplit.excess,
    acquisitionPrice: acqSplit.excess,
    expenses: expSplit.excess,
    capitalExpenditure: capexSplit.excess > 0 ? capexSplit.excess : undefined,
    transferExpense: texpSplit.excess > 0 ? texpSplit.excess : undefined,
    acquisitionArea: split.excessArea,
    // 한도 초과분은 주택 일체과세 배제 → primaryContext 없음
    primaryContextForCompanionRate: undefined,
    // 수동 오버라이드도 없음 (본래 보유기간 기준 세율 자동 적용)
    manualHoldingPeriodOverride: undefined,
  };

  return [appurtenant, excess];
}

/**
 * reductions 배열을 Date 변환하는 공통 헬퍼.
 * route.ts에서 중복 사용하던 로직을 추출.
 */
export function mapCompanionReductions(
  reductions: Array<{
    type: string;
    businessApprovalDate?: string;
    incorporationDate?: string;
    [key: string]: unknown;
  }>,
): TransferReduction[] {
  return reductions.map((r): TransferReduction => {
    if (r.type === "public_expropriation") {
      return { ...r, businessApprovalDate: new Date(r.businessApprovalDate!) } as TransferReduction;
    }
    // §77의2 대토보상 — 사업인정고시일 string → Date (optional). 미상 시 undefined (Date<string 비교 함정 방지)
    if (r.type === "replacement_land_comp") {
      return {
        ...r,
        businessApprovalDate: r.businessApprovalDate ? new Date(r.businessApprovalDate) : undefined,
      } as TransferReduction;
    }
    if (r.type === "self_farming") {
      return {
        ...r,
        incorporationDate: r.incorporationDate ? new Date(r.incorporationDate) : undefined,
      } as TransferReduction;
    }
    return r as TransferReduction;
  });
}

// ─── 일괄양도 안분 준비·실행 헬퍼 (route.ts (1)~(4.5) 추출, 800줄 정책) ───
// 상속 보충평가 취득가액 → companion 취득가액 → BundledAssetInput 조립 → 안분 →
// 매매 환산 사후산정까지를 단일 함수로. route는 결과(apportionment·adjustedAcq)만 소비한다.

interface BundledInheritanceValuation {
  inheritanceDate: string;
  assetKind: InheritanceAssetKind;
  landAreaM2?: number;
  publishedValueAtInheritance: number;
}

interface BundledPrimaryInput {
  // 넓은 union 허용 (right_to_move_in 등) — 내부에서 housing/building/land로 매핑
  propertyType: TransferTaxItemInput["propertyType"];
  totalSalePrice?: number;
  standardPriceAtTransferForApportion?: number;
  expenses?: number;
  acquisitionPrice: number;
  /** 지분 모드·actual 모드에서 route가 fixedSalePrice로 주입할 primary 확정 양도가액 */
  primaryActualSalePrice?: number;
  primaryInheritanceValuation?: BundledInheritanceValuation;
}

interface BundledCompanionForApportion {
  assetId: string;
  assetLabel: string;
  assetKind: "housing" | "land" | "building";
  acquisitionCause: TransferTaxItemInput["acquisitionCause"];
  useEstimatedAcquisition?: boolean;
  standardPriceAtTransfer?: number;
  standardPriceAtAcquisition?: number;
  directExpenses?: number;
  fixedAcquisitionPrice?: number;
  fixedSalePrice?: number;
  inheritanceValuation?: BundledInheritanceValuation;
}

/**
 * 일괄양도 안분 준비·실행.
 * @param opts.isActualMode §166⑥ 본문 (계약서 구분기재)
 * @param opts.isFullFractionalBundle 완전 지분 모드 (같은 물건 지분 분할) — fixedSalePrice 주입 + 잔액 흡수
 */
export function prepareBundledApportionment(
  primary: BundledPrimaryInput,
  companions: BundledCompanionForApportion[],
  opts: { isActualMode: boolean; isFullFractionalBundle: boolean },
): {
  apportionment: BundledApportionmentResult;
  adjustedAcq: Map<string, { price: number; used: boolean }>;
} {
  const { isActualMode, isFullFractionalBundle } = opts;

  // (1) 주 자산 상속 보충적평가액 (선택)
  let primaryFixedAcq: number | undefined;
  if (primary.primaryInheritanceValuation) {
    const v = primary.primaryInheritanceValuation;
    primaryFixedAcq = calculateInheritanceAcquisitionPrice({
      inheritanceDate: new Date(v.inheritanceDate),
      assetKind: v.assetKind,
      landAreaM2: v.landAreaM2,
      reportedValue: v.publishedValueAtInheritance,
      reportedMethod: "supplementary",
    }).acquisitionPrice;
  }

  // (2) 컴패니언 자산별 취득가액 (acquisitionCause 분기)
  const companionFixedAcq: (number | undefined)[] = companions.map((c) => {
    if (c.acquisitionCause === "purchase" && c.useEstimatedAcquisition) return undefined;
    if (c.acquisitionCause === "inheritance" && c.inheritanceValuation) {
      const v = c.inheritanceValuation;
      return calculateInheritanceAcquisitionPrice({
        inheritanceDate: new Date(v.inheritanceDate),
        assetKind: v.assetKind,
        landAreaM2: v.landAreaM2,
        reportedValue: v.publishedValueAtInheritance,
        reportedMethod: "supplementary",
      }).acquisitionPrice;
    }
    return c.fixedAcquisitionPrice;
  });

  // (3) BundledAssetInput 배열 구성
  const primaryAssetKind: BundledAssetInput["assetKind"] =
    primary.propertyType === "housing"
      ? "housing"
      : primary.propertyType === "building"
        ? "building"
        : "land";
  const primaryLabel =
    primary.propertyType === "housing"
      ? "주 자산(주택)"
      : primary.propertyType === "land"
        ? "주 자산(토지)"
        : "주 자산";

  const bundleAssets: BundledAssetInput[] = [
    {
      assetId: "primary",
      assetLabel: primaryLabel,
      assetKind: primaryAssetKind,
      standardPriceAtTransfer: primary.standardPriceAtTransferForApportion ?? 0,
      directExpenses: primary.expenses,
      fixedAcquisitionPrice:
        primaryFixedAcq ??
        (primary.acquisitionPrice > 0 ? primary.acquisitionPrice : undefined),
      // actual 모드 또는 완전 지분 모드: 주 자산의 확정 양도가액 주입
      fixedSalePrice:
        isActualMode || isFullFractionalBundle ? primary.primaryActualSalePrice : undefined,
    },
    ...companions.map(
      (c, i): BundledAssetInput => ({
        assetId: c.assetId,
        assetLabel: c.assetLabel,
        assetKind: c.assetKind,
        standardPriceAtTransfer: c.standardPriceAtTransfer ?? 0,
        standardPriceAtAcquisition: c.standardPriceAtAcquisition,
        directExpenses: c.directExpenses,
        fixedAcquisitionPrice: companionFixedAcq[i],
        // actual 모드 또는 완전 지분 모드: 컴패니언의 확정 양도가액 주입
        fixedSalePrice:
          isActualMode || isFullFractionalBundle ? c.fixedSalePrice : undefined,
      }),
    ),
  ];

  // 완전 지분 모드: applyRatio(floor) 절사로 Σfixed < total일 수 있으므로
  // 마지막 자산이 잔액을 흡수해 Σfixed = totalSalePrice 불변식 보장
  // (apportionBundledSale "잔여 양도가액 있으나 안분 대상 없음" throw 회피).
  // 정수 보정(1~2원)일 뿐 안분 방식 선택이 아님 — feedback_floor_residual_absorption.
  if (isFullFractionalBundle && bundleAssets.every((a) => a.fixedSalePrice !== undefined)) {
    const last = bundleAssets.length - 1;
    const sumExceptLast = bundleAssets
      .slice(0, last)
      .reduce((s, a) => s + (a.fixedSalePrice ?? 0), 0);
    bundleAssets[last].fixedSalePrice = primary.totalSalePrice! - sumExceptLast;
  }

  // (4) 안분 실행
  const apportionment = apportionBundledSale({
    totalSalePrice: primary.totalSalePrice!,
    assets: bundleAssets,
  });

  // (4.5) 매매 estimated 컴패니언: 안분된 양도가액으로 환산취득가 사후 산정
  const adjustedAcq = new Map<string, { price: number; used: boolean }>();
  companions.forEach((c) => {
    if (
      c.acquisitionCause === "purchase" &&
      c.useEstimatedAcquisition &&
      c.standardPriceAtAcquisition &&
      c.standardPriceAtTransfer
    ) {
      const alloc = apportionment.apportioned.find((a) => a.assetId === c.assetId);
      if (!alloc) return;
      const price = calculateEstimatedAcquisitionPrice(
        alloc.allocatedSalePrice,
        c.standardPriceAtAcquisition,
        c.standardPriceAtTransfer,
      );
      adjustedAcq.set(c.assetId, { price, used: true });
    }
  });

  // usedEstimatedAcquisition 플래그 전파 (결과 표시용)
  apportionment.apportioned.forEach((a) => {
    const adj = adjustedAcq.get(a.assetId);
    if (adj?.used) a.usedEstimatedAcquisition = true;
  });

  return { apportionment, adjustedAcq };
}
