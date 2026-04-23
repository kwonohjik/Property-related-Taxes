/**
 * 계산기 StepWizard 전역 상태
 * zustand + sessionStorage persist — 새로고침 시 입력 데이터 유지
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import type { TransferAPIResult } from "@/lib/calc/transfer-tax-api";

/** 비사업용 토지 사업용 사용기간 항목 (폼 문자열 버전) */
export interface NblBusinessUsePeriod {
  startDate: string;
  endDate: string;
  usageType: string;
}

/** 다른 보유 주택 항목 (폼 문자열 버전) */
export interface HouseEntry {
  id: string;
  region: "capital" | "non_capital";
  acquisitionDate: string;
  officialPrice: string;
  isInherited: boolean;
  isLongTermRental: boolean;
  isApartment: boolean;
  isOfficetel: boolean;
  isUnsoldHousing: boolean;
}

// ─── 자산별 감면 폼 타입 ──────────────────────────────────────────
// Zod reductionSchema(lib/api/transfer-tax-schema.ts)와 1:1 대응.
// 숫자 입력 필드는 string 타입(빈 문자열 = 미입력).

export type AssetReductionForm =
  | {
      type: "self_farming";
      /** 본인 자경기간(년) */
      farmingYears: string;
      /** 피상속인 자경기간(년) — 상속 취득 + 본인 미달 시 합산 (조특령 §66⑪) */
      decedentFarmingYears?: string;
      /** 주거·상업·공업지역 편입 부분감면 적용 여부 (조특령 §66⑤⑥) */
      useSelfFarmingIncorporation?: boolean;
      /** 편입일 (YYYY-MM-DD) */
      selfFarmingIncorporationDate?: string;
      /** 편입 지역 유형 */
      selfFarmingIncorporationZone?: "residential" | "commercial" | "industrial" | "";
      /** 편입일 당시 기준시가 (원) */
      selfFarmingStandardPriceAtIncorporation?: string;
    }
  | {
      type: "long_term_rental";
      /** 임대기간(년) */
      rentalYears: string;
      /** 임대료 인상률(%) — 5% 이하 요건 */
      rentIncreaseRate: string;
    }
  | {
      type: "new_housing";
      /** 소재지 유형 — 감면율 결정 */
      reductionRegion: "metropolitan" | "non_metropolitan" | "outside_overconcentration";
    }
  | {
      type: "unsold_housing";
      /** 소재지 유형 */
      reductionRegion: "metropolitan" | "non_metropolitan" | "outside_overconcentration";
    }
  | {
      type: "public_expropriation";
      /** 현금 보상액 (원) */
      expropriationCash: string;
      /** 채권 보상액 (원) */
      expropriationBond: string;
      /** 채권 만기보유 특약 */
      expropriationBondHoldingYears: "none" | "3" | "5";
      /** 사업인정고시일 (YYYY-MM-DD) */
      expropriationApprovalDate: string;
    };

export type ReductionType = AssetReductionForm["type"];

/** 인별 5년 합산 한도 산정용 과거 감면 이력 항목 */
export interface PriorReductionUsageItem {
  year: number;
  type: ReductionType;
  amount: number;
}

/**
 * 자산 1건의 폼 상태 (문자열 기반).
 * 주된 자산과 동반 자산을 구분하지 않고 동일한 구조로 관리.
 * assets[0]이 대표 자산 (isPrimaryForHouseholdFlags = true).
 */
export interface AssetForm {
  assetId: string;
  assetLabel: string;
  /**
   * 자산 종류 — 5종 (API 전달 시 right_to_move_in/presale_right → housing 으로 변환)
   */
  assetKind: "housing" | "land" | "building" | "right_to_move_in" | "presale_right";
  /** 입주권 승계조합원 여부 (assetKind === "right_to_move_in" 일 때만 의미) */
  isSuccessorRightToMoveIn: boolean;
  /** 세대 Step(Step3/4)의 1세대1주택 비과세·다주택 중과 판정 기준 대표 자산 여부 */
  isPrimaryForHouseholdFlags: boolean;
  /** 양도시점 기준시가 (안분 키, 문자열) */
  standardPriceAtTransfer: string;
  /** 양도시 기준시가 레이블 (API 조회 결과 표시용) */
  standardPriceAtTransferLabel: string;
  /** 직접 귀속 필요경비 */
  directExpenses: string;

