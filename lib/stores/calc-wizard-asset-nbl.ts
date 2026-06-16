/**
 * 비사업용 토지(NBL) 관련 폼 타입 선언.
 * calc-wizard-asset.ts 800줄 정책에 따라 분리 (2026-05-11).
 */

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

/** 비사업용 토지(NBL) 필드 초기값 상수 — makeDefaultAsset에서 spread 사용 (800줄 분리, 2026-06-15) */
export const NBL_DEFAULTS = {
  isNonBusinessLand: false,
  nblUseDetailedJudgment: false,
  nblLandType: "" as "" | "farmland" | "forest" | "pasture" | "housing_site" | "villa_land" | "other_land",
  nblZoneType: "",
  nblBusinessUsePeriods: [] as NblBusinessUsePeriod[],
  nblLandSigunguCode: "",
  nblLandSigunguName: "",
  nblResidenceHistories: [] as ResidenceHistoryInput[],
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
  nblIsMetropolitanArea: "" as "" | "yes" | "no" | "unknown",
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
  nblPastureLivestockPeriods: [] as GracePeriodInput[],
  nblPastureInheritanceDate: "",
  nblPastureIsSpecialOrgUse: false,
  nblHousingFootprint: "",
  nblVillaUsePeriods: [] as GracePeriodInput[],
  nblVillaIsEupMyeon: false,
  nblVillaIsRuralHousing: false,
  nblVillaIsAfter20150101: false,
  nblOtherPropertyTaxType: "",
  nblOtherBuildingValue: "",
  nblOtherLandValue: "",
  nblOtherIsRelatedToResidence: false,
  // §168의11② 수입금액비율 (기타토지 — 2호다목·10·11다·12호 특정 업종)
  nblRevenueBusinessType: "" as
    | ""
    | "parking_operation"
    | "mineral_spring"
    | "fish_farm_other"
    | "block_stone_pipe_mfg"
    | "landscaping_floriculture"
    | "vehicle_repair_academy"
    | "agriculture_academy"
    | "wholesale_retail",
  nblRevenueCurrentRevenue: "",
  nblRevenueCurrentLandValue: "",
  nblRevenuePriorRevenue: "",
  nblRevenuePriorLandValue: "",
  nblGracePeriods: [] as GracePeriodInput[],
} as const satisfies Record<string, unknown>;
