/**
 * 계산기 StepWizard 전역 상태
 * zustand + sessionStorage persist — 새로고침 시 입력 데이터 유지
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import type { TransferAPIResult } from "@/lib/calc/transfer-tax-api";
import { migrateLegacyForm } from "./calc-wizard-migration";

function parseRaw(v: string | undefined): number {
  return parseInt((v ?? "").replace(/[^0-9]/g, "") || "0", 10);
}

/** 비사업용 토지 사업용 사용기간 항목 (폼 문자열 버전) */
export interface NblBusinessUsePeriod {
  startDate: string;
  endDate: string;
  usageType: string;
}

/** 소유자 거주 이력 1건 (NBL 재촌 판정용) */
export interface ResidenceHistoryInput {
  sigunguCode: string;
  sigunguName: string;
  startDate: string;
  endDate: string;
  /** 주민등록 여부 — 임야 재촌 필수 요건 */
  hasResidentRegistration: boolean;
}

/** 부득이한 사유 유예기간 1건 (§168-14①) */
export interface GracePeriodInput {
  type:
    | "inheritance"
    | "legal_restriction"
    | "sale_contract"
    | "construction"
    | "unavoidable"
    | "preparation"
    | "land_replotting";
  startDate: string;
  endDate: string;
  description: string;
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
  /** 취득 당시 면적 (㎡) — 취득 기준시가 산정, Pre1990 환산 */
  acquisitionArea: string;
  /** 양도 당시 면적 (㎡) — 양도 기준시가 산정 */
  transferArea: string;
  /**
   * 면적 입력 시나리오 (UI 전용, API 전송 시 제외)
   * - "same"      : 취득면적 = 양도면적 (일반, 기본값)
   * - "partial"   : 일부 양도 — 취득 토지 중 일부만 양도
   * - "reduction" : 환지처분 (감환지) — 교부면적 < 권리면적 (소득령 §162의2)
   * - "increase"  : 환지처분 (증환지) — 교부면적 > 권리면적 (증가분은 별도 취득 분리)
   * UI에서 의제취득면적을 acquisitionArea에, 환지확정일 익일을 acquisitionDate에 사전 반영.
   */
  areaScenario: "same" | "partial" | "reduction" | "increase";
  /** 환지처분확정일 (areaScenario=reduction/increase 시, YYYY-MM-DD) */
  replottingConfirmDate: string;
  /** 환지 권리면적 (㎡, areaScenario=reduction 시) */
  entitlementArea: string;
  /** 환지 교부면적 (㎡, areaScenario=reduction 시) */
  allocatedArea: string;
  /** 환지 이전 종전면적 (㎡, areaScenario=reduction 시, 의제취득면적 산식에 사용) */
  priorLandArea: string;
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
  /** 매매 감정가액 사용 여부 (소득세법 §97 + 시행령 §163⑥). useEstimatedAcquisition과 상호 배타.
   *  true 시 fixedAcquisitionPrice를 감정가액으로 해석, 개산공제 자동 적용. */
  isAppraisalAcquisition: boolean;
  /** 본인이 신축·증축한 건물 여부 (§114조의2 가산세). acquisitionCause === "purchase" + 매매·housing/building 전용 */
  isSelfBuilt: boolean;
  /** 신축·증축 구분 */
  buildingType: "new" | "extension" | "";
  /** 신축·증축 완공일 (YYYY-MM-DD) */
  constructionDate: string;
  /** 증축 시 증축 부분 바닥면적 (㎡) — buildingType === "extension" 필수 */
  extensionFloorArea: string;
  /** 매매 estimated 시 취득시점 기준시가 (원, 환산 분자) */
  standardPriceAtAcq: string;
  /** 취득시 기준시가 레이블 (API 조회 결과 표시용) */
  standardPriceAtAcqLabel: string;

  /** 취득 시점 ㎡당 공시지가 (원/㎡, 토지·비주거건물 전용) */
  standardPricePerSqmAtAcq: string;
  /** 양도 시점 ㎡당 공시지가 (원/㎡, 토지·비주거건물 전용) */
  standardPricePerSqmAtTransfer: string;