  // ── 자산별 감면 (복수 선택 허용, 조특법 §127②) ──
  /** 이 자산에 적용할 감면 목록. 복수 체크 가능, 엔진이 §127② 규칙 적용. */
  reductions: AssetReductionForm[];

  /** 상속 취득가액 산정 모드: auto=보충적평가, manual=직접입력 */
  inheritanceValuationMode: "auto" | "manual";
  /** 상속개시일 (YYYY-MM-DD) */
  inheritanceDate: string;
  /** 자산 종류 (토지/단독주택/공동주택 — 보충적평가용) */
  inheritanceAssetKind: "land" | "house_individual" | "house_apart";
  /** 토지 면적 (㎡, land일 때 사용) */
  landAreaM2: string;
  /** 상속개시일 직전 공시가격: 토지=원/㎡, 주택=원 총액 */
  publishedValueAtInheritance: string;
  /** 직접 입력 취득가액 (매매 actual / 상속 manual / 증여 신고가액) */
  fixedAcquisitionPrice: string;

  // ── 자산별 소재지 (Step1 자산 편집 Sheet에서 입력) ──
  /** 주소 (Vworld 도로명) */
  addressRoad: string;
  /** 주소 (Vworld 지번) */
  addressJibun: string;
  /** 상세주소 */
  addressDetail: string;
  /** 건물명 */
  buildingName: string;
  /** 경도 */
  longitude: string;
  /** 위도 */
  latitude: string;

  // ── 조정대상지역 조회 결과 (주택 전용) ──
  /** 취득 시점 조정대상지역 여부 (주택만 조회, 비주택은 null) */
  isRegulatedAreaAtAcq: boolean | null;
  /** 양도 시점 조정대상지역 여부 (주택만 조회, 비주택은 null) */
  isRegulatedAreaAtTransfer: boolean | null;

  // ── 취득시기 상이 필지 분리 (assetKind === "land" 전용) ──
  /** 토지 내 취득시기 상이 필지 분리 계산 여부 (소득세법 시행령 §162①6호) */
  parcelMode: boolean;
  /** 취득시기 상이 필지 목록 */
  parcels: ParcelFormItem[];

  isOneHousehold: boolean;
  /** actual 모드 시 이 자산의 계약서상 양도가액 */
  actualSalePrice: string;
  /** 취득 원인 — purchase=매매, inheritance=상속, gift=증여 */
  acquisitionCause: "purchase" | "inheritance" | "gift";
  /** 본인 취득일 (YYYY-MM-DD) */
  acquisitionDate: string;
  /** 피상속인 취득일 (상속 시 단기보유 통산용, YYYY-MM-DD) */
  decedentAcquisitionDate: string;
  /** 증여자 취득일 (YYYY-MM-DD) */
  donorAcquisitionDate: string;
  /** 매매 환산취득가 사용 여부 */
  useEstimatedAcquisition: boolean;
  /** 매매 estimated 시 취득시점 기준시가 (원, 환산 분자) */
  standardPriceAtAcq: string;
  /** 취득시 기준시가 레이블 (API 조회 결과 표시용) */
  standardPriceAtAcqLabel: string;

  // ── 1990.8.30. 이전 취득 토지 환산 (assetKind === "land" + acquisitionDate < 1990-08-30) ──
  pre1990Enabled: boolean;
  pre1990AreaSqm: string;
  pre1990PricePerSqm_1990: string;
  pre1990PricePerSqm_atTransfer: string;
  pre1990Grade_current: string;
  pre1990Grade_prev: string;
  pre1990Grade_atAcq: string;
  pre1990GradeMode: "number" | "value";
}

