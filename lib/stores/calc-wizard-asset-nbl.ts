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
  /** 거주지 좌표 (직선거리 30km 재촌 판정용, §153③3호) — 주소검색 파생. string 저장. */
  lat?: string;
  lng?: string;
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
  /** #2a 배우자 단독 보유 주택 여부 (§167의3⑨ 3주택↑ 혼인 5년내 차감 대상). 혼인합가일 입력 시에만 의미 */
  isSpouseOwned?: boolean;
  /** 상속개시일 (isInherited=true 시 상속 5년 배제 기산 — 소령 §167의3①7호). 미입력 시 배제 미발동. */
  inheritedDate?: string;
  /** 공동상속주택 여부 (§155③, 2-A2). isInherited=true 시에만 의미 */
  isCoInherited?: boolean;
  /** 공동상속 최대지분 상속인 여부 (§155③ 단서 — true=산입, false·미제공=소수지분 제외후보) */
  isLargestCoInheritedShareholder?: boolean;
  /** 상속개시 당시 피상속인과 동일세대 여부 (§155② 단서 — true=특례 원칙 배제). isInherited=true 시 의미 */
  decedentSameHouseholdAtInheritance?: boolean;
  /** 동거봉양 합가+합가 전 피상속인 보유분 여부 (§155② 단서 예외). 동일세대=true 시에만 의미 */
  parentalCareMergeInheritedHouse?: boolean;
  /** 피상속인 2주택↑ 중 순위상 상속주택 아님 (§155②1~4호 순위 부적격 — true=제외 안 함) */
  isRankingDisqualifiedInheritedHouse?: boolean;
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
  /** 사목(G) base 목 (가·다·라·마) — §167조의3①2호 사목 "해당 목의 다른 요건" 검증 대상 */
  saMokBaseArticle?: "가" | "다" | "라" | "마";
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

  // ── 소재지 주소검색 (AddressSearch 재표시 + regionCode 파생 · 공시가격/전유면적 자동조회) ──
  addressRoad?: string;
  addressJibun?: string;
  buildingName?: string;
  addressDetail?: string;
  addressDong?: string;
  addressHo?: string;
  longitude?: string;
  latitude?: string;
  /** 법정동 10자리 (PNU 앞 10자리) — §167의3 지역기준 판정. 있으면 지역 구분 자동 파생 */
  regionCode?: string;
  /** 19자리 PNU — UI 재조회용 */
  addressPnu?: string;
  /** 공시가격·전유면적을 주소조회로 자동채움한 표식 — 사용자 수정 시 제거(조회값 배지) */
  addressLookupFilled?: boolean;
  /** 공시가격 조회 기준연도 (사용자 선택) — UI 전용, 엔진 미전송 */
  officialPriceYear?: string;
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
  /** #2b 배우자 단독 보유 분양권/입주권 (§167의4⑤ 3↑ 혼인 5년내 차감 대상). 혼인합가일 입력 시에만 의미 */
  isSpouseOwned?: boolean;
  /**
   * 소재지 코드 — 공급주택 시·군·구 판정용 (인구감소지역 세컨드홈 다·라목 2호 동일 시·군·구 비교).
   * 주소검색 PNU 앞 10자리 또는 시·군·구 5자리(앞 5자리만 사용).
   */
  regionCode?: string;
  /** 소재지 주소 요약 — UI 표시 전용(AddressSearch 선택 결과). 엔진/API 미전송. */
  regionName?: string;
  /**
   * 상속받은 권리인가 — 「소득세법 시행령」 §156의2⑥·⑦ · §156의3④·⑤ (§89② 배제의 예외).
   * 순위 규칙은 미구현이라, 엔진은 이 값을 **판정 불가 신호**로만 쓴다(잘못된 배제 방지).
   */
  /**
   * 관리처분계획 인가일(「주택건설촉진법」 §33 주택재건축 사업계획승인일 포함) — **조합원입주권 전용**.
   *
   * §89②의 조합원입주권 축 시행일 게이트(법률 제7837호 부칙 §12①). 분양권은 취득일 축이라
   * 이 값을 쓰지 않는다. 미입력은 원칙(적용)으로 읽는다.
   */
  managementDisposalApprovalDate?: string;
  isInherited?: boolean;
  /**
   * §156의2⑥·⑦ · §156의3④·⑤ 상속 권리 인정 요건 — `isInherited === true`일 때만 의미.
   * 순위는 **계산하지 않고 자기선언**으로 받는다(주택 축 §155②③과 같은 규약).
   */
  isRankingDisqualifiedInheritedRight?: boolean;
  isCoInherited?: boolean;
  isLargestCoInheritedShareholder?: boolean;
  /** 피상속인이 상속개시 당시 **주택**을 소유했는가 — ⑮ 선택으로도 면제되지 않는다 */
  decedentOwnedHouseAtDeath?: boolean;
  /** 피상속인이 **다른 종류의 권리**를 소유했는가 — ⑮ 선택이 이 요건만 면제한다 */
  decedentOwnedOtherRightTypeAtDeath?: boolean;
  /** ⑥ 단서 — 상속개시 당시 상속인·피상속인이 1세대였는가 */
  decedentSameHouseholdAtInheritance?: boolean;
  /** ⑥ 단서의 예외 — 동거봉양 합가 전부터 보유하던 주택이 전환된 경우 */
  parentalCareMergeInheritedRight?: boolean;
}