  // ── 1990.8.30. 이전 취득 토지 환산 (assetKind === "land" + acquisitionDate < 1990-08-30) ──
  pre1990Enabled: boolean;
  pre1990PricePerSqm_1990: string;
  pre1990PricePerSqm_atTransfer: string;
  pre1990Grade_current: string;
  pre1990Grade_prev: string;
  pre1990Grade_atAcq: string;
  pre1990GradeMode: "number" | "value";

  // ── 비사업용 토지 정밀 판정 (assetKind === "land" 전용) ──
  /** 단순 체크박스 경로 — 상세 판정 없이 플래그만 전달 */
  isNonBusinessLand: boolean;
  /** true 시 엔진 자동 판정, isNonBusinessLand 체크박스 무시 */
  nblUseDetailedJudgment: boolean;

  // ── NBL 공통 ──
  /** 지목 (nblLandArea는 acquisitionArea 재사용 — area-taxonomy.md 원칙 B) */
  nblLandType: "" | "farmland" | "forest" | "pasture" | "housing_site" | "villa_land" | "other_land";
  nblZoneType: string;
  nblBusinessUsePeriods: NblBusinessUsePeriod[];

  // ── NBL 위치·거주 ──
  nblLandSigunguCode: string;
  nblLandSigunguName: string;
  nblResidenceHistories: ResidenceHistoryInput[];

  // ── NBL 무조건 면제 §168-14③ ──
  nblExemptInheritBefore2007: boolean;
  nblExemptInheritDate: string;
  nblExemptLongOwned20y: boolean;
  nblExemptAncestor8YearFarming: boolean;
  nblExemptPublicExpropriation: boolean;
  nblExemptPublicNoticeDate: string;
  nblExemptFactoryAdjacent: boolean;
  nblExemptJongjoongOwned: boolean;
  nblExemptJongjoongAcqDate: string;
  nblExemptUrbanFarmlandJongjoong: boolean;

  // ── NBL 도시편입·수도권·공동상속 ──
  nblUrbanIncorporationDate: string;
  nblIsMetropolitanArea: "" | "yes" | "no" | "unknown";
  nblOwnershipRatio: string;

  // ── NBL 농지 세부 ──
  nblFarmingSelf: boolean;
  nblFarmerResidenceDistance: string;
  nblFarmlandIsWeekendFarm: boolean;
  nblFarmlandIsConversionApproved: boolean;
  nblFarmlandConversionDate: string;
  nblFarmlandIsMarginalFarm: boolean;
  nblFarmlandIsReclaimedLand: boolean;
  nblFarmlandIsPublicProjectUse: boolean;
  nblFarmlandIsSickElderlyRental: boolean;

  // ── NBL 임야 세부 ──
  nblForestHasPlan: boolean;
  nblForestIsPublicInterest: boolean;
  nblForestIsProtected: boolean;
  nblForestIsSuccessor: boolean;
  nblForestInheritedWithin3Years: boolean;
  nblForestInheritanceDate: string;         // 상속일 (YYYY-MM-DD) — forest.ts forestInheritanceDate

  // ── NBL 목장 세부 ──
  nblPastureIsLivestockOperator: boolean;
  nblPastureLivestockType: string;
  nblPastureLivestockCount: string;
  nblPastureLivestockPeriods: NblBusinessUsePeriod[];
  nblPastureInheritanceDate: string;
  nblPastureIsSpecialOrgUse: boolean;

  // ── NBL 주택·별장·나대지 세부 ──
  nblHousingFootprint: string;
  nblVillaUsePeriods: NblBusinessUsePeriod[];
  nblVillaIsEupMyeon: boolean;
  nblVillaIsRuralHousing: boolean;
  nblVillaIsAfter20150101: boolean;
  nblOtherPropertyTaxType: "" | "exempt" | "comprehensive" | "separate" | "special_sum";
  nblOtherBuildingValue: string;
  nblOtherLandValue: string;
  nblOtherIsRelatedToResidence: boolean;