/** 하위 호환 별칭 — 기존 코드에서 CompanionAssetForm을 참조하는 곳에 사용 */
export type CompanionAssetForm = AssetForm;

/**
 * AssetForm 기본값 팩토리.
 * index === 1 인 경우 isPrimaryForHouseholdFlags = true 로 설정.
 */
export function makeDefaultAsset(index: number = 1): AssetForm {
  return {
    assetId: `asset-${Date.now()}-${index}`,
    assetLabel: `자산 ${index}`,
    assetKind: "housing",
    isSuccessorRightToMoveIn: false,
    isPrimaryForHouseholdFlags: index === 1,
    standardPriceAtTransfer: "",
    standardPriceAtTransferLabel: "",
    directExpenses: "0",
    reductions: [],
    inheritanceValuationMode: "auto",
    inheritanceDate: "",
    inheritanceAssetKind: "land",
    landAreaM2: "",
    publishedValueAtInheritance: "",
    fixedAcquisitionPrice: "",
    addressRoad: "",
    addressJibun: "",
    addressDetail: "",
    buildingName: "",
    longitude: "",
    latitude: "",
    isRegulatedAreaAtAcq: null,
    isRegulatedAreaAtTransfer: null,
    parcelMode: false,
    parcels: [],
    isOneHousehold: false,
    actualSalePrice: "",
    acquisitionCause: "purchase",
    acquisitionDate: "",
    decedentAcquisitionDate: "",
    donorAcquisitionDate: "",
    useEstimatedAcquisition: false,
    standardPriceAtAcq: "",
    standardPriceAtAcqLabel: "",
    pre1990Enabled: false,
    pre1990AreaSqm: "",
    pre1990PricePerSqm_1990: "",
    pre1990PricePerSqm_atTransfer: "",
    pre1990Grade_current: "",
    pre1990Grade_prev: "",
    pre1990Grade_atAcq: "",
    pre1990GradeMode: "number",
  };
}

/** 하위 호환 별칭 */
export const makeDefaultCompanionAsset = makeDefaultAsset;

/** 다필지 UI 폼 상태 (문자열 기반) */
export interface ParcelFormItem {
  id: string;
  acquisitionDate: string;
  acquisitionMethod: "actual" | "estimated";
  acquisitionPrice: string;
  acquisitionArea: string;
  transferArea: string;
  standardPricePerSqmAtAcq: string;
  standardPricePerSqmAtTransfer: string;
  expenses: string;
  useDayAfterReplotting: boolean;
  replottingConfirmDate: string;
  useExchangeLandReduction: boolean;
  entitlementArea: string;
  allocatedArea: string;
  priorLandArea: string;
}

export interface TransferFormData {
  // ── Step 1: 자산 목록 + 양도 기본 정보 ──
  /** 모든 양도 자산 (최소 1건). assets[0]이 대표 자산. */
  assets: AssetForm[];
  /** 계약서 단위 총 양도가액 (모든 자산 합계) */
  contractTotalPrice: string;
  /**
   * 일괄양도 양도가액 결정 모드 (계약서 단위 단일 결정).
   * - "actual": 계약서에 자산별 가액이 구분 기재된 경우 (§166⑥ 본문)
   * - "apportioned": 구분 불분명 → 기준시가 비율 안분 (§166⑥ 단서)
   */
  bundledSaleMode: "actual" | "apportioned";
  /** 양도일 (YYYY-MM-DD) */
  transferDate: string;
  /** 양도소득세 신고일 (YYYY-MM-DD) */
  filingDate: string;

