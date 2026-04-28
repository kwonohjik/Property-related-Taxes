/**
 * AssetForm 관련 타입·팩토리·마이그레이션
 * calc-wizard-store.ts 800줄 정책에 따라 분리.
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
export function migrateParcel(p: unknown): ParcelFormItem {
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

  // ── 토지/건물 취득일 분리 (housing·building 공통) ──
  /**
   * 토지·건물의 소유자가 다른 경우 본인 소유 부분 지정 (소령 §166⑥, §168②).
   * "both" (기본): 토지·건물 모두 본인.
   * "building_only": 건물만 본인 (토지는 배우자·타인 소유).
   * "land_only": 토지만 본인.
   */
  selfOwns: "both" | "building_only" | "land_only";
  /** 토지와 건물의 취득일이 다른지 여부 (원시취득·신축 등) */
  hasSeperateLandAcquisitionDate: boolean;
  /** 토지 취득일 (YYYY-MM-DD) — hasSeperateLandAcquisitionDate === true 시 필수 */
  landAcquisitionDate: string;
  /** 가액 분리 방식: "apportioned"(기준시가 비율 자동 안분) | "actual"(직접 입력) */
  landSplitMode: "apportioned" | "actual";
  /** 토지 양도가액 (실제 모드 또는 안분 override) */
  landTransferPrice: string;
  /** 건물 양도가액 (실제 모드 또는 안분 override) */
  buildingTransferPrice: string;
  /** 토지 취득가액 (실거래가 모드 시) */
  landAcquisitionPrice: string;
  /** 건물 취득가액 (실거래가 모드 시) */
  buildingAcquisitionPrice: string;
  /** 토지 자본적지출·필요경비 */
  landDirectExpenses: string;
  /** 건물 자본적지출·필요경비 */
  buildingDirectExpenses: string;
  /** 토지 양도시 기준시가 — 환산취득가 분리 계산 시 사용 */
  landStandardPriceAtTransfer: string;
  /** 건물 양도시 기준시가 — 환산취득가 분리 계산 시 사용 */
  buildingStandardPriceAtTransfer: string;

  // ── 개별주택가격 미공시 취득 환산 (§164⑤) ──
  /** true 시 3-시점 미공시 취득 환산 모드 활성화 */
  usePreHousingDisclosure: boolean;
  /** 최초 고시일 (YYYY-MM-DD, 사용자 직접 입력) */
  phdFirstDisclosureDate: string;
  /** 최초 고시 개별주택가격 P_F (원) */
  phdFirstDisclosureHousingPrice: string;
  /** 취득당시 선택 연도 (문자열 "2013" 등, 자동추천 또는 수동 변경) */
  phdLandPriceYearAtAcq: string;
  /** true = 수동 변경됨, false = 자동추천 */
  phdLandPriceYearAtAcqIsManual: boolean;
  /** 취득당시 토지 단위 공시지가 (원/㎡) */
  phdLandPricePerSqmAtAcq: string;
  /** 취득당시 건물 기준시가 (원) */
  phdBuildingStdPriceAtAcq: string;
  /** 최초공시일 선택 연도 */
  phdLandPriceYearAtFirst: string;
  /** true = 수동 변경됨 */
  phdLandPriceYearAtFirstIsManual: boolean;
  /** 최초공시일 토지 단위 공시지가 (원/㎡) */
  phdLandPricePerSqmAtFirst: string;
  /** 최초공시일 건물 기준시가 (원) */
  phdBuildingStdPriceAtFirst: string;
  /** 양도시 개별주택가격 P_T (원) */
  phdTransferHousingPrice: string;
  /** 양도시 선택 연도 */
  phdLandPriceYearAtTransfer: string;
  /** true = 수동 변경됨 */
  phdLandPriceYearAtTransferIsManual: boolean;
  /** 양도시 토지 단위 공시지가 (원/㎡) */
  phdLandPricePerSqmAtTransfer: string;
  /** 양도시 건물 기준시가 (원) */
  phdBuildingStdPriceAtTransfer: string;

  /** 매매 estimated 시 취득시점 기준시가 (원, 환산 분자) */
  standardPriceAtAcq: string;
  /** 취득시 기준시가 레이블 (API 조회 결과 표시용) */
  standardPriceAtAcqLabel: string;

  /** 취득 시점 ㎡당 공시지가 (원/㎡, 토지·비주거건물 전용) */
  standardPricePerSqmAtAcq: string;
  /** 양도 시점 ㎡당 공시지가 (원/㎡, 토지·비주거건물 전용) */
  standardPricePerSqmAtTransfer: string;

  // ── 상속 주택 환산취득가 보조 입력 (주택 자산 + 상속개시일 < 2005-04-30) ──
  /** true 시 3-시점 보조 계산 활성화 */
  inhHouseValEnabled: boolean;
  /** 최초 고시일 (기본 "2005-04-30") */
  inhHouseValFirstDisclosureDate: string;
  /** 토지 면적 (㎡) */
  inhHouseValLandArea: string;
  /** 양도시 개별공시지가 (원/㎡) */
  inhHouseValLandPricePerSqmAtTransfer: string;
  /** 최초고시 시점 개별공시지가 (원/㎡) */
  inhHouseValLandPricePerSqmAtFirst: string;
  /** 상속개시일 시점 개별공시지가 (원/㎡) — 1990-08-30 이후 시 직접 입력 */
  inhHouseValLandPricePerSqmAtInheritance: string;
  /** 양도시 개별주택가격 (원) */
  inhHouseValHousePriceAtTransfer: string;
  /** 최초고시 시점 개별주택가격 (원) */
  inhHouseValHousePriceAtFirst: string;
  /** 양도당시 건물기준시가 (원) — 국세청 기준시가. 양도시 합계 기준시가의 건물 성분 */
  inhHouseValBuildingStdPriceAtTransfer: string;
  /** 최초고시 시점 건물기준시가 (원) — §164⑤ Sum_F 분모: 토지기준시가 + 이 값. 국세청 기준시가 */
  inhHouseValBuildingStdPriceAtFirst: string;
  /** 상속개시일 시점 건물기준시가 (원) — §164⑤ Sum_A 분자의 건물 성분. 국세청 기준시가 */
  inhHouseValBuildingStdPriceAtInheritance: string;
  /** 상속개시일 시점 주택가격 직접 입력 override 사용 여부 */
  inhHouseValUseHousePriceOverride: boolean;
  /** 상속개시일 시점 주택가격 직접 입력 override (원) */
  inhHouseValHousePriceAtInheritanceOverride: string;
  // 1990-08-30 이전 토지 등급가액 환산은 기존 pre1990* 7필드 재사용

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
  nblForestInheritanceDate: string;

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

  // ── 상속 부동산 취득가액 의제 (소령 §176조의2④·§163⑨) ──
  /**
   * 의제취득일(1985.1.1.) 기준 자동 분기 결과 (UI read-only).
   * - "pre-deemed": 상속개시일 < 1985-01-01 → max(환산가액, 실가×물가상승률)
   * - "post-deemed": 상속개시일 ≥ 1985-01-01 → 상속세 신고가액
   * - null: 상속개시일 미입력 또는 미적용
   */
  inheritanceMode: "pre-deemed" | "post-deemed" | null;
  /** 상속개시일 (YYYY-MM-DD, 피상속인 사망일) */
  inheritanceStartDate: string;
  /** 피상속인 실지취득가액 입증 가능 여부 (case A 전용) */
  hasDecedentActualPrice: boolean;
  /** 피상속인 실지취득가액 (원 단위 문자열, hasDecedentActualPrice=true 시) */
  decedentAcquisitionPrice: string;
  /** 상속세 신고가액 (원 단위 문자열, case B) */
  inheritanceReportedValue: string;
  /** 상속세 신고 시 적용한 평가방법 (case B) */
  inheritanceValuationMethod:
    | "market_value"
    | "appraisal"
    | "auction_public_sale"
    | "similar_sale"
    | "supplementary"
    | "";
  /** 평가 근거 메모 (감정평가서 번호·매매사례 일자 등, 선택) */
  inheritanceValuationEvidence: string;
  /** 보충적평가 보조계산 사용 여부 (case B + supplementary 선택 시) */
  useSupplementaryHelper: boolean;
  /** 보조계산: 토지 면적 (㎡) */
  supplementaryLandArea: string;
  /** 보조계산: 개별공시지가 (원/㎡) */
  supplementaryLandUnitPrice: string;
  /** 보조계산: 건물 공시가격 (원 총액) */
  supplementaryBuildingValue: string;
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
    selfOwns: "both",
    hasSeperateLandAcquisitionDate: false,
    landAcquisitionDate: "",
    landSplitMode: "apportioned",
    usePreHousingDisclosure: false,
    phdFirstDisclosureDate: "",
    phdFirstDisclosureHousingPrice: "",
    phdLandPriceYearAtAcq: "",
    phdLandPriceYearAtAcqIsManual: false,
    phdLandPricePerSqmAtAcq: "",
    phdBuildingStdPriceAtAcq: "",
    phdLandPriceYearAtFirst: "",
    phdLandPriceYearAtFirstIsManual: false,
    phdLandPricePerSqmAtFirst: "",
    phdBuildingStdPriceAtFirst: "",
    phdTransferHousingPrice: "",
    phdLandPriceYearAtTransfer: "",
    phdLandPriceYearAtTransferIsManual: false,
    phdLandPricePerSqmAtTransfer: "",
    phdBuildingStdPriceAtTransfer: "",
    landTransferPrice: "",
    buildingTransferPrice: "",
    landAcquisitionPrice: "",
    buildingAcquisitionPrice: "",
    landDirectExpenses: "",
    buildingDirectExpenses: "",
    landStandardPriceAtTransfer: "",
    buildingStandardPriceAtTransfer: "",
    standardPriceAtAcq: "",
    standardPriceAtAcqLabel: "",
    standardPricePerSqmAtAcq: "",
    standardPricePerSqmAtTransfer: "",
    inhHouseValEnabled: false,
    inhHouseValFirstDisclosureDate: "2005-04-30",
    inhHouseValLandArea: "",
    inhHouseValLandPricePerSqmAtTransfer: "",
    inhHouseValLandPricePerSqmAtFirst: "",
    inhHouseValLandPricePerSqmAtInheritance: "",
    inhHouseValHousePriceAtTransfer: "",
    inhHouseValHousePriceAtFirst: "",
    inhHouseValBuildingStdPriceAtTransfer: "",
    inhHouseValBuildingStdPriceAtFirst: "",
    inhHouseValBuildingStdPriceAtInheritance: "",
    inhHouseValUseHousePriceOverride: false,
    inhHouseValHousePriceAtInheritanceOverride: "",
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
    // ── 상속 부동산 취득가액 의제 ──
    inheritanceMode: null,
    inheritanceStartDate: "",
    hasDecedentActualPrice: false,
    decedentAcquisitionPrice: "",
    inheritanceReportedValue: "",
    inheritanceValuationMethod: "",
    inheritanceValuationEvidence: "",
    useSupplementaryHelper: false,
    supplementaryLandArea: "",
    supplementaryLandUnitPrice: "",
    supplementaryBuildingValue: "",
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
  if (a.landAreaM2 && !a.acquisitionArea) {
    a.acquisitionArea = a.landAreaM2;
    a.transferArea = a.landAreaM2;
  }
  delete a.landAreaM2;
  delete a.pre1990AreaSqm;
  if (!a.areaScenario) {
    a.areaScenario =
      a.acquisitionArea && a.transferArea && a.acquisitionArea !== a.transferArea
        ? "partial"
        : "same";
  }
  if (!a.standardPricePerSqmAtAcq) a.standardPricePerSqmAtAcq = "";
  if (!a.standardPricePerSqmAtTransfer) a.standardPricePerSqmAtTransfer = "";
  if (!a.selfOwns) a.selfOwns = "both";
  if (a.hasSeperateLandAcquisitionDate === undefined) a.hasSeperateLandAcquisitionDate = false;
  if (!a.landAcquisitionDate) a.landAcquisitionDate = "";
  if (!a.landSplitMode) a.landSplitMode = "apportioned";
  if (!a.landTransferPrice) a.landTransferPrice = "";
  if (!a.buildingTransferPrice) a.buildingTransferPrice = "";
  if (!a.landAcquisitionPrice) a.landAcquisitionPrice = "";
  if (!a.buildingAcquisitionPrice) a.buildingAcquisitionPrice = "";
  if (!a.landDirectExpenses) a.landDirectExpenses = "";
  if (!a.buildingDirectExpenses) a.buildingDirectExpenses = "";
  if (!a.landStandardPriceAtTransfer) a.landStandardPriceAtTransfer = "";
  if (!a.buildingStandardPriceAtTransfer) a.buildingStandardPriceAtTransfer = "";
  // §164⑤ 미공시 취득 환산 필드
  if (a.usePreHousingDisclosure === undefined) a.usePreHousingDisclosure = false;
  if (!a.phdFirstDisclosureDate) a.phdFirstDisclosureDate = "";
  if (!a.phdFirstDisclosureHousingPrice) a.phdFirstDisclosureHousingPrice = "";
  if (!a.phdLandPriceYearAtAcq) a.phdLandPriceYearAtAcq = "";
  if (a.phdLandPriceYearAtAcqIsManual === undefined) a.phdLandPriceYearAtAcqIsManual = false;
  if (!a.phdLandPricePerSqmAtAcq) a.phdLandPricePerSqmAtAcq = "";
  if (!a.phdBuildingStdPriceAtAcq) a.phdBuildingStdPriceAtAcq = "";
  if (!a.phdLandPriceYearAtFirst) a.phdLandPriceYearAtFirst = "";
  if (a.phdLandPriceYearAtFirstIsManual === undefined) a.phdLandPriceYearAtFirstIsManual = false;
  if (!a.phdLandPricePerSqmAtFirst) a.phdLandPricePerSqmAtFirst = "";
  if (!a.phdBuildingStdPriceAtFirst) a.phdBuildingStdPriceAtFirst = "";
  if (!a.phdTransferHousingPrice) a.phdTransferHousingPrice = "";
  if (!a.phdLandPriceYearAtTransfer) a.phdLandPriceYearAtTransfer = "";
  if (a.phdLandPriceYearAtTransferIsManual === undefined) a.phdLandPriceYearAtTransferIsManual = false;
  if (!a.phdLandPricePerSqmAtTransfer) a.phdLandPricePerSqmAtTransfer = "";
  if (!a.phdBuildingStdPriceAtTransfer) a.phdBuildingStdPriceAtTransfer = "";
  // 상속 취득가액 의제 필드
  if (a.inheritanceMode === undefined) a.inheritanceMode = null;
  if (!a.inheritanceStartDate) a.inheritanceStartDate = "";
  if (a.hasDecedentActualPrice === undefined) a.hasDecedentActualPrice = false;
  if (!a.decedentAcquisitionPrice) a.decedentAcquisitionPrice = "";
  if (!a.inheritanceReportedValue) a.inheritanceReportedValue = "";
  if (!a.inheritanceValuationMethod) a.inheritanceValuationMethod = "";
  if (!a.inheritanceValuationEvidence) a.inheritanceValuationEvidence = "";
  if (a.useSupplementaryHelper === undefined) a.useSupplementaryHelper = false;
  if (!a.supplementaryLandArea) a.supplementaryLandArea = "";
  if (!a.supplementaryLandUnitPrice) a.supplementaryLandUnitPrice = "";
  if (!a.supplementaryBuildingValue) a.supplementaryBuildingValue = "";
  // 상속 주택 환산취득가 보조 입력 필드
  if (a.inhHouseValEnabled === undefined) a.inhHouseValEnabled = false;
  if (!a.inhHouseValFirstDisclosureDate) a.inhHouseValFirstDisclosureDate = "2005-04-30";
  if (!a.inhHouseValLandArea) a.inhHouseValLandArea = "";
  if (!a.inhHouseValLandPricePerSqmAtTransfer) a.inhHouseValLandPricePerSqmAtTransfer = "";
  if (!a.inhHouseValLandPricePerSqmAtFirst) a.inhHouseValLandPricePerSqmAtFirst = "";
  if (!a.inhHouseValLandPricePerSqmAtInheritance) a.inhHouseValLandPricePerSqmAtInheritance = "";
  if (!a.inhHouseValHousePriceAtTransfer) a.inhHouseValHousePriceAtTransfer = "";
  if (!a.inhHouseValHousePriceAtFirst) a.inhHouseValHousePriceAtFirst = "";
  if (!a.inhHouseValBuildingStdPriceAtTransfer) a.inhHouseValBuildingStdPriceAtTransfer = "";
  if (!a.inhHouseValBuildingStdPriceAtFirst) a.inhHouseValBuildingStdPriceAtFirst = "";
  if (!a.inhHouseValBuildingStdPriceAtInheritance) a.inhHouseValBuildingStdPriceAtInheritance = "";
  if (a.inhHouseValUseHousePriceOverride === undefined) a.inhHouseValUseHousePriceOverride = false;
  if (!a.inhHouseValHousePriceAtInheritanceOverride) a.inhHouseValHousePriceAtInheritanceOverride = "";
  return a as unknown as AssetForm;
}