  // ── NBL 부득이한 사유 ──
  nblGracePeriods: GracePeriodInput[];
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
    acquisitionArea: "",
    transferArea: "",
    areaScenario: "same",
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
    isAppraisalAcquisition: false,
    isSelfBuilt: false,
    buildingType: "",
    constructionDate: "",
    extensionFloorArea: "",
    standardPriceAtAcq: "",
    standardPriceAtAcqLabel: "",
    standardPricePerSqmAtAcq: "",
    standardPricePerSqmAtTransfer: "",
    pre1990Enabled: false,
    pre1990PricePerSqm_1990: "",
    pre1990PricePerSqm_atTransfer: "",
    pre1990Grade_current: "",
    pre1990Grade_prev: "",
    pre1990Grade_atAcq: "",
    pre1990GradeMode: "number",
    replottingConfirmDate: "",
    entitlementArea: "",
    allocatedArea: "",
    priorLandArea: "",
    // ── 비사업용 토지 정밀 판정 ──
    isNonBusinessLand: false,
    nblUseDetailedJudgment: false,
    nblLandType: "",
    nblZoneType: "",
    nblBusinessUsePeriods: [],
    nblLandSigunguCode: "",
    nblLandSigunguName: "",
    nblResidenceHistories: [],
    nblExemptInheritBefore2007: false,
    nblExemptInheritDate: "",
    nblExemptLongOwned20y: false,
    nblExemptAncestor8YearFarming: false,
    nblExemptPublicExpropriation: false,
    nblExemptPublicNoticeDate: "",
    nblExemptFactoryAdjacent: false,
    nblExemptJongjoongOwned: false,
    nblExemptJongjoongAcqDate: "",
    nblExemptUrbanFarmlandJongjoong: false,
    nblUrbanIncorporationDate: "",
    nblIsMetropolitanArea: "",
    nblOwnershipRatio: "",
    nblFarmingSelf: false,
    nblFarmerResidenceDistance: "",
    nblFarmlandIsWeekendFarm: false,
    nblFarmlandIsConversionApproved: false,
    nblFarmlandConversionDate: "",
    nblFarmlandIsMarginalFarm: false,
    nblFarmlandIsReclaimedLand: false,
    nblFarmlandIsPublicProjectUse: false,
    nblFarmlandIsSickElderlyRental: false,
    nblForestHasPlan: false,
    nblForestIsPublicInterest: false,
    nblForestIsProtected: false,
    nblForestIsSuccessor: false,
    nblForestInheritedWithin3Years: false,
    nblForestInheritanceDate: "",
    nblPastureIsLivestockOperator: false,
    nblPastureLivestockType: "",
    nblPastureLivestockCount: "",
    nblPastureLivestockPeriods: [],
    nblPastureInheritanceDate: "",
    nblPastureIsSpecialOrgUse: false,
    nblHousingFootprint: "",
    nblVillaUsePeriods: [],
    nblVillaIsEupMyeon: false,
    nblVillaIsRuralHousing: false,
    nblVillaIsAfter20150101: false,
    nblOtherPropertyTaxType: "",
    nblOtherBuildingValue: "",
    nblOtherLandValue: "",
    nblOtherIsRelatedToResidence: false,
    nblGracePeriods: [],
  };
}

/** 하위 호환 별칭 */
export const makeDefaultCompanionAsset = makeDefaultAsset;

/**
 * 구형 AssetForm (landAreaM2, pre1990AreaSqm 있음) → 현재 타입으로 마이그레이션.
 * sessionStorage 또는 이력 데이터 rehydrate 시 호출.
 */
export function migrateAsset(raw: unknown): AssetForm {
  const a = raw as Record<string, unknown>;
  // landAreaM2 → acquisitionArea / transferArea (비어있을 때만 복사)
  if (a.landAreaM2 && !a.acquisitionArea) {
    a.acquisitionArea = a.landAreaM2;
    a.transferArea = a.landAreaM2;
  }
  delete a.landAreaM2;
  // pre1990AreaSqm 제거 (Pre1990LandValuationInput이 acquisitionArea를 직접 받음)
  delete a.pre1990AreaSqm;
  // areaScenario 추론
  if (!a.areaScenario) {
    a.areaScenario =
      a.acquisitionArea && a.transferArea && a.acquisitionArea !== a.transferArea
        ? "partial"
        : "same";
  }
  // standardPricePerSqm 신규 필드 마이그레이션
  if (!a.standardPricePerSqmAtAcq) a.standardPricePerSqmAtAcq = "";
  if (!a.standardPricePerSqmAtTransfer) a.standardPricePerSqmAtTransfer = "";
  return a as unknown as AssetForm;
}

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
  /**
   * 면적 입력 시나리오 (UI 전용, API 전송 시 제외)
   * - "same"      : 취득면적 = 양도면적 (일반)
   * - "reduction" : 감환지 — 교부면적 < 권리면적 (소득령 §162의2)
   * - "partial"   : 일부 양도 — 취득 토지 중 일부만 양도
   */
  areaScenario: "same" | "reduction" | "partial";
}