  // ── Step 2 (구 Step3 잔여): 대표 자산 고급 취득 정보 ──
  /** 대표 자산 취득가 산정 방식 (3지선다 — assets[0].useEstimatedAcquisition 과 동기화) */
  acquisitionMethod: "actual" | "estimated" | "appraisal";
  appraisalValue: string;
  isSelfBuilt: boolean;
  buildingType: "new" | "extension" | "";
  constructionDate: string;
  extensionFloorArea: string;
  pre1990Enabled: boolean;
  pre1990AreaSqm: string;
  pre1990PricePerSqm_1990: string;
  pre1990PricePerSqm_atTransfer: string;
  pre1990Grade_current: string;
  pre1990Grade_prev: string;
  pre1990Grade_atAcq: string;
  pre1990GradeMode: "number" | "value";

  // ── Step 3 (구 Step4): 보유 상황 (세대·납세자 단위) ──
  isOneHousehold: boolean;
  householdHousingCount: string;
  residencePeriodMonths: string;
  isRegulatedArea: boolean;
  wasRegulatedAtAcquisition: boolean;
  isUnregistered: boolean;
  isNonBusinessLand: boolean;
  temporaryTwoHouseSpecial: boolean;
  previousHouseAcquisitionDate: string;
  newHouseAcquisitionDate: string;
  marriageDate: string;
  parentalCareMergeDate: string;
  nblLandType: string;
  nblLandArea: string;
  nblZoneType: string;
  nblFarmingSelf: boolean;
  nblFarmerResidenceDistance: string;
  nblBusinessUsePeriods: NblBusinessUsePeriod[];
  houses: HouseEntry[];
  sellingHouseRegion: "capital" | "non_capital";

  // ── Step 4 (구 Step5): 감면·공제 ──
  /** 당해 연도 기사용 기본공제 (사람 단위, 연간 한도 250만원) */
  annualBasicDeductionUsed: string;
  /**
   * 인별 5년 합산 한도 산정용 과거 감면 이력 (조특법 §133).
   * 최근 4개 과세연도 사용분을 입력.
   */
  priorReductionUsage: PriorReductionUsageItem[];

  // ── Step 5 (가산세) ──
  enablePenalty: boolean;
  filingType: "none" | "under" | "excess_refund" | "correct";
  penaltyReason: "normal" | "fraudulent" | "offshore_fraud";
  priorPaidTax: string;
  originalFiledTax: string;
  excessRefundAmount: string;
  interestSurcharge: string;
  unpaidTax: string;
  paymentDeadline: string;
  actualPaymentDate: string;
}

const defaultFormData: TransferFormData = {
  assets: [makeDefaultAsset(1)],
  contractTotalPrice: "",
  bundledSaleMode: "apportioned",
  transferDate: "",
  filingDate: "",
  acquisitionMethod: "actual",
  appraisalValue: "",
  isSelfBuilt: false,
  buildingType: "",
  constructionDate: "",
  extensionFloorArea: "",
  pre1990Enabled: false,
  pre1990AreaSqm: "",
  pre1990PricePerSqm_1990: "",
  pre1990PricePerSqm_atTransfer: "",
  pre1990Grade_current: "",
  pre1990Grade_prev: "",
  pre1990Grade_atAcq: "",
  pre1990GradeMode: "number",
  isOneHousehold: true,
  householdHousingCount: "1",
  residencePeriodMonths: "0",
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  temporaryTwoHouseSpecial: false,
  previousHouseAcquisitionDate: "",
  newHouseAcquisitionDate: "",
  marriageDate: "",
  parentalCareMergeDate: "",
  nblLandType: "",
  nblLandArea: "",
  nblZoneType: "",
  nblFarmingSelf: false,
  nblFarmerResidenceDistance: "",
  nblBusinessUsePeriods: [],
  houses: [],
  sellingHouseRegion: "capital",
  annualBasicDeductionUsed: "0",
  priorReductionUsage: [],
  enablePenalty: false,
  filingType: "correct",
  penaltyReason: "normal",
  priorPaidTax: "0",
  originalFiledTax: "0",
  excessRefundAmount: "0",
  interestSurcharge: "0",
  unpaidTax: "0",
  paymentDeadline: "",
  actualPaymentDate: "",
};

