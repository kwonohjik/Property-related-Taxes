/**
 * 비사업용 토지(NBL) 관련 폼 타입 선언.
 * calc-wizard-asset.ts 800줄 정책에 따라 분리 (2026-05-11).
 */

import type { RentalHousingType } from "@/lib/tax-engine/multi-house-surcharge";

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

/** 사업용 사용기간 1건 — 목장 사육기간·별장 사용기간 등 (start/end 직접 입력) */
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

/** 부득이한 사유 유예기간 1건 (§168의14①·시행규칙 §83의5①) — 종료일 사유별 자동산정 (갭 3b) */
export interface NblGracePeriodInput {
  reasonCode:
    // 시행령 §168의14① 1~3호
    | "use_prohibited"
    | "protected_zone"
    | "inherited_restricted"
    // 시행규칙 §83의5① 1~12호
    | "building_permit_restricted"
    | "construction_start_restricted"
    | "access_road"
    | "public_open_space"
    | "construction_in_progress"
    | "mortgage_or_liquidation"
    | "ownership_litigation"
    | "urban_dev_buildable"
    | "demolition"
    | "business_closure_relocation"
    | "natural_disaster_wasteland"
    | "other_justifiable";
  /** 기산일 (멸실일·건축가능일·사유발생일·event_window 개시일). 6호·5호는 취득일 자동. */
  anchorDate: string;
  /** event_window/4호 종료일. fixed 호(6/8/9/10/11)는 자동산정으로 미사용. */
  endDate: string;
  /** 5호 착공일 */
  secondaryDate?: string;
  /** 5호 건설진행종료일(선택) */
  secondaryEndDate?: string;
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
  /** 취득가액(원, 문자열) — 소형신축·준공후미분양 특례 가액 기준 (§167의3①12가·나목) */
  acquisitionPrice?: string;
  /** 전용면적(㎡, 문자열) — 소형신축 60㎡·미분양 85㎡ 판정 */
  exclusiveArea?: string;
  /** 준공후미분양 여부 (나목 §167의3①12나목) */
  isUnsoldNewHouse?: boolean;
  /** 준공일 (가목 3호 §167의3①12가목 — 2024.1.10~2027.12.31 준공). 미입력 시 가목 미발동 */
  completionDate?: string;
  /** 상속개시일 (isInherited=true 시 상속 5년 배제 기산 — 소령 §167의3①7호). 미입력 시 배제 미발동. */
  inheritedDate?: string;
  /**
   * 장기임대 등록임대 경로(legacy) 정밀 입력 — isLongTermRental=true 시.
   * 엔진 isLongTermRentalHousingExempt legacy 분기: 등록사업자 + 등록일 2종 + 임대기간 5년↑ → 배제.
   * (가~자목 9유형 세부 매트릭스는 후속 과제 — rentalType 미노출.)
   */
  isRegisteredRental?: boolean;
  /** 임대사업자 등록일 */
  rentalRegistrationDate?: string;
  /** 사업자 등록일 */
  businessRegistrationDate?: string;
  /** 임대기간(년) — 5년 이상이면 legacy 배제 충족 */
  rentalPeriodYears?: string;
  /** 임대사업자 말소일 (양도일 이전 말소 시 임대 배제 해제) */
  rentalCancelledDate?: string;

