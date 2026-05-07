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
import { calculateHoldingPeriod } from "@/lib/tax-engine/tax-utils";

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

/**
 * 폼-수준 사용자 명시 일체과세 모드 → companion manualHoldingPeriodOverride enum 매핑.
 * "auto" 또는 undefined는 엔진 자동 분기 사용 (override 없음).
 */
export function resolveUserModeOverride(
  mode: "auto" | "unified_short_term_housing" | "individual" | "progressive" | undefined,
): "shortTermHousing70" | "shortTerm60" | "progressive" | undefined {
  switch (mode) {
    case "unified_short_term_housing":
      return "shortTermHousing70";
    case "individual":
      return "shortTerm60";
    case "progressive":
      return "progressive";
    default:
      return undefined;
  }
}

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
  userModeOverride?: "shortTermHousing70" | "shortTerm60" | "progressive";
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
  // 사용자 폼-수준 모드는 land 자산에만 적용. companion 자체 override 우선.
  const effectiveOverride =
    c.manualHoldingPeriodOverride ??
    (c.assetKind === "land" ? ctx.userModeOverride : undefined);

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
): CompanionSplitResult {
  if (
    primary.acquisitionCause !== "newConstruction" ||
    companion.assetKind !== "land" ||
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
    if (r.type === "self_farming") {
      return {
        ...r,
        incorporationDate: r.incorporationDate ? new Date(r.incorporationDate) : undefined,
      } as TransferReduction;
    }
    return r as TransferReduction;
  });
}