/** 세션스토리지에 저장된 구 포맷(propertyType + companionAssets / 루트 감면 필드)을 신규 assets[] 포맷으로 변환 */
function migrateLegacyForm(legacy: Record<string, unknown>): TransferFormData {
  const primaryAsset = makeDefaultAsset(1);
  primaryAsset.assetKind =
    (legacy.propertyType as AssetForm["assetKind"]) ?? "housing";
  primaryAsset.isSuccessorRightToMoveIn = Boolean(legacy.isSuccessorRightToMoveIn);
  primaryAsset.isPrimaryForHouseholdFlags = true;
  primaryAsset.standardPriceAtTransfer = String(legacy.standardPriceAtTransfer ?? "");
  primaryAsset.standardPriceAtTransferLabel = String(legacy.standardPriceAtTransferLabel ?? "");
  primaryAsset.directExpenses = String(legacy.expenses ?? "0");
  primaryAsset.inheritanceValuationMode =
    (legacy.inheritanceValuationMode as "auto" | "manual") ?? "auto";
  primaryAsset.inheritanceDate = String(legacy.acquisitionDate ?? "");
  primaryAsset.publishedValueAtInheritance = String(
    legacy.inheritanceLandPricePerM2 || legacy.inheritanceHousePrice || ""
  );
  primaryAsset.fixedAcquisitionPrice = String(legacy.acquisitionPrice ?? "");

  // 구 주소 필드 → 자산별 주소로 이관
  primaryAsset.addressRoad = String(legacy.propertyAddressRoad ?? "");
  primaryAsset.addressJibun = String(legacy.propertyAddressJibun ?? "");
  primaryAsset.addressDetail = String(legacy.propertyAddressDetail ?? "");
  primaryAsset.buildingName = String(legacy.propertyBuildingName ?? "");
  primaryAsset.longitude = String(legacy.propertyLongitude ?? "");
  primaryAsset.latitude = String(legacy.propertyLatitude ?? "");

  primaryAsset.isOneHousehold = Boolean(legacy.isOneHousehold ?? true);
  primaryAsset.actualSalePrice = "";
  primaryAsset.acquisitionCause =
    (legacy.acquisitionCause as "purchase" | "inheritance" | "gift") ?? "purchase";
  primaryAsset.acquisitionDate = String(legacy.acquisitionDate ?? "");
  primaryAsset.decedentAcquisitionDate = String(legacy.decedentAcquisitionDate ?? "");
  primaryAsset.donorAcquisitionDate = String(legacy.donorAcquisitionDate ?? "");
  primaryAsset.useEstimatedAcquisition = Boolean(legacy.useEstimatedAcquisition);
  primaryAsset.standardPriceAtAcq = String(legacy.standardPriceAtAcquisition ?? "");
  primaryAsset.standardPriceAtAcqLabel = String(legacy.standardPriceAtAcquisitionLabel ?? "");

  // 구 다필지 필드 → 자산별 parcelMode/parcels 로 이관
  if (legacy.parcelMode) {
    primaryAsset.parcelMode = Boolean(legacy.parcelMode);
    primaryAsset.parcels = (legacy.parcels as ParcelFormItem[]) ?? [];
  }

  // 구 루트 감면 필드 → primaryAsset.reductions 배열로 이관
  const legacyReductionType = legacy.reductionType as string | undefined;
  if (legacyReductionType && legacyReductionType !== "") {
    if (legacyReductionType === "self_farming") {
      primaryAsset.reductions = [{
        type: "self_farming",
        farmingYears: String(legacy.farmingYears ?? "0"),
        decedentFarmingYears: String(legacy.decedentFarmingYears ?? "0"),
        useSelfFarmingIncorporation: Boolean(legacy.useSelfFarmingIncorporation),
        selfFarmingIncorporationDate: String(legacy.selfFarmingIncorporationDate ?? ""),
        selfFarmingIncorporationZone: (legacy.selfFarmingIncorporationZone as "residential" | "commercial" | "industrial" | "") ?? "",
        selfFarmingStandardPriceAtIncorporation: String(legacy.selfFarmingStandardPriceAtIncorporation ?? ""),
      }];
    } else if (legacyReductionType === "long_term_rental") {
      primaryAsset.reductions = [{
        type: "long_term_rental",
        rentalYears: String(legacy.rentalYears ?? "0"),
        rentIncreaseRate: String(legacy.rentIncreaseRate ?? "0"),
      }];
    } else if (legacyReductionType === "new_housing") {
      primaryAsset.reductions = [{
        type: "new_housing",
        reductionRegion: (legacy.reductionRegion as "metropolitan" | "non_metropolitan" | "outside_overconcentration") ?? "metropolitan",
      }];
    } else if (legacyReductionType === "unsold_housing") {
      primaryAsset.reductions = [{
        type: "unsold_housing",
        reductionRegion: (legacy.reductionRegion as "metropolitan" | "non_metropolitan" | "outside_overconcentration") ?? "metropolitan",
      }];
    } else if (legacyReductionType === "public_expropriation") {
      primaryAsset.reductions = [{
        type: "public_expropriation",
        expropriationCash: String(legacy.expropriationCash ?? ""),
        expropriationBond: String(legacy.expropriationBond ?? ""),
        expropriationBondHoldingYears: (legacy.expropriationBondHoldingYears as "none" | "3" | "5") ?? "none",
        expropriationApprovalDate: String(legacy.expropriationApprovalDate ?? ""),
      }];
    }
  }

  const companions: AssetForm[] = (
    (legacy.companionAssets as Array<Record<string, unknown>>) ?? []
  ).map((ca, i) => {
    const base = ca as unknown as AssetForm;
    // 구 companion의 reductionType: "" | "self_farming" → reductions 배열로 변환
    const legacyCaReductionType = (ca.reductionType as string | undefined) ?? "";
    const caReductions: AssetReductionForm[] = [];
    if (legacyCaReductionType === "self_farming") {
      caReductions.push({
        type: "self_farming",
        farmingYears: String(ca.farmingYears ?? "0"),
      });
    }
    return {
      ...base,
      assetLabel: (base.assetLabel ?? `동반자산 ${i + 1}`)
        .replace(/^동반자산/, "자산"),
      isSuccessorRightToMoveIn: false,
      isPrimaryForHouseholdFlags: false,
      standardPriceAtAcqLabel: String(ca.standardPriceAtAcqLabel ?? ""),
      standardPriceAtTransferLabel: String(ca.standardPriceAtTransferLabel ?? ""),
      addressDetail: String(ca.addressDetail ?? ""),
      buildingName: String(ca.buildingName ?? ""),
      longitude: String(ca.longitude ?? ""),
      latitude: String(ca.latitude ?? ""),
      isRegulatedAreaAtAcq: null,
      isRegulatedAreaAtTransfer: null,
      parcelMode: Boolean(ca.parcelMode ?? false),
      parcels: (ca.parcels as ParcelFormItem[]) ?? [],
      reductions: caReductions,
    };
  });

  const {
    propertyType: _pt,
    isSuccessorRightToMoveIn: _isr,
    transferPrice,
    acquisitionCause: _ac,
    acquisitionDate: _ad,
    decedentAcquisitionDate: _dad,
    donorAcquisitionDate: _doad,
    acquisitionPrice: _ap,
    expenses: _exp,
    useEstimatedAcquisition: _uea,
    standardPriceAtAcquisition: _spa,
    standardPriceAtTransfer: _spt,
    standardPriceAtAcquisitionLabel: _spaal,
    standardPriceAtTransferLabel: _spttl,
    inheritanceValuationMode: _ivm,
    inheritanceLandPricePerM2: _ilpp,
    inheritanceHousePrice: _ihp,
    companionAssets: _ca,
    primaryActualSalePrice: _pasp,
    // 구 주소 필드 제거
    propertyAddressRoad: _par,
    propertyAddressJibun: _paj,
    propertyBuildingName: _pbn,
    propertyAddressDetail: _pad,
    propertyLongitude: _plon,
    propertyLatitude: _plat,
    // 구 다필지 필드 제거
    parcelMode: _pm,
    parcels: _parcels,
    // 구 감면 필드 제거
    reductionType: _rt,
    farmingYears: _fy,
    useSelfFarmingIncorporation: _usfi,
    selfFarmingIncorporationDate: _sfid,
    selfFarmingIncorporationZone: _sfiz,
    selfFarmingStandardPriceAtIncorporation: _sfspa,
    decedentFarmingYears: _dfy,
    rentalYears: _ry,
    rentIncreaseRate: _rir,
    reductionRegion: _rr,
    expropriationCash: _ec,
    expropriationBond: _eb,
    expropriationBondHoldingYears: _ebhy,
    expropriationApprovalDate: _ead,
    ...rest
  } = legacy as Record<string, unknown>;

  return {
    ...defaultFormData,
    ...(rest as Partial<TransferFormData>),
    contractTotalPrice: String(transferPrice ?? ""),
    assets: [primaryAsset, ...companions],
  };
}