  // ── 장기임대 9유형 매트릭스 (가~자목) — 신규 18필드 ──
  /**
   * 장기임대주택 유형 (가~자목).
   * 설정 시 엔진이 유형별 정밀 검사(isLongTermRentalHousingExempt) 수행.
   * 미설정 시 legacy boolean 경로.
   */
  rentalType?: RentalHousingType;
  /** 임대료 증가율 5% 이하 충족 여부 — A·C·E·F·H·I */
  rentIncreaseUnder5Pct?: boolean;
  /** 국민주택규모(85㎡ 이하) 여부 — B */
  isNationalSizeHousing?: boolean;
  /** 같은 시·군 내 2호 이상 보유 여부 — B·C·F·I */
  hasMinimum2Units?: boolean;
  /** 같은 시·군 내 5호 이상 보유 여부 — D */
  hasMinimum5UnitsInCity?: boolean;
  /** 대지면적 (㎡, 폼 문자열) — C·D·F·I (298㎡ 이하 요건) */
  rentalLandArea?: string;
  /** 연면적 (㎡, 폼 문자열) — C·D·F·I (149㎡ 이하 요건) */
  rentalTotalFloorArea?: string;
  /** 분양전환 여부 — C·F */
  isConvertedToSale?: boolean;
  /** 최초 분양계약일 (YYYY-MM-DD) — D */
  firstSaleContractDate?: string;
  /** 취득 당시 공시가격 (원, 폼 문자열) — B·D */
  acquisitionOfficialPrice?: string;
  /** 임대개시 당시 공시가격 (원, 폼 문자열) — A·C·E·F·H·I */
  rentalStartOfficialPrice?: string;
  /** 임대의무기간 1/2 이상 충족 여부 — G */
  hasHalfDutyPeriodMet?: boolean;
  /** 말소일 이후 1년 이내 양도 여부 — G */
  isSoldWithin1YearOfCancellation?: boolean;
  /** 자진·자동 말소일 (YYYY-MM-DD) — G (rentalCancelledDate와 별개) */
  rentalCancellationDate?: string;
  /** 2018.9.14 이후 조정지역 취득 제외 해당 여부 — E·H */
  isExcluded918Rule?: boolean;
  /** 2020.7.11 이후 등록 아파트 제외 해당 여부 — D·E */
  isExcludedAfter20200711Apt?: boolean;
  /** 단기→장기 변경신고 제외 해당 여부 — E·F */
  isExcludedShortToLongChange?: boolean;
  /** 계약금 지급 증빙 보유 여부 — H (조정지역 2018.9.14 취득 예외) */
  hasContractDepositProof?: boolean;

  // ── P2 특수 배제 사유 (다른 보유 주택 기준 — 2주택 전용·인구감소) ──
  /** 부득이한 사유(취학·근무·질병) 취득 주택 — 소령 §167의10①3호 (기준시가 3억↓·1년↑ 거주) */
  isUnavoidableReason?: boolean;
  /** 부득이한 사유 주택 거주기간(년) — 1년 이상 요건 */
  unavoidableResidenceYears?: string;
  /** 부득이한 사유 해소일 (YYYY-MM-DD) — 해소 후 3년 이내 양도 시 배제 유지 */
  unavoidableReasonResolvedDate?: string;
  /** 소송으로 취득/소송 진행 중 주택 — 소령 §167의10①8호 */
  isLitigationHousing?: boolean;
  /** 소송 취득일 (YYYY-MM-DD) — 3년 이내면 배제 (미입력=소송 진행 중) */
  litigationAcquisitionDate?: string;
  /** 정비구역(재개발·재건축) 지정 주택 — 기준시가 1억↓ 소형 배제에서 제외(정비구역은 산입) */
  isRedevelopmentZone?: boolean;
  /** 인구감소지역 소재 주택 — 소령 §167의3①12 다·라목 (세컨드홈 특례) */
  isPopulationDeclineArea?: boolean;
  /** 세컨드홈 특례 등록 여부 — 인구감소지역 주택 수 제외 신청 */
  isSecondHomeRegistered?: boolean;
  /** 인구감소지역 유형 (다목 decline 9억 / 라목 interest 4억) — 가액한도 구분 */
  populationAreaType?: "decline" | "interest";
}

/**
 * 세대 보유 분양권·입주권 항목 (폼 문자열 버전).
 * 소령 §167의11·§167의3①: 2021.1.1 이후 취득분은 주택 수 산정에 포함.
 */
export interface PresaleRightEntry {
  id: string;
  /** 분양권 / 입주권(재개발·재건축 조합원입주권) */
  type: "presale_right" | "redevelopment_right";
  acquisitionDate: string;
  region: "capital" | "non_capital";
  /** 지역기준 (REGION 수도권·광역시·세종 / VALUE 지방) — 3억 배제 판정 (§167의4②1호) */
  regionCriteria?: "REGION" | "VALUE";
  /** 가액(원, 문자열) — 분양권 공급가격/입주권 종전주택가격 */
  rightValue?: string;
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
  nblExemptInong: false,
  nblExemptInongDate: "",
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
  // §168의11① 호별 면적기준 (갭 3a)
  nblOtherRelatedBusinessType: "",
  nblOtherStandardAreaLimit: "",
  nblOtherMaxAnnualArea: "",
  nblOtherYouthCapacity: "",
  nblOtherMinGarageArea: "",
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
  nblGracePeriods: [] as NblGracePeriodInput[],
  // §83의5① 단서 — 부동산매매업 매매용부동산(1·2호 배제) 게이트
  nblBusinessIsRealEstateDealer: false,
} as const satisfies Record<string, unknown>;