/**
 * 비사업용 토지(NBL) 필드 초기값 **명세** (800줄 분리, 2026-06-15).
 *
 * ⚠️ `makeDefaultAsset`은 이 상수를 **spread하지 않는다** — 모듈 상수라
 * `nblOtherParcels: []`·`nblFactorySegments: []` 같은 배열 필드를 spread하면
 * 모든 자산이 **같은 배열 인스턴스를 공유**한다. factory는 호출마다 새 값을 만든다.
 *
 * 그래서 두 목록이 벌어질 수 있고 실제로 15필드(공장·복합용도 클러스터)가 벌어져 있었다(COV-5).
 * 일치는 `__tests__/lib/stores/nbl-defaults-and-migrate-guards.anchor.test.ts`가 강제한다 —
 * **신규 NBL 필드는 이 상수와 factory 양쪽에 넣어야 하고, 빠뜨리면 그 테스트가 실패한다.**
 */
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
  nblDeemedTransferReason: "none",
  nblDeemedTransferDate: "",
  nblUrbanIncorporationDate: "",
  nblIsMetropolitanArea: "" as "" | "yes" | "no" | "unknown",
  nblLandDivision: "" as "" | "dong" | "eup_myeon",
  nblOwnershipRatio: "",
  nblFarmingSelf: false,
  nblFarmerResidenceDistance: "",
  nblFarmlandIsWeekendFarm: false,
  nblFarmlandIsConversionApproved: false,
  nblFarmlandIsFarmDevZone: false,
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
    nblPastureHasFacility: false,
    nblPastureHasGrassland: false,
    nblPastureHasFodder: false,
  nblPastureLivestockCount: "",
  nblPastureLivestockPeriods: [] as GracePeriodInput[],
  nblPastureInheritanceDate: "",
  nblPastureIsSpecialOrgUse: false,
  nblHousingFootprint: "",
  nblVillaUsePeriods: [] as GracePeriodInput[],
  nblVillaIsEupMyeon: false,
  nblVillaIsRuralHousing: false,
  nblVillaBuildingFloorArea: "",
  nblVillaAttachedLandArea: "",
  nblVillaCombinedStdValue: "",
  nblVillaIsInRestrictedArea: false,
  nblVillaIsAfter20150101: false,
  nblOtherPropertyTaxType: "",
  nblOtherBuildingValue: "",
  nblOtherLandValue: "",
  nblOtherIsRelatedToResidence: false,
  nblOtherHasBuilding: false,
  nblOtherBuildingFloorArea: "",
  // §168의11① 호별 면적기준 (갭 3a)
  nblOtherRelatedBusinessType: "",
  nblOtherStandardAreaLimit: "",
  nblOtherMaxAnnualArea: "",
  nblOtherYouthCapacity: "",
  nblOtherMinGarageArea: "",
  nblOtherSportsFacilityType: "", nblOtherReserveUnitSize: "", nblOtherReserveFacilities: [] as string[], nblOtherSportsCategory: "workplace", nblOtherEmployeeCount: "", nblOtherEmployeeFacilityKinds: [] as string[], nblOtherResortOutdoorArea: "", nblOtherResortParkingStdArea: "", nblOtherResortBuildingArea: "", nblOtherSportsPlayerCount: "", nblOtherIndoorNotInstalled: false, nblOtherSportsExtraEvents: [] as string[], nblOtherIndoorFloorArea: "", nblOtherResortBuildingFloorArea: "",
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
  nblRevenueCurrentBusinessStartDate: "",
  nblRevenuePriorBusinessDays: "",
  nblRevenueCurrentDeposit: "",
  nblRevenueCurrentRentDays: "",
  nblRevenuePriorDeposit: "",
  nblRevenuePriorRentDays: "",
  nblRevenueCommonApportion: false,
  nblRevenueCommonRevenue: "",
  nblRevenueOtherLandValue: "",
  nblRevenuePriorCommonRevenue: "",
  nblRevenuePriorOtherLandValue: "",
  nblGracePeriods: [] as NblGracePeriodInput[],
  // §83의5① 단서 — 부동산매매업 매매용부동산(1·2호 배제) 게이트
nblOtherMixedUseMode: "",
  nblOtherMixedUseSpecificFloorArea: "",
  nblOtherMixedUseTotalFloorArea: "",
  nblOtherMixedUseSpecificFootprint: "",
  nblOtherMixedUseTotalFootprint: "",
  nblOtherUseParcels: false,
  nblOtherParcels: [],
  nblFactoryEnabled: false,
  nblFactoryLocationCategory: "",
  nblFactoryTotalLandArea: "",
  nblFactorySegments: [],
  nblFactoryIsRestrictedZone: false,
  nblFactoryAdditionalRecognizedArea: "",
  nblFactoryEmployeeSportsArea: "",
  nblFactoryFootprintArea: "",
  nblFactoryIsUnregistered: false,
  nblBusinessIsRealEstateDealer: false,
} as const satisfies Record<string, unknown>;