/** 구형 ParcelFormItem(areaScenario 없음)을 현재 타입으로 마이그레이션 */
function migrateParcel(p: unknown): ParcelFormItem {
  const parcel = p as Record<string, unknown>;
  if (parcel.areaScenario) return parcel as unknown as ParcelFormItem;
  let areaScenario: ParcelFormItem["areaScenario"];
  if (parcel.useExchangeLandReduction) {
    areaScenario = "reduction";
  } else if (parcel.acquisitionArea && parcel.acquisitionArea === parcel.transferArea) {
    areaScenario = "same";
  } else {
    areaScenario = "partial";
  }
  return { ...(parcel as unknown as ParcelFormItem), areaScenario };
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
  temporaryTwoHouseSpecial: boolean;
  previousHouseAcquisitionDate: string;
  newHouseAcquisitionDate: string;
  marriageDate: string;
  parentalCareMergeDate: string;
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
  temporaryTwoHouseSpecial: false,
  previousHouseAcquisitionDate: "",
  newHouseAcquisitionDate: "",
  marriageDate: "",
  parentalCareMergeDate: "",
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

export interface TransferSummary {
  totalSalePrice: number;
  totalAcqPrice: number;
  totalNecessaryExpense: number;
  netTransferIncome: number;
  estimatedTax: number | null;
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
            "parcelMode" in legacyForm ||
            "acquisitionMethod" in legacyForm ||
            "appraisalValue" in legacyForm ||
            "isSelfBuilt" in legacyForm ||
            "pre1990Enabled" in legacyForm
          )
        ) {
          formData = migrateLegacyForm(legacyForm, defaultFormData);
        } else {
          formData = {
            ...defaultFormData,
            ...(ps.formData ?? {}),
          };
        }

        // Step1↔Step3 통합 후 5단계 → 4단계 인덱스 매핑
        // 0=자산 → 0, 1=취득정보(폐지) → 0, 2=보유 → 1, 3=감면 → 2, 4=가산세 → 3, 5=결과 → 4
        const STEP_MIGRATION: Record<number, number> = { 0: 0, 1: 0, 2: 1, 3: 2, 4: 3, 5: 4 };
        const persistedStep = ps.currentStep ?? 0;
        const migratedStep = STEP_MIGRATION[persistedStep] ?? Math.min(persistedStep, 4);

        return { ...current, ...ps, formData, currentStep: migratedStep };
      },
    },
  ),
);

/** useMemo 없이 사용하면 매 렌더마다 새 객체가 생성되어 무한 루프 발생.
 *  TransferTaxCalculator 에서 useMemo(() => computeTransferSummary(...), [formData, result]) 패턴으로 사용할 것. */
export function computeTransferSummary(
  formData: TransferFormData,
  result: import("@/lib/calc/transfer-tax-api").TransferAPIResult | null
): TransferSummary {
  const totalSalePrice = formData.assets.reduce(
    (acc, a) => acc + parseRaw(a.actualSalePrice),
    0
  );
  const totalAcqPrice = formData.assets.reduce(
    (acc, a) => acc + parseRaw(a.fixedAcquisitionPrice),
    0
  );
  const totalNecessaryExpense = formData.assets.reduce(
    (acc, a) => acc + parseRaw(a.directExpenses),
    0
  );
  const estimatedTax =
    result?.mode === "single" ? (result.result.totalTax ?? null) : null;
  return {
    totalSalePrice,
    totalAcqPrice,
    totalNecessaryExpense,
    netTransferIncome: totalSalePrice - totalAcqPrice - totalNecessaryExpense,
    estimatedTax,
  };
}