/** defaultFormData를 복사하여 반환하는 팩토리 (MultiTransferTaxCalculator 등 외부에서 사용) */
export function createDefaultTransferFormData(): TransferFormData {
  return {
    ...defaultFormData,
    assets: [makeDefaultAsset(1)],
  };
}

interface CalcWizardState {
  currentStep: number;
  formData: TransferFormData;
  result: TransferAPIResult | null;
  pendingMigration: boolean;
  setStep: (step: number) => void;
  updateFormData: (data: Partial<TransferFormData>) => void;
  setResult: (result: TransferAPIResult) => void;
  clearPendingMigration: () => void;
  reset: () => void;
}

export const useCalcWizardStore = create<CalcWizardState>()(
  persist(
    (set) => ({
      currentStep: 0,
      formData: defaultFormData,
      result: null,
      pendingMigration: false,
      setStep: (step) => set({ currentStep: step }),
      updateFormData: (data) =>
        set((state) => ({ formData: { ...state.formData, ...data } })),
      setResult: (result) => set({ result, pendingMigration: true }),
      clearPendingMigration: () => set({ pendingMigration: false }),
      reset: () => {
        if (typeof window !== "undefined") {
          sessionStorage.removeItem("transfer-tax-wizard");
        }
        set({ currentStep: 0, formData: defaultFormData, result: null, pendingMigration: false });
      },
    }),
    {
      name: "transfer-tax-wizard",
      storage: createJSONStorage(() => {
        if (typeof window !== "undefined") return sessionStorage;
        return {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
        };
      }),
      partialize: (state) => ({
        currentStep: state.currentStep,
        formData: state.formData,
        pendingMigration: state.pendingMigration,
      }),
      merge: (persisted, current) => {
        const ps = persisted as Partial<CalcWizardState>;
        const legacyForm = ps.formData as Record<string, unknown> | undefined;

        let formData: TransferFormData;
        if (
          legacyForm &&
          (
            "propertyType" in legacyForm ||
            "companionAssets" in legacyForm ||
            "propertyAddressRoad" in legacyForm ||
            "reductionType" in legacyForm ||
            "parcelMode" in legacyForm
          )
        ) {
          formData = migrateLegacyForm(legacyForm);
        } else {
          formData = {
            ...defaultFormData,
            ...(ps.formData ?? {}),
          };
        }

        return { ...current, ...ps, formData };
      },
    },
  ),
);
